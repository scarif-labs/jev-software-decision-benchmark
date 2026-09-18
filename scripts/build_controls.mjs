// Stage 3: build a verified non-breaking control set from real merged dependency
// update PRs in the same repositories as BUMP, excluding every verified breaking PR.
//
// Verification applied before a control is admitted:
//   1. The PR was merged.
//   2. It is not one of the BUMP breaking PRs (by PR number or head SHA).
//   3. If the repo reports CI checks on the head commit, every check succeeded.
//   4. No revert commit touching the changed manifest references the PR or dependency
//      inside a fixed observation window.
//   5. The updated version is still present on the default branch (not downgraded).
//
// `verificationTier` records how much evidence backed the label:
//   A = merged + all CI checks succeeded + no revert + new version still present
//   B = merged + no CI checks configured + no revert + new version still present
//   C = merged + no revert signal, but version presence could not be confirmed
//
// The pool is built across all repos and then selected round-robin so the control
// set is spread over repositories rather than concentrated in a few. Near-duplicate
// updates (same repo + dependency + new version) are collapsed.
import fs from 'node:fs/promises';
import path from 'node:path';
import { gh, gql, mapLimit, readJsonl, writeJsonl } from './lib/gh.mjs';

const OUT = path.resolve(process.env.OUT ?? 'data/control.cases.jsonl');
const BUMP_CASES = path.resolve(process.env.BUMP_CASES ?? 'data/bump.cases.jsonl');
const TARGET = Number(process.env.CONTROLS_TARGET ?? 600);
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 6);
const WINDOW_DAYS = Number(process.env.REVERT_WINDOW_DAYS ?? 90);
const PR_PAGES = Number(process.env.PR_PAGES ?? 3);
const MAX_PER_REPO = Number(process.env.MAX_PER_REPO ?? 10);

const BOT_AUTHORS = new Set([
  'dependabot[bot]', 'dependabot-preview[bot]', 'renovate[bot]', 'renovate-bot',
  'snyk-bot', 'greenkeeper[bot]', 'depfu[bot]', 'scala-steward', 'web-flow',
]);
const MANIFEST_RE =
  /(^|\/)(pom\.xml|.*\.gradle(\.kts)?|package\.json|requirements\.txt|pyproject\.toml|Cargo\.toml|go\.mod|Gemfile|build\.sbt|.*\.csproj|packages\.config)$/i;

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const sleep = ms => new Promise(r => setTimeout(r, ms));

function parseBump(title) {
  if (!title) return {};
  const t = title.replace(/\s+in\s+\/[^\s]*\s*$/i, '');
  const patterns = [
    /(?:bump|update|upgrade)\s+(?:dependency\s+)?([^\s]+)\s+from\s+v?([^\s]+?)\s+to\s+v?([^\s]+)/i,
    /(?:bump|update|upgrade)\s+(?:dependency\s+)?([^\s]+)\s+to\s+v?([^\s]+)/i,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m) {
      const dep = m[1].replace(/[,;]$/, '');
      if (/^[^\s]+$/.test(dep)) {
        return m.length === 4
          ? { dependency: dep, previousVersion: m[2], newVersion: m[3] }
          : { dependency: dep, newVersion: m[2] };
      }
    }
  }
  return {};
}

function parseBumpFromBody(body) {
  if (!body) return {};
  const m = body.match(/Bumps?\s+\[?([^\]\s]+)\]?[^\n]*?\bfrom\s+v?([^\s]+)\s+to\s+v?([^\s]+)/i);
  if (m) return { dependency: m[1], previousVersion: m[2], newVersion: m[3] };
  return {};
}

function semverType(prev, next) {
  const clean = v => String(v ?? '').replace(/^v/, '').split(/[.\-+]/).map(x => (/^\d+$/.test(x) ? Number(x) : x));
  const a = clean(prev), b = clean(next);
  if (!a.length || !b.length) return undefined;
  const num = x => (typeof x === 'number' ? x : 0);
  if (num(b[0]) > num(a[0])) return 'major';
  if (num(b[0]) === num(a[0]) && num(b[1]) > num(a[1])) return 'minor';
  if (num(b[0]) === num(a[0]) && num(b[1]) === num(a[1])) return 'patch';
  return 'other';
}

function decodeEntities(s) {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}
function extractChangelog(body) {
  if (!body) return undefined;
  const releaseNotes = body.match(/<summary>\s*Release notes\s*<\/summary>([\s\S]*?)<\/details>/i);
  const commits = body.match(/<summary>\s*(Commits|Changes)\s*<\/summary>([\s\S]*?)<\/details>/i);
  const raw = releaseNotes?.[1] ?? commits?.[1] ?? null;
  if (!raw) return undefined;
  const text = decodeEntities(raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).trim();
  return text ? text.slice(0, 3000) : undefined;
}
function extractDepSlug(body) {
  if (!body) return undefined;
  const links = [...body.matchAll(/https:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/g)].map(m => m[1]);
  return links.find(l => !/dependabot|renovate|githubapp\.com|/i.test(l)) ?? links[0];
}
async function releaseNotes(slug, version) {
  if (!slug || !version) return undefined;
  for (const tag of [`v${version}`, version]) {
    try {
      const rel = await gh(`/repos/${slug}/releases/tags/${encodeURIComponent(tag)}`);
      if (rel?.body) return `Release ${rel.tag_name}: ${rel.name ?? ''}\n${String(rel.body).slice(0, 2500)}`.trim();
    } catch { /* ignore */ }
  }
  return undefined;
}

const GRAPHQL_PRS = `query($owner:String!,$name:String!,$cursor:String){
  repository(owner:$owner,name:$name){
    defaultBranchRef{name}
    pullRequests(states:MERGED, first:100, after:$cursor, orderBy:{field:UPDATED_AT,direction:DESC}){
      pageInfo{hasNextPage endCursor}
      nodes{
        number title body mergedAt createdAt baseRefName headRefOid
        author{login}
        labels(first:20){nodes{name}}
        changedFiles additions deletions
        commits(last:1){nodes{commit{statusCheckRollup{state}}}}
      }
    }
  }
}`;

function rollupState(node) {
  const s = node?.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state ?? null;
  if (s === 'SUCCESS') return 'success';
  if (s === 'FAILURE' || s === 'ERROR') return 'failure';
  if (s === 'PENDING' || s === 'EXPECTED') return 'pending';
  return 'none';
}

async function listMergedPrs(repo, maxPages = PR_PAGES) {
  const [owner, name] = repo.split('/');
  const nodes = [];
  let cursor = null;
  let defaultBranch = null;
  for (let page = 0; page < maxPages; page++) {
    const res = await gql(GRAPHQL_PRS, { owner, name, cursor });
    const r = res.data.repository;
    if (!r) break;
    defaultBranch = defaultBranch ?? r.defaultBranchRef?.name ?? null;
    for (const n of r.pullRequests.nodes) nodes.push(n);
    if (!r.pullRequests.pageInfo.hasNextPage) break;
    cursor = r.pullRequests.pageInfo.endCursor;
  }
  return { nodes, defaultBranch };
}

function isCandidate(n) {
  const labels = (n.labels?.nodes ?? []).map(l => l.name.toLowerCase());
  if (BOT_AUTHORS.has(n.author?.login ?? '')) return true;
  if (labels.includes('dependencies')) return true;
  if (/(deps|dependencies|dependabot|renovate)/i.test(n.title ?? '') && /\bto\b/i.test(n.title ?? '')) return true;
  return false;
}

async function verifyAndBuild(repo, n, defaultBranch, breakingKeys) {
  const files = await gh(`/repos/${repo}/pulls/${n.number}/files?per_page=100`);
  const manifests = (files ?? []).filter(f => MANIFEST_RE.test(f.filename) && f.status !== 'removed');
  if (manifests.length === 0) return null;

  const diffPatches = manifests.map(f => f.patch ?? '').join('\n');
  const manifestDiff = manifests
    .map(f => `--- ${f.filename}\n${f.patch ?? '(no textual diff)'}`)
    .join('\n')
    .slice(0, 4000);

  let { dependency, previousVersion, newVersion } = { ...parseBump(n.title), ...parseBumpFromBody(n.body) };
  if (!newVersion) {
    newVersion = diffPatches.match(/^\+\s*[^\n]*?(\d+\.\d+[^\s"'<>]*)/m)?.[1];
    previousVersion = previousVersion ?? diffPatches.match(/^-\s*[^\n]*?(\d+\.\d+[^\s"'<>]*)/m)?.[1];
  }

  const since = new Date(new Date(n.mergedAt).getTime() - 60000).toISOString();
  const until = new Date(new Date(n.mergedAt).getTime() + WINDOW_DAYS * 86400000).toISOString();
  const commits = await gh(
    `/repos/${repo}/commits?path=${encodeURIComponent(manifests[0].filename)}&since=${since}&until=${until}&per_page=100`,
  );
  const artifact = (dependency ?? '').split(':').pop() ?? '';
  const revertCommits = (commits ?? []).filter(c => /revert/i.test(c.commit?.message ?? ''));
  const reverted = revertCommits.some(c => {
    const m = c.commit.message;
    return (artifact && m.includes(artifact)) || new RegExp(`#${n.number}\\b`).test(m) ||
      (newVersion && new RegExp(escapeRe(newVersion)).test(m));
  });

  let versionState = 'unknown';
  if (newVersion || previousVersion) {
    const contentRes = await gh(`/repos/${repo}/contents/${manifests[0].filename}?ref=${encodeURIComponent(defaultBranch)}`);
    if (contentRes?.content) {
      const text = Buffer.from(contentRes.content, 'base64').toString('utf8');
      const has = v => v && new RegExp(`(^|[^\\w.])${escapeRe(String(v).replace(/^v/, ''))}([^\\w.]|$)`).test(text);
      if (has(newVersion)) versionState = 'present';
      else if (has(previousVersion)) versionState = 'reverted';
      else versionState = 'superseded-or-absent';
    }
  }

  const checksState = rollupState(n);
  const verified = !reverted && versionState !== 'reverted' && checksState !== 'failure' && checksState !== 'pending';
  if (!verified) return null;

  let verificationTier = 'C';
  if (checksState === 'success' && versionState === 'present') verificationTier = 'A';
  else if (checksState === 'none' && versionState === 'present') verificationTier = 'B';

  const labels = (n.labels?.nodes ?? []).map(l => l.name);
  const securityUpdate = labels.some(l => /security/i.test(l)) || /security/i.test(n.title ?? '');
  const changelog = extractChangelog(n.body);

  return {
    id: `ctrl-${repo.replace('/', '_')}-${n.number}`,
    dataset: 'control',
    repo,
    ecosystem: 'java',
    packageManager: 'maven',
    dependency,
    previousVersion,
    newVersion,
    updateType: semverType(previousVersion, newVersion),
    scope: undefined,
    dependencySection: undefined,
    directDependency: undefined,
    title: n.title,
    body: n.body ? String(n.body).slice(0, 6000) : undefined,
    manifestDiff,
    changelog,
    checks: checksState === 'none' ? 'no checks reported for the head commit' : `${checksState} status check rollup on the head commit`,
    securityUpdate,
    source: 'github-control',
    gold: 'AUTO_MERGE',
    verificationTier,
    outcome: {
      merged: true,
      mergedAt: n.mergedAt,
      createdAt: n.createdAt,
      checkState: checksState,
      ciPassedBeforeMerge: checksState === 'success',
      headSha: n.headRefOid,
      baseRef: n.baseRefName,
      labels,
      reverted,
      versionState,
      revertCommits: revertCommits.map(c => c.sha).slice(0, 5),
    },
  };
}

function dedupeKey(c) {
  return `${c.repo}|${c.dependency ?? '?'}|${c.newVersion ?? '?'}`;
}

async function main() {
  const bump = await readJsonl(BUMP_CASES);
  const breakingKeys = new Set();
  for (const c of bump) {
    if (c.prNumber) breakingKeys.add(`${c.repo}#${c.prNumber}`);
    if (c.outcome?.headSha) breakingKeys.add(c.outcome.headSha);
  }
  const repoCounts = new Map();
  for (const c of bump) repoCounts.set(c.repo, (repoCounts.get(c.repo) ?? 0) + 1);
  const repos = [...repoCounts.entries()].sort((a, b) => b[1] - a[1]).map(([r]) => r);

  console.error(`[control] pooling across ${repos.length} repos (max ${MAX_PER_REPO}/repo)`);

  const pool = [];
  const seen = new Set();
  for (const repo of repos) {
    let listed;
    try {
      listed = await listMergedPrs(repo);
    } catch (err) {
      console.error(`[control] list failed ${repo}: ${String(err).slice(0, 120)}`);
      continue;
    }
    const candidates = listed.nodes
      .filter(n => !breakingKeys.has(`${repo}#${n.number}`) && !breakingKeys.has(n.headRefOid))
      .filter(isCandidate)
      .slice(0, MAX_PER_REPO);

    const built = await mapLimit(candidates, CONCURRENCY, async n => {
      try {
        return await verifyAndBuild(repo, n, listed.defaultBranch, breakingKeys);
      } catch (err) {
        console.error(`[control] ${repo}#${n.number} failed: ${String(err).slice(0, 120)}`);
        return null;
      }
    });

    let added = 0;
    for (const c of built) {
      if (!c || seen.has(dedupeKey(c))) continue;
      seen.add(dedupeKey(c));
      pool.push(c);
      added++;
    }
    console.error(`[control] ${repo}: +${added} (pool ${pool.length})`);
  }

  // Round-robin select so the target set is spread across repositories.
  const byRepo = new Map();
  for (const c of pool) {
    if (!byRepo.has(c.repo)) byRepo.set(c.repo, []);
    byRepo.get(c.repo).push(c);
  }
  for (const arr of byRepo.values()) arr.sort((a, b) => a.id.localeCompare(b.id));

  const controls = [];
  let more = true;
  while (controls.length < TARGET && more) {
    more = false;
    for (const arr of byRepo.values()) {
      const c = arr.shift();
      if (c) {
        controls.push(c);
        more = true;
      }
      if (controls.length >= TARGET) break;
    }
  }

  await writeJsonl(OUT.replace(/\.jsonl$/, '.pool.jsonl'), pool);

  // Fetch dependency release notes only for the selected controls (network-bound).
  let enriched = 0;
  await mapLimit(controls, CONCURRENCY, async c => {
    if (c.changelog) return;
    const notes = await releaseNotes(extractDepSlug(c.body), c.newVersion);
    if (notes) c.changelog = notes;
    if (++enriched % 50 === 0) console.error(`[control] release notes ${enriched}`);
  });

  await writeJsonl(OUT, controls);
  console.error(`[control] pool ${pool.length}, wrote ${controls.length} controls across ${byRepo.size} repos -> ${OUT}`);
}

await main();

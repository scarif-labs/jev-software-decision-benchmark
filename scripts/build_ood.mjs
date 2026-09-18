// Build an out-of-distribution dependency-update dataset, independent of BUMP.
//
// BREAKING evidence: a merged/reverted dependency bump — a commit whose message reverts
// a dependency update ("Revert \"build(deps): bump X from A to B\""). The revert is an
// independent negative outcome produced by the project itself, not a BUMP reproduction.
//
// CONTROLS: merged dependency-update PRs from the same independent repositories, verified
// non-breaking with the same standard as the original controls (applied, no revert, no
// downgrade, no failing checks).
//
// Pre-merge state uses the same projection as the original benchmark; only fields that
// were available before the outcome are recorded.
import fs from 'node:fs/promises';
import path from 'node:path';
import { gh, gql, mapLimit, readJsonl, writeJsonl } from './lib/gh.mjs';

const OUT = path.resolve(process.env.OUT ?? 'data/ood-dataset.jsonl');
const BUMP = path.resolve(process.env.BUMP_CASES ?? 'data/dataset.jsonl');
const BREAK_TARGET = Number(process.env.BREAK_TARGET ?? 100);
const CTRL_TARGET = Number(process.env.CTRL_TARGET ?? 100);
const SEED_PAGES = Number(process.env.SEED_PAGES ?? 4);
const SEED_RESOLVE_LIMIT = Number(process.env.SEED_RESOLVE_LIMIT ?? 400);
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 6);
const OBS_WINDOW_DAYS = Number(process.env.REVERT_WINDOW_DAYS ?? 90);

const MANIFEST_RE =
  /(^|\/)(pom\.xml|.*\.gradle(\.kts)?|package\.json|requirements\.txt|pyproject\.toml|Cargo\.toml|go\.mod|Gemfile|build\.sbt|.*\.csproj|packages\.config|pubspec\.yaml|composer\.json)$/i;
const PKG_MANAGER = file => {
  if (/pom\.xml$/i.test(file)) return 'maven';
  if (/\.gradle(\.kts)?$/i.test(file)) return 'gradle';
  if (/package\.json$/i.test(file)) return 'npm';
  if (/requirements\.txt$|pyproject\.toml$/i.test(file)) return 'pip';
  if (/Cargo\.toml$/i.test(file)) return 'cargo';
  if (/go\.mod$/i.test(file)) return 'go';
  if (/Gemfile$/i.test(file)) return 'bundler';
  if (/\.csproj$/i.test(file)) return 'nuget';
  return 'other';
};
const ECOSYSTEM = pm => ({ maven: 'java', gradle: 'java', npm: 'javascript', pip: 'python', cargo: 'rust', go: 'go', bundler: 'ruby', nuget: 'dotnet', other: 'other' }[pm] ?? 'other');
const CI_LIKE = /^(actions\/|github\/|codeql|docker|codecov|dependabot|renovate|.*-action$|.*\/action-|.*\/code$|ghcr\.io)/i;

const SEED_QUERIES = [
  'Revert "build(deps): Bump',
  'Revert "chore(deps): Bump',
  'Revert "build(deps-dev): Bump',
  'Revert "chore(deps-dev): Bump',
  'revert bump dependency',
  'Revert "Bump',
];

const escapeRe = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const sleep = ms => new Promise(r => setTimeout(r, ms));

function parseBump(message) {
  const m = String(message).match(/bump\s+(?:dependency\s+|dependencies\s+)?([^\s]+)\s+from\s+v?([^\s]+?)\s+to\s+v?([^\s]+)/i);
  if (m) return { dependency: m[1].replace(/[,;)]+$/, ''), previousVersion: m[2], newVersion: m[3] };
  const m2 = String(message).match(/bump\s+(?:dependency\s+)?([^\s]+)\s+to\s+v?([^\s]+)/i);
  if (m2) return { dependency: m2[1].replace(/[,;)]+$/, ''), newVersion: m2[2] };
  return {};
}
function semverType(prev, next) {
  const clean = v => String(v ?? '').replace(/^v/, '').split(/[.\-+]/).map(x => (/^\d+$/.test(x) ? Number(x) : x));
  const a = clean(prev), b = clean(next);
  const num = x => (typeof x === 'number' ? x : 0);
  if (!a.length || !b.length) return undefined;
  if (num(b[0]) > num(a[0])) return 'major';
  if (num(b[0]) === num(a[0]) && num(b[1]) > num(a[1])) return 'minor';
  if (num(b[0]) === num(a[0]) && num(b[1]) === num(a[1])) return 'patch';
  return 'other';
}
function decodeEntities(s) {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}
function extractChangelog(body) {
  if (!body) return undefined;
  const rn = body.match(/<summary>\s*Release notes\s*<\/summary>([\s\S]*?)<\/details>/i);
  const cm = body.match(/<summary>\s*(Commits|Changes)\s*<\/summary>([\s\S]*?)<\/details>/i);
  const raw = rn?.[1] ?? cm?.[1] ?? null;
  if (!raw) return undefined;
  const text = decodeEntities(raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).trim();
  return text ? text.slice(0, 3000) : undefined;
}
function invertPatch(patch) {
  if (!patch) return '(no textual diff)';
  return patch
    .split('\n')
    .filter(l => !l.startsWith('@@'))
    .map(l => (l.startsWith('+') ? '-' + l.slice(1) : l.startsWith('-') ? '+' + l.slice(1) : l))
    .join('\n');
}

// ---------- seeds ----------
async function gatherSeeds() {
  const seen = new Set();
  const seeds = [];
  for (const q of SEED_QUERIES) {
    for (let p = 1; p <= SEED_PAGES; p++) {
      let res = null;
      try {
        res = await gh(`https://api.github.com/search/commits?q=${encodeURIComponent(q)}&per_page=100&page=${p}`, { cache: true });
      } catch (err) {
        console.error(`[ood] seed query failed (${q} p${p}): ${String(err).slice(0, 100)}`);
      }
      for (const it of res?.items ?? []) {
        if (it.repository?.fork) continue;
        const key = `${it.repository.full_name}|${it.sha}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const msg = it.commit?.message ?? '';
        const parsed = parseBump(msg);
        if (!parsed.dependency || !parsed.newVersion) continue;
        if (!/^\d+\.\d+/.test(parsed.newVersion)) continue;
        if (parsed.previousVersion && !/^\d+\.\d+/.test(parsed.previousVersion)) continue;
        if (/^(dependencies|dependency|the|all|packages|group|dev-dependencies)$/i.test(parsed.dependency)) continue;
        if (CI_LIKE.test(parsed.dependency)) continue;
        seeds.push({ repo: it.repository.full_name, sha: it.sha, msg, ...parsed, committedAt: it.commit?.committer?.date ?? it.commit?.author?.date ?? null });
      }
      await sleep(2600);
    }
  }
  return seeds;
}

function manifestFromFiles(files) {
  return (files ?? []).filter(f => MANIFEST_RE.test(f.filename) && f.patch);
}

async function originalPrNumber(repo, seed) {
  // 1) inner "(#N)" inside the quoted bump title
  const inner = seed.msg.match(/#(\d+)/);
  // 2) the revert PR body: "Reverts owner/repo#N"
  let viaPr = null;
  try {
    const prs = await gh(`/repos/${repo}/commits/${seed.sha}/pulls`);
    for (const pr of prs ?? []) {
      const body = pr.body ?? '';
      const m = body.match(/Reverts?\s+([^\s#]+)#(\d+)/i);
      if (m) { viaPr = Number(m[2]); break; }
      if (/revert/i.test(pr.title ?? '')) {
        const m2 = (pr.title ?? '').match(/\(#(\d+)\)/);
        if (m2) { viaPr = Number(m2[1]); break; }
      }
    }
  } catch { /* ignore */ }
  return viaPr ?? (inner ? Number(inner[1]) : null);
}

async function buildBreaking(seed) {
  const commit = await gh(`/repos/${seed.repo}/commits/${seed.sha}`);
  if (!commit) return null;
  const manifests = manifestFromFiles(commit.files);
  if (!manifests.length) return null;
  // Revert commit: new version is on '-' lines of the revert patch (the thing being removed).
  const patches = manifests.map(f => f.patch ?? '').join('\n');
  const minusVersions = [...patches.matchAll(/^-\s*[^\n]*?(\d+\.\d+[^\s"'<>]*)/gm)].map(m => m[1]);
  const plusVersions = [...patches.matchAll(/^\+\s*[^\n]*?(\d+\.\d+[^\s"'<>]*)/gm)].map(m => m[1]);
  let dependency = seed.dependency;
  let previousVersion = seed.previousVersion ?? plusVersions[0];
  let newVersion = seed.newVersion ?? minusVersions[0];
  if (seed.previousVersion && seed.newVersion && plusVersions[0] === seed.newVersion && minusVersions[0] === seed.previousVersion) {
    // message already encodes original direction
  }
  const pm = PKG_MANAGER(manifests[0].filename);
  if (!newVersion || !/^\d+\.\d+/.test(String(newVersion))) return null;
  if (previousVersion && !/^\d+\.\d+/.test(String(previousVersion))) previousVersion = undefined;
  if (!previousVersion) return null;

  // Prefer the original bump PR for a clean pre-merge state.
  let resolved = null;
  const origNum = await originalPrNumber(seed.repo, seed);
  if (origNum) {
    const pr = await gh(`/repos/${seed.repo}/pulls/${origNum}`);
    const isRevertPr = pr && (/^revert/i.test(pr.title ?? '') || /reverts?\s+[^\s#]+#\d+/i.test(pr.body ?? ''));
    if (pr && !isRevertPr && /bump|update|upgrade/i.test(pr.title ?? '')) {
      const files = await gh(`/repos/${seed.repo}/pulls/${origNum}/files?per_page=100`);
      const mfiles = (files ?? []).filter(f => MANIFEST_RE.test(f.filename));
      const checkRuns = pr.head?.sha ? await gh(`/repos/${seed.repo}/commits/${pr.head.sha}/check-runs?per_page=100`) : null;
      const runs = checkRuns?.check_runs ?? [];
      const failing = runs.filter(r => ['failure', 'timed_out', 'cancelled', 'action_required', 'startup_failure'].includes(r.conclusion));
      const pending = runs.filter(r => r.status !== 'completed');
      resolved = {
        title: pr.title,
        body: pr.body ? String(pr.body).slice(0, 6000) : undefined,
        manifestDiff: mfiles.map(f => `--- ${f.filename}\n${f.patch ?? '(no textual diff)'}`).join('\n').slice(0, 4000),
        checks: runs.length === 0 ? 'no checks reported on the head commit before merge' : failing.length ? `failing checks (${failing.length}): ${failing.map(r => r.name).join(', ')}` : pending.length ? `checks still running (${pending.length})` : `all ${runs.length} reported checks passed`,
        changelog: extractChangelog(pr.body),
        prNumber: origNum,
        merged: Boolean(pr.merged_at),
        createdAt: pr.created_at,
        headSha: pr.head?.sha,
      };
    }
  }

  const title = resolved?.title ?? seed.msg.replace(/^revert[:\s]*/i, '').replace(/^["']|["']$/g, '').replace(/\s*\(#\d+\)\s*$/, '');
  return {
    id: `ood-break-${seed.repo.replace('/', '_')}-${seed.sha.slice(0, 10)}`,
    dataset: 'breaking',
    source: 'ood-revert',
    repo: seed.repo,
    ecosystem: ECOSYSTEM(pm),
    packageManager: pm,
    dependency,
    previousVersion,
    newVersion,
    updateType: semverType(previousVersion, newVersion),
    title,
    body: resolved?.body,
    manifestDiff: resolved?.manifestDiff ?? `--- ${manifests[0].filename}\n${invertPatch(manifests[0].patch)}`,
    changelog: resolved?.changelog,
    checks: resolved?.checks ?? 'no checks reported on the head commit before merge',
    gold: 'REQUIRE_REVIEW',
    verification: {
      evidence: 'dependency bump reverted in-repo',
      revertCommit: seed.sha,
      revertDate: seed.committedAt,
      originalPrResolved: Boolean(resolved),
      originalPrNumber: resolved?.prNumber ?? null,
      originalPrMerged: resolved?.merged ?? null,
    },
    outcome: { merged: resolved?.merged ?? true, reverted: true, revertedAt: seed.committedAt, headSha: resolved?.headSha ?? seed.sha },
  };
}

// ---------- controls from seed repos ----------
const GRAPHQL_PRS = `query($owner:String!,$name:String!,$cursor:String){
  repository(owner:$owner,name:$name){
    defaultBranchRef{name}
    pullRequests(states:MERGED, first:100, after:$cursor, orderBy:{field:UPDATED_AT,direction:DESC}){
      pageInfo{hasNextPage endCursor}
      nodes{ number title body mergedAt createdAt baseRefName headRefOid author{login} labels(first:20){nodes{name}}
        commits(last:1){nodes{commit{statusCheckRollup{state}}}} }
    }
  }
}`;
function rollup(node) {
  const s = node?.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state ?? null;
  if (s === 'SUCCESS') return 'success';
  if (s === 'FAILURE' || s === 'ERROR') return 'failure';
  if (s === 'PENDING' || s === 'EXPECTED') return 'pending';
  return 'none';
}
async function controlForRepo(repo, limit, breakingKeys) {
  const [owner, name] = repo.split('/');
  const nodes = [];
  let cursor = null, defaultBranch = null;
  for (let p = 0; p < 2; p++) {
    const res = await gql(GRAPHQL_PRS, { owner, name, cursor });
    const r = res?.data?.repository;
    if (!r) break;
    defaultBranch = defaultBranch ?? r.defaultBranchRef?.name ?? null;
    nodes.push(...r.pullRequests.nodes);
    if (!r.pullRequests.pageInfo.hasNextPage) break;
    cursor = r.pullRequests.pageInfo.endCursor;
  }
  const cand = nodes.filter(n => !breakingKeys.has(`${repo}#${n.number}`) && !breakingKeys.has(n.headRefOid))
    .filter(n => /bump|update|upgrade/i.test(n.title ?? '') && /\bto\b/i.test(n.title ?? ''))
    .slice(0, limit);
  const built = [];
  for (const n of cand) {
    const files = await gh(`/repos/${repo}/pulls/${n.number}/files?per_page=100`);
    const manifests = (files ?? []).filter(f => MANIFEST_RE.test(f.filename) && f.status !== 'removed');
    if (!manifests.length) continue;
    const parsed = parseBump(n.title);
    const diff = manifests.map(f => f.patch ?? '').join('\n');
    const previousVersion = parsed.previousVersion ?? diff.match(/^-\s*[^\n]*?(\d+\.\d+[^\s"'<>]*)/m)?.[1];
    const newVersion = parsed.newVersion ?? diff.match(/^\+\s*[^\n]*?(\d+\.\d+[^\s"'<>]*)/m)?.[1];
    if (!newVersion) continue;
    const checksState = rollup(n);
    if (checksState === 'failure' || checksState === 'pending') continue;
    const since = new Date(new Date(n.mergedAt).getTime() - 60000).toISOString();
    const until = new Date(new Date(n.mergedAt).getTime() + OBS_WINDOW_DAYS * 86400000).toISOString();
    const commits = await gh(`/repos/${repo}/commits?path=${encodeURIComponent(manifests[0].filename)}&since=${since}&until=${until}&per_page=100`);
    const artifact = (parsed.dependency ?? '').split(':').pop() ?? '';
    const reverted = (commits ?? []).some(c => /revert/i.test(c.commit?.message ?? '') && ((artifact && c.commit.message.includes(artifact)) || new RegExp(`#${n.number}\\b`).test(c.commit.message)));
    if (reverted) continue;
    const contentRes = defaultBranch ? await gh(`/repos/${repo}/contents/${manifests[0].filename}?ref=${encodeURIComponent(defaultBranch)}`) : null;
    let versionState = 'unknown';
    if (contentRes?.content) {
      const text = Buffer.from(contentRes.content, 'base64').toString('utf8');
      const has = v => v && new RegExp(`(^|[^\\w.])${escapeRe(String(v).replace(/^v/, ''))}([^\\w.]|$)`).test(text);
      versionState = has(newVersion) ? 'present' : has(previousVersion) ? 'reverted' : 'superseded-or-absent';
    }
    if (versionState === 'reverted') continue;
    const pm = PKG_MANAGER(manifests[0].filename);
    built.push({
      id: `ood-ctrl-${repo.replace('/', '_')}-${n.number}`,
      dataset: 'control',
      source: 'ood-merged-control',
      repo,
      ecosystem: ECOSYSTEM(pm),
      packageManager: pm,
      dependency: parsed.dependency,
      previousVersion,
      newVersion,
      updateType: semverType(previousVersion, newVersion),
      title: n.title,
      body: n.body ? String(n.body).slice(0, 6000) : undefined,
      manifestDiff: manifests.map(f => `--- ${f.filename}\n${f.patch ?? '(no textual diff)'}`).join('\n').slice(0, 4000),
      changelog: extractChangelog(n.body),
      checks: checksState === 'none' ? 'no checks reported on the head commit before merge' : `${checksState} status check rollup on the head commit`,
      gold: 'AUTO_MERGE',
      verification: { evidence: 'merged, no revert, no downgrade, no failing checks', versionState, headSha: n.headRefOid },
      outcome: { merged: true, mergedAt: n.mergedAt, reverted: false, versionState, headSha: n.headRefOid },
    });
    if (built.length >= limit) break;
  }
  return built;
}

async function main() {
  const bump = await readJsonl(BUMP);
  const bumpRepos = new Set(bump.map(c => c.repo));
  const bumpPrKeys = new Set();
  const bumpShas = new Set();
  const bumpTransitions = new Set();
  for (const c of bump) {
    if (c.outcome?.headSha) bumpShas.add(c.outcome.headSha);
    bumpTransitions.add(`${c.dependency}|${c.previousVersion}|${c.newVersion}`);
  }
  for (const c of await readJsonl(path.resolve('data/bump.cases.jsonl'))) {
    if (c.prNumber) bumpPrKeys.add(`${c.repo}#${c.prNumber}`);
    if (c.outcome?.headSha) bumpShas.add(c.outcome.headSha);
  }

  console.error('[ood] gathering revert seeds...');
  const seeds = await gatherSeeds();
  console.error(`[ood] seeds: ${seeds.length}`);
  const uniqueRepoSeeds = [...new Map(seeds.map(s => [s.repo, s])).values()];

  console.error('[ood] building breaking candidates...');
  const toResolve = uniqueRepoSeeds.slice(0, SEED_RESOLVE_LIMIT);
  const built = await mapLimit(toResolve, CONCURRENCY, async s => {
    try {
      return await buildBreaking(s);
    } catch (err) {
      console.error(`[ood] break ${s.repo}@${s.sha.slice(0, 8)} failed: ${String(err).slice(0, 120)}`);
      return null;
    }
  });
  const seen = new Set();
  const breaking = [];
  const ordered = [...built].filter(Boolean).sort((a, b) => Number(b.verification.originalPrResolved) - Number(a.verification.originalPrResolved));
  for (const c of ordered) {
    if (!c) continue;
    if (bumpRepos.has(c.repo)) continue; // independence: drop BUMP repos entirely
    if (bumpShas.has(c.outcome?.headSha)) continue;
    if (c.verification.originalPrNumber && bumpPrKeys.has(`${c.repo}#${c.verification.originalPrNumber}`)) continue;
    const key = `${c.repo}|${c.dependency}|${c.newVersion}`;
    if (seen.has(key)) continue;
    seen.add(key);
    breaking.push(c);
    if (breaking.length >= BREAK_TARGET) break;
  }
  console.error(`[ood] breaking: ${breaking.length}`);

  // Controls from the repos that produced breaking cases (plus a few more seed repos).
  const repoPool = [...new Set([...breaking.map(c => c.repo), ...uniqueRepoSeeds.map(s => s.repo)])].filter(r => !bumpRepos.has(r));
  const breakingKeys = new Set(breaking.flatMap(c => [c.outcome?.headSha, c.verification?.originalPrNumber ? `${c.repo}#${c.verification.originalPrNumber}` : null]).filter(Boolean));
  console.error(`[ood] mining controls from ${repoPool.length} repos...`);
  const controlRepos = Number(process.env.CONTROL_REPOS ?? 120);
  const controlBatches = await mapLimit(repoPool.slice(0, controlRepos), CONCURRENCY, async repo => {
    try {
      return await controlForRepo(repo, 4, breakingKeys);
    } catch (err) {
      console.error(`[ood] control ${repo} failed: ${String(err).slice(0, 120)}`);
      return [];
    }
  });
  const ctrlSeen = new Set();
  const controls = [];
  for (const batch of controlBatches) {
    for (const c of batch) {
      const key = `${c.repo}|${c.dependency}|${c.newVersion}`;
      if (ctrlSeen.has(key) || seen.has(key)) continue;
      ctrlSeen.add(key);
      controls.push(c);
      if (controls.length >= CTRL_TARGET) break;
    }
    if (controls.length >= CTRL_TARGET) break;
  }
  console.error(`[ood] controls: ${controls.length}`);

  const all = [...breaking, ...controls];
  await writeJsonl(OUT, all);
  console.error(`[ood] wrote ${all.length} cases (${breaking.length} breaking / ${controls.length} control) -> ${OUT}`);
}

await main();

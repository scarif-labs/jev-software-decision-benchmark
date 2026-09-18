// Stage 1+2: read BUMP benchmark records and build enriched breaking-case JSONL.
// Every emitted record has gold=REQUIRE_REVIEW (the update is a verified break).
// Only pre-merge fields go into `state`; post-merge facts live under `outcome`.
import fs from 'node:fs/promises';
import path from 'node:path';
import { gh, mapLimit, writeJsonl } from './lib/gh.mjs';

const BUMP_DIR = path.resolve(process.env.BUMP_DIR ?? '/tmp/bump-main');
const BENCH_DIR = path.join(BUMP_DIR, 'data', 'benchmark');
const OUT = path.resolve(process.env.OUT ?? 'data/bump.cases.jsonl');
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 6);

const MANIFEST_RE =
  /(^|\/)(pom\.xml|.*\.gradle(\.kts)?|package\.json|requirements\.txt|pyproject\.toml|Cargo\.toml|go\.mod|Gemfile|build\.sbt|.*\.csproj|packages\.config)$/i;

const FAIL_CONCLUSIONS = new Set(['failure', 'timed_out', 'cancelled', 'action_required', 'startup_failure', 'stale']);

function parsePrUrl(url) {
  const m = url.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/);
  if (!m) return null;
  return { repo: m[1], prNumber: Number(m[2]) };
}

function summarizeChecks(runs) {
  if (!runs || runs.length === 0) return { text: 'no checks reported for the head commit', state: 'none' };
  const failing = runs.filter(r => FAIL_CONCLUSIONS.has(r.conclusion));
  const pending = runs.filter(r => r.status !== 'completed');
  if (failing.length) {
    return { text: `failing checks (${failing.length}): ${failing.map(r => r.name).join(', ')}`, state: 'failure' };
  }
  if (pending.length) {
    return { text: `checks still running (${pending.length}): ${pending.map(r => r.name).join(', ')}`, state: 'pending' };
  }
  return { text: `all ${runs.length} reported checks passed: ${runs.map(r => r.name).join(', ')}`, state: 'success' };
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

// Dependabot/Renovate PR bodies often embed the dependency's release notes.
function extractChangelog(body) {
  if (!body) return undefined;
  const releaseNotes = body.match(/<summary>\s*Release notes\s*<\/summary>([\s\S]*?)<\/details>/i);
  const commits = body.match(/<summary>\s*(Commits|Changes)\s*<\/summary>([\s\S]*?)<\/details>/i);
  const raw = releaseNotes?.[1] ?? commits?.[1] ?? null;
  if (!raw) return undefined;
  const text = decodeEntities(raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).trim();
  return text ? text.slice(0, 3000) : undefined;
}

async function releaseNotes(slug, version) {
  if (!slug || /not found/i.test(slug)) return undefined;
  const tags = [`v${version}`, version];
  for (const tag of tags) {
    const rel = await gh(`/repos/${slug}/releases/tags/${encodeURIComponent(tag)}`);
    if (rel?.body) {
      return `Release ${rel.tag_name}: ${rel.name ?? ''}\n${String(rel.body).slice(0, 2500)}`.trim();
    }
  }
  return undefined;
}

async function buildCase(rec) {
  const pr = parsePrUrl(rec.url);
  const dep = rec.updatedDependency ?? {};
  const base = {
    id: `bump-${rec.breakingCommit.slice(0, 12)}`,
    dataset: 'breaking',
    repo: `${rec.projectOrganisation}/${rec.project}`,
    ecosystem: 'java',
    packageManager: 'maven',
    dependency: [dep.dependencyGroupID, dep.dependencyArtifactID].filter(Boolean).join(':'),
    previousVersion: dep.previousVersion ?? undefined,
    newVersion: dep.newVersion ?? undefined,
    updateType: dep.versionUpdateType ?? undefined,
    scope: dep.dependencyScope ?? undefined,
    dependencySection: dep.dependencySection ?? undefined,
    directDependency: ['dependencies', 'buildPlugins', 'buildPluginManagement', 'profileBuildPlugins'].includes(
      dep.dependencySection,
    ),
    source: 'bump',
    gold: 'REQUIRE_REVIEW',
  };

  if (!pr) return { ...base, title: undefined, body: undefined, url: rec.url };

  const [pull, files, checkRuns] = await Promise.all([
    gh(`/repos/${pr.repo}/pulls/${pr.prNumber}`),
    gh(`/repos/${pr.repo}/pulls/${pr.prNumber}/files?per_page=100`),
    gh(`/repos/${pr.repo}/pulls/${pr.prNumber}`).then(p =>
      p ? gh(`/repos/${pr.repo}/commits/${p.head.sha}/check-runs?per_page=100`) : null,
    ),
  ]);
  if (!pull) return { ...base, url: rec.url };

  const checks = summarizeChecks(checkRuns?.check_runs ?? []);
  const manifestDiff = (files ?? [])
    .filter(f => MANIFEST_RE.test(f.filename))
    .map(f => `--- ${f.filename}\n${f.patch ?? '(binary or too large)'}`)
    .join('\n')
    .slice(0, 4000);

  const labels = (pull.labels ?? []).map(l => l.name);
  const securityUpdate = labels.some(l => /security/i.test(l)) || /security/i.test(pull.title ?? '');

  const changelog = extractChangelog(pull.body) ?? (await releaseNotes(dep.githubRepoSlug, dep.newVersion));

  return {
    ...base,
    url: rec.url,
    prNumber: pr.prNumber,
    title: pull.title ?? undefined,
    body: pull.body ? String(pull.body).slice(0, 6000) : undefined,
    manifestDiff: manifestDiff || undefined,
    changelog,
    checks: checks.text,
    securityUpdate,
    // Post-merge facts. NEVER passed to a model.
    outcome: {
      merged: Boolean(pull.merged_at),
      mergedAt: pull.merged_at ?? null,
      createdAt: pull.created_at ?? null,
      checkState: checks.state,
      ciPassedBeforeMerge: checks.state === 'success',
      headSha: pull.head?.sha ?? null,
      baseRef: pull.base?.ref ?? null,
      labels,
      failureCategory: rec.failureCategory ?? null, // BUMP ground-truth reason; audit-only
    },
  };
}

const files = (await fs.readdir(BENCH_DIR)).filter(f => f.endsWith('.json'));
const records = await mapLimit(files, CONCURRENCY, async f => {
  const rec = JSON.parse(await fs.readFile(path.join(BENCH_DIR, f), 'utf8'));
  return rec;
});

let done = 0;
const cases = await mapLimit(records, CONCURRENCY, async rec => {
  const c = await buildCase(rec);
  if (++done % 25 === 0) console.error(`[bump] ${done}/${records.length}`);
  return c;
});

await writeJsonl(OUT, cases);
console.error(`[bump] wrote ${cases.length} breaking cases -> ${OUT}`);

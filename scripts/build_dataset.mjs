// Stage 4: assemble the final balanced dataset and annotate evaluation splits.
//
// Breaking cases with no usable PR data are dropped. Controls are sampled to the same
// count as breaking cases, round-robin across repositories, so the benchmark is
// balanced and not dominated by a few large projects.
import fs from 'node:fs/promises';
import path from 'node:path';
import { readJsonl, writeJsonl } from './lib/gh.mjs';

const BUMP = path.resolve(process.env.BUMP_CASES ?? 'data/bump.cases.jsonl');
const CONTROLS = path.resolve(process.env.CONTROL_CASES ?? 'data/control.cases.jsonl');
const OUT = path.resolve(process.env.OUT ?? 'data/dataset.jsonl');

function stableHash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function family(c) {
  const dep = c.dependency ?? c.title ?? 'unknown';
  return dep.includes(':') ? dep.split(':')[0] : dep.replace(/[\d.\-]+$/, '').trim() || 'unknown';
}

function decisionTime(c) {
  return c.outcome?.mergedAt ?? c.outcome?.createdAt ?? null;
}

function annotateSplits(c) {
  const repoBucket = stableHash(c.repo) % 10;
  const famBucket = stableHash(family(c)) % 5;
  return {
    repoDisjoint: repoBucket < 7 ? 'train' : 'test',
    packageFamily: famBucket === 0 ? 'stress' : 'rest',
    updateType: c.updateType ?? 'unknown',
    dependencyScope: c.directDependency === false ? 'transitive' : c.directDependency === true ? 'direct' : 'unknown',
  };
}

function normalizeChecks(c) {
  const s = c.outcome?.checkState;
  if (s === 'success') return 'all reported CI checks passed before merge';
  if (s === 'failure') return 'at least one reported CI check failed before merge';
  if (s === 'pending') return 'reported CI checks were still running before merge';
  return 'no CI checks were reported on the head commit before merge';
}

function normalize(c) {
  return {
    id: c.id,
    dataset: c.dataset,
    repo: c.repo,
    ecosystem: c.ecosystem,
    packageManager: c.packageManager,
    dependency: c.dependency,
    previousVersion: c.previousVersion,
    newVersion: c.newVersion,
    updateType: c.updateType,
    scope: c.scope,
    dependencySection: c.dependencySection,
    directDependency: c.directDependency,
    securityUpdate: c.securityUpdate,
    title: c.title,
    body: c.body,
    manifestDiff: c.manifestDiff,
    changelog: c.changelog,
    checks: normalizeChecks(c),
    source: c.source,
    gold: c.gold,
    verificationTier: c.verificationTier,
    outcome: c.outcome,
  };
}

const bumpAll = await readJsonl(BUMP);
const breaking = bumpAll.filter(c => c.title || c.manifestDiff);
const droppedBreaking = bumpAll.length - breaking.length;

const controlsAll = await readJsonl(CONTROLS);
// Keep only controls with the same fields the breaking set always has, so the two
// classes cannot be told apart merely by which metadata survived the build pipeline.
const controlsClean = controlsAll.filter(
  c => c.dependency && c.previousVersion && c.newVersion && c.title &&
    !/combine dependabot/i.test(c.title) && c.updateType && c.updateType !== 'other',
);
// Round-robin over repositories for a representative control sample.
const byRepo = new Map();
for (const c of controlsClean) {
  if (!byRepo.has(c.repo)) byRepo.set(c.repo, []);
  byRepo.get(c.repo).push(c);
}
for (const arr of byRepo.values()) arr.sort((a, b) => a.id.localeCompare(b.id));
const controls = [];
let more = true;
while (controls.length < breaking.length && more) {
  more = false;
  for (const arr of byRepo.values()) {
    const c = arr.shift();
    if (c) {
      controls.push(normalize(c));
      more = true;
    }
    if (controls.length >= breaking.length) break;
  }
}

// Time-ordered split: earliest 70% train, latest 30% holdout.
const all = [...breaking.map(normalize), ...controls];
const withTime = all.filter(c => decisionTime(c));
withTime.sort((a, b) => String(decisionTime(a)).localeCompare(String(decisionTime(b))));
const cutoff = Math.floor(withTime.length * 0.7);
for (const c of all) {
  const t = decisionTime(c);
  c.splits = annotateSplits(c);
  if (!t) c.splits.timeOrder = 'unknown';
  else c.splits.timeOrder = withTime.indexOf(c) < cutoff ? 'train' : 'holdout';
}

await writeJsonl(OUT, all);

const stats = {
  breaking: breaking.length,
  droppedBreakingNoPrData: droppedBreaking,
  controlsAvailable: controlsAll.length,
  controlsAfterFieldFilter: controlsClean.length,
  controlsSampled: controls.length,
  total: all.length,
  repos: new Set(all.map(c => c.repo)).size,
  breakingRepos: new Set(breaking.map(c => c.repo)).size,
  controlRepos: new Set(controls.map(c => c.repo)).size,
  goldCounts: all.reduce((acc, c) => ((acc[c.gold] = (acc[c.gold] ?? 0) + 1), acc), {}),
  datasetCounts: all.reduce((acc, c) => ((acc[c.dataset] = (acc[c.dataset] ?? 0) + 1), acc), {}),
  updateType: all.reduce((acc, c) => ((acc[c.splits.updateType] = (acc[c.splits.updateType] ?? 0) + 1), acc), {}),
  verificationTiers: controls.reduce((acc, c) => ((acc[c.verificationTier ?? 'none'] = (acc[c.verificationTier ?? 'none'] ?? 0) + 1), acc), {}),
};
await fs.writeFile(path.resolve('data/dataset.stats.json'), JSON.stringify(stats, null, 2) + '\n');
console.error(JSON.stringify(stats, null, 2));
console.error(`[dataset] wrote ${all.length} cases -> ${OUT}`);

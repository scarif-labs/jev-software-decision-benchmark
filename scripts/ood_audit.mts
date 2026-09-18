// OOD dataset audit: independence vs BUMP + leakage on the frozen state projection.
// Read-only with respect to the frozen benchmark; writes only data/ood-* files.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { runAudit, STATE_TOP_LEVEL } from '../src/audit.js';
import { decisionState } from '../src/prompt.js';
import type { DependencyCase } from '../src/types.js';

const readJsonl = (f: string) => fs.readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l));
const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

const ood = readJsonl('data/ood-dataset.jsonl') as DependencyCase[];
const bumpCases = readJsonl('data/bump.cases.jsonl');
const dataset = readJsonl('data/dataset.jsonl') as DependencyCase[];

// ---------- independence ----------
const bumpRepos = new Set([...bumpCases, ...dataset].map((c: Record<string, unknown>) => c.repo as string));
const bumpPrKeys = new Set<string>();
const bumpShas = new Set<string>();
const bumpTransitions = new Set<string>();
for (const c of bumpCases as Array<Record<string, any>>) {
  if (c.prNumber) bumpPrKeys.add(`${c.repo}#${c.prNumber}`);
  if (c.outcome?.headSha) bumpShas.add(c.outcome.headSha);
  bumpTransitions.add(`${c.dependency}|${c.previousVersion}|${c.newVersion}`);
}
for (const c of dataset as Array<Record<string, any>>) {
  if (c.outcome?.headSha) bumpShas.add(c.outcome.headSha);
  bumpTransitions.add(`${c.dependency}|${c.previousVersion}|${c.newVersion}`);
}

const overlap = {
  repoOverlap: ood.filter(c => bumpRepos.has(c.repo)).map(c => c.id),
  prOverlap: ood.filter(c => {
    const n = (c as unknown as { verification?: { originalPrNumber?: number } }).verification?.originalPrNumber;
    return n ? bumpPrKeys.has(`${c.repo}#${n}`) : false;
  }).map(c => c.id),
  headShaOverlap: ood.filter(c => c.outcome?.headSha && bumpShas.has(c.outcome.headSha)).map(c => c.id),
  transitionOverlap: ood.filter(c => bumpTransitions.has(`${c.dependency}|${c.previousVersion}|${c.newVersion}`)).map(c => c.id),
  duplicateWithinOod: (() => {
    const seen = new Map<string, number>();
    for (const c of ood) {
      const k = `${c.repo}|${c.dependency}|${c.newVersion}|${c.gold}`;
      seen.set(k, (seen.get(k) ?? 0) + 1);
    }
    return [...seen.entries()].filter(([, n]) => n > 1).map(([k, n]) => ({ key: k, n }));
  })(),
};

// ---------- leakage (reuse frozen audit) ----------
const leak = runAudit(ood);
const topLevelViolations = ood.map(c => ({ id: c.id, keys: Object.keys(decisionState(c)) })).filter(x => x.keys.join(',') !== STATE_TOP_LEVEL.join(','));

// Outcome indicators that must never appear in the model-visible TITLE (the field we
// construct). Free-text body/release-notes may legitimately mention "regression" or
// "revert" (the dependency's own changelog), so those are reported, not failed.
const TITLE_LEAK = /revert|brok|fail|regress|downgrad|rollback|roll back|deploy(ment)? (error|fail)/i;
const FREE_TEXT_TOKENS = ['reverted', 'revert', 'downgrade', 'regression', 'rolled back', 'rollback', 'post-merge', 'broke', 'broken', 'failing'];
const titleViolations = ood.filter(c => TITLE_LEAK.test(c.title ?? '')).map(c => ({ id: c.id, title: c.title }));
const freeTextMentions = ood.map(c => {
  const body = `${c.body ?? ''} ${c.changelog ?? ''}`.toLowerCase();
  const hits = FREE_TEXT_TOKENS.filter(t => body.includes(t));
  return { id: c.id, hits: [...new Set(hits)] };
}).filter(x => x.hits.length);

const passed = leak.forbiddenKeyViolations.length === 0 && leak.forbiddenTokenViolations.length === 0 && topLevelViolations.length === 0 && titleViolations.length === 0
  && overlap.repoOverlap.length === 0 && overlap.prOverlap.length === 0 && overlap.headShaOverlap.length === 0;

// ---------- model-input hashes ----------
const inputHashes = ood.map(c => ({ id: c.id, sha256: sha(JSON.stringify(decisionState(c))) }));
const aggregateInputHash = sha(inputHashes.map(h => h.sha256).join(''));

// ---------- cost estimate ----------
const chars = ood.map(c => JSON.stringify(decisionState(c)).length);
const avgChars = chars.reduce((s, x) => s + x, 0) / Math.max(1, chars.length);
const avgTokens = avgChars / 4;
const n = ood.length;
const cost = {
  n,
  avgStateChars: Math.round(avgChars),
  avgInputTokensApprox: Math.round(avgTokens),
  deepseekObservedPer1kUsd: 0.6403,
  jevObservedPer1kUsd: 0.1313,
  deepseekEstimatedUsd: Number(((0.6403 * n) / 1000).toFixed(4)),
  jevEstimatedUsd: Number(((0.1313 * n) / 1000).toFixed(4)),
  note: 'DeepSeek/JEV per-1k rates observed on the 1,102-case BUMP run; OOD state sizes are comparable by construction.',
};

// ---------- frozen-source manifest ----------
const frozen = ['src/prompt.ts', 'src/llm.ts', 'src/jev.ts', 'src/evaluate.ts', 'src/rules.ts', 'src/types.ts', 'src/audit.ts', 'src/run.ts', 'src/mock.ts', 'package.json', 'tsconfig.json', 'scripts/build_ood.mjs', 'scripts/ood_audit.mts'];
const manifest = {
  createdAt: new Date().toISOString(),
  note: 'Hashes of the frozen implementation used for the OOD validation. Model/prompt/state/evaluator are unchanged from the 1,102-case benchmark.',
  files: Object.fromEntries(frozen.filter(f => fs.existsSync(f)).map(f => [f, sha(fs.readFileSync(f, 'utf8'))])),
  frozenConfig: {
    openrouterModel: '~deepseek/deepseek-flash-latest',
    reasoning: 'disabled',
    temperature: 0,
    responseFormat: 'json_schema (decision/risk/confidence)',
    jevModel: 'jev-latest (SDK default)',
    retry: 'max 3 attempts, exponential backoff',
    evaluator: 'src/evaluate.ts coverageAtPrecision / autoMergeScore',
  },
  aggregateModelInputHash: aggregateInputHash,
  representativeModelInputHashes: inputHashes.slice(0, 10),
};

const breakdown = (key: (c: DependencyCase) => string) => ood.reduce((acc, c) => { const k = key(c); acc[k] = (acc[k] ?? 0) + 1; return acc; }, {} as Record<string, number>);
const meta = {
  createdAt: new Date().toISOString(),
  source: {
    breaking: 'GitHub commit search for in-repo reverts of dependency bumps (independent negative outcome evidence)',
    control: 'merged dependency-update PRs from the same independent repositories, verified non-breaking',
    independentOfBump: true,
  },
  counts: { breaking: ood.filter(c => c.gold !== 'AUTO_MERGE').length, control: ood.filter(c => c.gold === 'AUTO_MERGE').length, total: ood.length },
  repos: [...new Set(ood.map(c => c.repo))],
  ecosystems: breakdown(c => c.ecosystem ?? 'other'),
  packageManagers: breakdown(c => c.packageManager ?? 'other'),
  updateTypes: breakdown(c => c.updateType ?? 'unknown'),
  provenance: { breakingOriginalPrResolved: ood.filter(c => (c as any).verification?.originalPrResolved).length, breakingUnresolved: ood.filter(c => c.gold !== 'AUTO_MERGE' && !(c as any).verification?.originalPrResolved).length },
  independence: overlap,
  leakage: { passed, topLevelStateFields: STATE_TOP_LEVEL },
  caseIds: { breaking: ood.filter(c => c.gold !== 'AUTO_MERGE').map(c => c.id), control: ood.filter(c => c.gold === 'AUTO_MERGE').map(c => c.id) },
  cost,
};

fs.writeFileSync('data/ood-source-manifest.json', JSON.stringify(manifest, null, 2) + '\n');
fs.writeFileSync('data/ood-dataset.meta.json', JSON.stringify(meta, null, 2) + '\n');
fs.writeFileSync('data/ood-leakage-report.json', JSON.stringify({
  verdict: passed ? 'PASS' : 'FAIL',
  cases: ood.length,
  forbiddenKeyViolations: leak.forbiddenKeyViolations,
  forbiddenTokenViolations: leak.forbiddenTokenViolations,
  topLevelViolations,
  titleViolations,
  freeTextOutcomeMentions: freeTextMentions,
  perfectSeparatorCount: leak.perfectSeparatorCount,
  perfectSeparators: leak.perfectSeparators.slice(0, 30),
  independence: overlap,
  modelInputAggregateHash: aggregateInputHash,
}, null, 2) + '\n');

console.log(JSON.stringify({ verdict: passed ? 'PASS' : 'FAIL', counts: meta.counts, ecosystems: meta.ecosystems, pm: meta.packageManagers, updateTypes: meta.updateTypes, overlap: { repo: overlap.repoOverlap.length, pr: overlap.prOverlap.length, sha: overlap.headShaOverlap.length, transition: overlap.transitionOverlap.length, dup: overlap.duplicateWithinOod.length }, leakKeys: leak.forbiddenKeyViolations.length, leakTokens: leak.forbiddenTokenViolations.length, topLevel: topLevelViolations.length, titleViolations: titleViolations.length, freeTextMentions: freeTextMentions.length, cost }, null, 2));

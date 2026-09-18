// @ts-nocheck
// Assemble the full 1,102-case report from the three result files using the existing
// evaluator. Read-only reporting: no experiment logic is changed.
import fs from 'node:fs';
import { coverageAtPrecision, evaluateAtThreshold, isEvaluable, isSafe, selectSubset, summarize } from '../src/evaluate.js';
import type { DependencyCase, JudgeResult } from '../src/types.js';

const cases = fs.readFileSync('data/dataset.jsonl', 'utf8').split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l) as DependencyCase);
const models = [
  { name: 'Static rules', file: 'results/RULES.jsonl' },
  { name: 'DeepSeek Flash', file: 'results/OPENROUTER.jsonl' },
  { name: 'JEV', file: 'results/JEV.jsonl' },
];
const targets = [0.99, 0.995];
const load = (f: string) => fs.readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l) as JudgeResult);

const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
function percentile(values: number[], q: number): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.max(0, Math.min(s.length - 1, Math.ceil(q * s.length) - 1))];
}

const dims: Array<[string, Array<[string, (c: DependencyCase) => boolean]>]> = [
  ['repo-disjoint', [['train', c => c.splits?.repoDisjoint === 'train'], ['test', c => c.splits?.repoDisjoint === 'test']]],
  ['time-ordered', [['train', c => c.splits?.timeOrder === 'train'], ['holdout', c => c.splits?.timeOrder === 'holdout'], ['unknown', c => c.splits?.timeOrder === 'unknown']]],
  ['package-family', [['rest', c => c.splits?.packageFamily === 'rest'], ['stress', c => c.splits?.packageFamily === 'stress']]],
  ['update-type', [['major', c => c.updateType === 'major'], ['minor', c => c.updateType === 'minor'], ['patch', c => c.updateType === 'patch'], ['other', c => c.updateType === 'other']]],
  ['dependency-scope', [['direct', c => c.splits?.dependencyScope === 'direct'], ['transitive', c => c.splits?.dependencyScope === 'transitive'], ['unknown', c => c.splits?.dependencyScope === 'unknown']]],
];

const report: Record<string, unknown> = { cases: cases.length, models: {} };
const lines: string[] = [];

for (const m of models) {
  const results = load(m.file);
  const evaluableIdx = results.map((_, i) => i).filter(i => isEvaluable(results[i]));
  const ev = {
    successful: results.filter(r => r.status !== 'error').length,
    errors: results.filter(r => r.status === 'error').length,
    evaluable: evaluableIdx.length,
    inputTokens: results.reduce((s, r) => s + (r.usage?.inputTokens ?? 0), 0),
    outputTokens: results.reduce((s, r) => s + (r.usage?.outputTokens ?? 0), 0),
    totalCostUsd: Number(results.reduce((s, r) => s + (r.costUsd ?? 0), 0).toFixed(4)),
    costPer1kUsd: Number(((results.reduce((s, r) => s + (r.costUsd ?? 0), 0) / Math.max(1, evaluableIdx.length)) * 1000).toFixed(4)),
    modelReturned: [...new Set(results.map(r => (r.raw as { model?: string } | undefined)?.model).filter(Boolean))],
  };
  const lat = evaluableIdx.map(i => results[i].latencyMs);
  const latency = {
    mean: Math.round(lat.reduce((s, x) => s + x, 0) / Math.max(1, lat.length)),
    p50: Math.round(percentile(lat, 0.5)),
    p95: Math.round(percentile(lat, 0.95)),
    max: Math.round(lat.length ? Math.max(...lat) : 0),
  };
  const decisions = results.reduce((acc, r) => {
    const k = r.decision ?? 'null';
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const amIdx = evaluableIdx.filter(i => results[i].decision === 'AUTO_MERGE');
  const amBreaking = amIdx.filter(i => !isSafe(cases[i]));
  const controls = cases.filter(c => isSafe(c)).length;
  const breaking = cases.length - controls;

  const oracle = targets.map(t => {
    const point = coverageAtPrecision(cases, results, t);
    return summarize(m.name, t, cases, results, point);
  });

  const fixed: Array<Record<string, unknown>> = [];
  for (const [splitName, devPred, evalPred] of [
    ['repo-disjoint', (c: DependencyCase) => c.splits?.repoDisjoint === 'train', (c: DependencyCase) => c.splits?.repoDisjoint === 'test'],
    ['time-ordered', (c: DependencyCase) => c.splits?.timeOrder === 'train', (c: DependencyCase) => c.splits?.timeOrder === 'holdout'],
  ] as const) {
    const dev = selectSubset(cases, results, devPred);
    const held = selectSubset(cases, results, evalPred);
    if (!dev.cases.length || !held.cases.length) continue;
    for (const t of targets) {
      const dp = coverageAtPrecision(dev.cases, dev.results, t);
      const hp = evaluateAtThreshold(held.cases, held.results, dp.threshold);
      fixed.push({ split: splitName, target: t, frozenThreshold: dp.threshold, devAutoMerges: dp.autoMerged, heldOut: { ...hp } });
    }
  }

  const breakdown: Array<Record<string, unknown>> = [];
  for (const [dim, values] of dims) {
    for (const [value, pred] of values) {
      const sub = selectSubset(cases, results, pred);
      if (!sub.cases.length) continue;
      const point = coverageAtPrecision(sub.cases, sub.results, 0.99);
      const s = summarize(m.name, 0.99, sub.cases, sub.results, point);
      breakdown.push({ dimension: dim, value, n: sub.cases.length, coverage: point.coverage, precision: point.precision, unsafe: point.unsafe, recall: s.reviewRecallOnBreaking });
    }
  }

  report.models[m.name] = {
    label: m.name,
    operational: ev,
    latency,
    decisions,
    autoMergeDecisions: amIdx.length,
    autoMergeDecisionsOnBreaking: amBreaking.length,
    breakingAutoMergeIds: amBreaking.map(i => cases[i].id),
    goldCounts: { breaking, controls },
    oracle,
    fixedThresholdHeldOut: fixed,
    breakdown,
  };

  lines.push(`\n===== ${m.name} =====`);
  lines.push(`successful=${ev.successful} errors=${ev.errors} evaluable=${ev.evaluable} inTok=${ev.inputTokens} outTok=${ev.outputTokens} totalCost=$${ev.totalCostUsd} cost/1k=$${ev.costPer1kUsd} modelReturned=${JSON.stringify(ev.modelReturned)}`);
  lines.push(`latency mean/p50/p95/max = ${latency.mean}/${latency.p50}/${latency.p95}/${latency.max} ms`);
  lines.push(`decisions=${JSON.stringify(decisions)} autoMergeDecisions=${amIdx.length} onBreaking=${amBreaking.length}`);
  lines.push('ORACLE (retrospective):');
  for (const o of oracle) lines.push(`  @${o.targetPrecision}: precision=${pct(o.precision)} coverage=${pct(o.coverage)} unsafe=${o.unsafe} recall=${pct(o.reviewRecallOnBreaking)}`);
  lines.push('FIXED-THRESHOLD HELD-OUT:');
  for (const f of fixed) {
    const h = f.heldOut as { precision: number; coverage: number; unsafe: number; evaluable: number };
    lines.push(`  ${f.split} @${f.target}: threshold=${f.frozenThreshold} devAutoMerges=${f.devAutoMerges} -> precision=${pct(h.precision)} coverage=${pct(h.coverage)} unsafe=${h.unsafe} n=${h.evaluable}`);
  }
  lines.push('BREAKDOWN @99% coverage:');
  for (const b of breakdown) lines.push(`  ${String(b.dimension).padEnd(16)} ${String(b.value).padEnd(12)} n=${String(b.n).padStart(4)} coverage=${pct(b.coverage as number)} precision=${pct(b.precision as number)} unsafe=${b.unsafe} recall=${pct(b.recall as number)}`);
}

fs.writeFileSync('report/full-report.json', JSON.stringify(report, null, 2) + '\n');
fs.writeFileSync('report/full-report.txt', lines.join('\n') + '\n');
console.log(lines.join('\n'));

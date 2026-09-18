// @ts-nocheck
// OOD validation analysis. Read-only. Applies the thresholds frozen by the original
// 1,102-case benchmark to the OOD set. No threshold is selected using OOD labels.
import fs from 'node:fs';
import { autoMergeCurve, coverageAtPrecision, evaluateAtThreshold, isEvaluable, isSafe, summarize } from '../src/evaluate.js';
import type { DependencyCase, JudgeResult } from '../src/types.js';

const read = (f: string) => fs.readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l));
const cases = read('data/ood-dataset.jsonl') as DependencyCase[];
const models = {
  rules: read('results-ood/RULES.jsonl') as JudgeResult[],
  deepseek: read('results-ood/OPENROUTER.jsonl') as (JudgeResult & { confidence?: number; risk?: string })[],
  jev: read('results-ood/JEV.jsonl') as JudgeResult[],
};
const safe = (c: DependencyCase) => c.gold === 'AUTO_MERGE';
const labels = cases.map(c => (safe(c) ? 1 : 0));

const jscore = (r: JudgeResult) => (r.probabilities as Record<string, number>)?.AUTO_MERGE ?? (r.autoMergeScore ?? 0);
const dsGated = (r: any) => (r.autoMergeScore ?? (r.decision === 'AUTO_MERGE' ? (r.confidence ?? 0) : 0));
const dsRaw = (r: any) => r.confidence ?? 0;
const rscore = (r: JudgeResult) => r.autoMergeScore ?? (r.decision === 'AUTO_MERGE' ? 1 : 0);

function auroc(scores: number[], ys: number[]): number | null {
  const n = scores.length;
  const order = scores.map((s, i) => [s, ys[i]] as [number, number]).sort((a, b) => a[0] - b[0]);
  const ranks = new Array(n).fill(0);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && order[j + 1][0] === order[i][0]) j++;
    const avg = (i + 1 + (j + 1)) / 2;
    for (let k = i; k <= j; k++) ranks[k] = avg;
    i = j + 1;
  }
  const nPos = ys.filter(y => y === 1).length, nNeg = n - nPos;
  if (!nPos || !nNeg) return null;
  let sum = 0;
  for (let k = 0; k < n; k++) if (order[k][1] === 1) sum += ranks[k];
  return (sum - (nPos * (nPos + 1)) / 2) / (nPos * nNeg);
}
function averagePrecision(scores: number[], ys: number[]): number {
  const P = ys.filter(y => y === 1).length;
  if (!P) return 0;
  const order = scores.map((s, i) => [s, ys[i]] as [number, number]).sort((a, b) => b[0] - a[0]);
  let tp = 0, fp = 0, ap = 0, prev = 0;
  for (const [, y] of order) {
    if (y === 1) tp++; else fp++;
    const recall = tp / P, precision = tp / (tp + fp);
    ap += (recall - prev) * precision;
    prev = recall;
  }
  return ap;
}
function percentile(xs: number[], q: number) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.max(0, Math.min(s.length - 1, Math.floor(q * s.length)))];
}
function bootstrap(n: number, iters: number, stat: (idx: number[]) => number | null) {
  const out: number[] = [];
  for (let b = 0; b < iters; b++) {
    const idx = Array.from({ length: n }, () => Math.floor(Math.random() * n));
    const v = stat(idx);
    if (v !== null && Number.isFinite(v)) out.push(v);
  }
  return { lo: percentile(out, 0.025), hi: percentile(out, 0.975), n: out.length };
}

const ranking = {
  jev_pAutoMerge: { auroc: auroc(cases.map((_, i) => jscore(models.jev[i])), labels), averagePrecision: averagePrecision(cases.map((_, i) => jscore(models.jev[i])), labels) },
  deepseek_gated: { auroc: auroc(cases.map((_, i) => dsGated(models.deepseek[i])), labels), averagePrecision: averagePrecision(cases.map((_, i) => dsGated(models.deepseek[i])), labels) },
  deepseek_rawConfidence: { auroc: auroc(cases.map((_, i) => dsRaw(models.deepseek[i])), labels), averagePrecision: averagePrecision(cases.map((_, i) => dsRaw(models.deepseek[i])), labels) },
  staticRule: { auroc: auroc(cases.map((_, i) => rscore(models.rules[i])), labels), averagePrecision: averagePrecision(cases.map((_, i) => rscore(models.rules[i])), labels) },
};

// calibration bins
const edges = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0001];
const jScores = cases.map((_, i) => jscore(models.jev[i]));
const calibration = edges.slice(0, -1).map((lo, b) => {
  const hi = edges[b + 1];
  const idx = jScores.map((s, i) => i).filter(i => jScores[i] >= lo && (b === edges.length - 2 ? jScores[i] <= hi : jScores[i] < hi));
  const n = idx.length, controls = idx.filter(i => labels[i] === 1).length;
  return { bin: [lo, hi], n, controls, breaking: n - controls, meanScore: n ? idx.reduce((s, i) => s + jScores[i], 0) / n : 0, controlRate: n ? controls / n : 0 };
});

// oracle (retrospective) metrics
const oracle = [0.99, 0.995].map(t => ({
  target: t,
  rules: summarize('Static rules', t, cases, models.rules, coverageAtPrecision(cases, models.rules, t)),
  deepseek: summarize('DeepSeek Flash', t, cases, models.deepseek, coverageAtPrecision(cases, models.deepseek, t)),
  jev: summarize('JEV', t, cases, models.jev, coverageAtPrecision(cases, models.jev, t)),
}));

// frozen thresholds from the ORIGINAL benchmark
const orig = JSON.parse(fs.readFileSync('report/table.json', 'utf8'));
const findThr = (match: string, split: string): number | null => {
  const row = (orig.fixedThreshold ?? []).find((f: any) => (f.model ?? '').includes(match) && f.split === split);
  if (!row) return null;
  return row.devThreshold ?? row.frozenThreshold ?? null;
};
const frozenDefs = [
  { policy: 'JEV — repo-disjoint (orig)', match: 'Jev', split: 'repo-disjoint', results: models.jev },
  { policy: 'JEV — time-ordered (orig)', match: 'Jev', split: 'time-ordered', results: models.jev },
  { policy: 'DeepSeek — repo-disjoint (orig)', match: 'deepseek', split: 'repo-disjoint', results: models.deepseek },
  { policy: 'Static rules — repo-disjoint (orig)', match: 'Static', split: 'repo-disjoint', results: models.rules },
];
const frozen = frozenDefs.map(d => {
  const threshold = findThr(d.match, d.split);
  if (threshold === null) return { ...d, threshold: null, note: 'no frozen threshold found' };
  const p = evaluateAtThreshold(cases, d.results, threshold);
  const amIdx = cases.map((_, i) => i).filter(i => d.results[i].decision === 'AUTO_MERGE' && ((d.results[i].autoMergeScore ?? jscore(d.results[i]) ?? -1) >= threshold));
  const breaking = cases.filter(c => !safe(c)).length;
  return {
    policy: d.policy,
    split: d.split,
    threshold,
    autoMerged: p.autoMerged,
    precision: p.precision,
    coverage: p.coverage,
    unsafe: p.unsafe,
    evaluable: p.evaluable,
    errors: p.errors,
    breakingRecall: breaking ? (breaking - p.unsafe) / breaking : 0,
    autoMergedIds: amIdx.map(i => ({ id: cases[i].id, gold: cases[i].gold })),
  };
});

// operational
function operational(name: string, results: (JudgeResult & { confidence?: number })[]) {
  const evIdx = results.map((_, i) => i).filter(i => isEvaluable(results[i]));
  const lat = evIdx.map(i => results[i].latencyMs);
  const dec = results.reduce((acc, r) => { acc[r.decision] = (acc[r.decision] ?? 0) + 1; return acc; }, {} as Record<string, number>);
  return {
    model: name,
    successful: results.filter(r => r.status !== 'error').length,
    errors: results.filter(r => r.status === 'error').length,
    evaluable: evIdx.length,
    inputTokens: results.reduce((s, r) => s + (r.usage?.inputTokens ?? 0), 0),
    outputTokens: results.reduce((s, r) => s + (r.usage?.outputTokens ?? 0), 0),
    totalCostUsd: Number(results.reduce((s, r) => s + (r.costUsd ?? 0), 0).toFixed(4)),
    costPer1kUsd: Number(((results.reduce((s, r) => s + (r.costUsd ?? 0), 0) / Math.max(1, evIdx.length)) * 1000).toFixed(4)),
    latencyMeanMs: Math.round(lat.reduce((s, x) => s + x, 0) / Math.max(1, lat.length)),
    latencyP50Ms: Math.round(percentile(lat, 0.5) ?? 0),
    latencyP95Ms: Math.round(percentile(lat, 0.95) ?? 0),
    latencyMaxMs: Math.round(lat.length ? Math.max(...lat) : 0),
    decisions: dec,
  };
}
const op = { rules: operational('Static rules', models.rules), deepseek: operational('DeepSeek Flash', models.deepseek), jev: operational('JEV', models.jev) };
const modelReturned = [...new Set((models.deepseek as any[]).map(r => r.raw?.model).filter(Boolean))];

// stratification
const dims: Array<[string, (c: DependencyCase) => string]> = [
  ['ecosystem', c => c.ecosystem ?? 'other'],
  ['update-type', c => c.updateType ?? 'unknown'],
  ['package-manager', c => c.packageManager ?? 'other'],
];
const stratified: Record<string, unknown> = {};
for (const [dim, key] of dims) {
  const values = [...new Set(cases.map(key))];
  stratified[dim] = values.map(v => {
    const idx = cases.map((_, i) => i).filter(i => key(cases[i]) === v);
    const sub = idx.map(i => cases[i]);
    const y = idx.map(i => labels[i]);
    const both = y.filter(x => x === 1).length >= 3 && y.filter(x => x === 0).length >= 3;
    const pp = coverageAtPrecision(sub, idx.map(i => models.jev[i]), 0.99);
    return {
      value: v, n: sub.length, controls: y.filter(x => x === 1).length, breaking: y.filter(x => x === 0).length,
      jevAuroc: both ? auroc(idx.map(i => jscore(models.jev[i])), y) : null,
      jevOracleCoverage99: pp.coverage, jevOraclePrecision99: pp.precision, jevOracleUnsafe99: pp.unsafe,
      note: both ? undefined : 'one-class or too small: ranking metrics omitted',
    };
  }).sort((a, b) => b.n - a.n);
}

// bootstrap CIs
const bootAuroc = bootstrap(cases.length, 2000, idx => auroc(idx.map(i => jscore(models.jev[i])), idx.map(i => labels[i])));
const jevFrozen = frozen.find(f => f.policy.startsWith('JEV — repo-disjoint'));
const dsFrozen = frozen.find(f => f.policy.startsWith('DeepSeek'));
const bootFrozenField = (threshold: number, results: JudgeResult[], field: 'coverage' | 'precision' | 'unsafe') =>
  bootstrap(cases.length, 2000, idx => evaluateAtThreshold(idx.map(i => cases[i]), idx.map(i => results[i]), threshold)[field]);
const bootJevFrozen = jevFrozen && jevFrozen.threshold !== null ? { coverage: bootFrozenField(jevFrozen.threshold, models.jev, 'coverage'), precision: bootFrozenField(jevFrozen.threshold, models.jev, 'precision') } : null;
const bootDsFrozen = dsFrozen && dsFrozen.threshold !== null ? { coverage: bootFrozenField(dsFrozen.threshold, models.deepseek, 'coverage'), precision: bootFrozenField(dsFrozen.threshold, models.deepseek, 'precision') } : null;

const classification = {
  label: 'C',
  title: 'Signal does not replicate (as a transferable decision signal), with a weak stratum-specific ordering exception',
  observations: [
    `JEV AUROC on OOD = ${ranking.jev_pAutoMerge.auroc.toFixed(3)} (95% CI ${bootAuroc.lo?.toFixed(3)}-${bootAuroc.hi?.toFixed(3)}) vs 0.851 on the original benchmark; AP ${ranking.jev_pAutoMerge.averagePrecision.toFixed(3)} vs a ${(report_controls_base_rate()).toFixed(3)} base rate.`,
    'Calibration does not transfer: the control rate per JEV score bin is non-monotonic and the 0.8-0.9 bin is 14% control (86% breaking).',
    `The frozen original threshold 0.62 auto-merges ${jevFrozen?.autoMerged} OOD cases at ${(jevFrozen?.precision ?? 0).toFixed(3)} precision with ${jevFrozen?.unsafe} unsafe merges; the frozen time-ordered threshold 1.0 auto-merges nothing.`,
    'The retrospective OOD oracle reaches 0% coverage at 99% precision for every model, so no threshold on these scores supports safe automation.',
    'The weak ordering that exists is concentrated in JavaScript (AUROC 0.673) and major updates (0.758); other strata are near or below chance (Go 0.100, Java 0.373), with small n.',
  ],
  caveat: 'The OOD label channel (in-repo revert) and population (mostly npm) differ from BUMP, and some reverts may not reflect a genuine breaking regression. That label noise would attenuate a real signal, so the failure to replicate the decision signal is firm, while the ordering signal is not proven absent.',
};
function report_controls_base_rate() { return cases.filter(c => safe(c)).length / cases.length; }

const report = {
  meta: {
    generatedAt: new Date().toISOString(),
    cases: cases.length,
    breaking: cases.filter(c => !safe(c)).length,
    controls: cases.filter(c => safe(c)).length,
    modelReturned,
    note: 'OOD validation. Frozen thresholds taken from the original 1,102-case benchmark (report/table.json). No threshold selected on OOD labels.',
  },
  ranking,
  bootstrap: { jevAuroc: bootAuroc, jevFrozenRepoDisjoint: bootJevFrozen, deepseekFrozenRepoDisjoint: bootDsFrozen },
  calibration,
  oracle,
  frozenPolicies: frozen,
  operational: op,
  stratification: stratified,
  classification,
  curves: {
    riskCoverage: { jev: autoMergeCurve(cases, models.jev), deepseek: autoMergeCurve(cases, models.deepseek), rules: autoMergeCurve(cases, models.rules) },
  },
};
fs.mkdirSync('analysis', { recursive: true });
fs.writeFileSync('analysis/ood-validation.json', JSON.stringify(report, null, 2) + '\n');

const f = (n: number | null | undefined, d = 3) => (n === null || n === undefined ? 'n/a' : n.toFixed(d));
const pct = (n: number | null | undefined, d = 2) => (n === null || n === undefined ? 'n/a' : `${(n * 100).toFixed(d)}%`);
const md: string[] = [];
md.push('# OOD Validation — dependency-update decision transfer');
md.push('');
md.push(`Independent population: **${cases.length}** cases (${report.meta.breaking} breaking / ${report.meta.controls} control), not derived from BUMP. Model returned by OpenRouter: \`${modelReturned.join(', ') || 'n/a'}\`.`);
md.push('All thresholds below are **frozen from the original 1,102-case benchmark**; none is selected on OOD labels.');
md.push('');
md.push('## 1–2. Ranking quality (positive class = control / safe-to-auto-merge)');
md.push('');
md.push('| score | AUROC | Average Precision |');
md.push('| --- | --- | --- |');
md.push(`| JEV p(AUTO_MERGE) | ${f(ranking.jev_pAutoMerge.auroc)} | ${f(ranking.jev_pAutoMerge.averagePrecision)} |`);
md.push(`| DeepSeek gated AUTO_MERGE score | ${f(ranking.deepseek_gated.auroc)} | ${f(ranking.deepseek_gated.averagePrecision)} |`);
md.push(`| DeepSeek raw confidence | ${f(ranking.deepseek_rawConfidence.auroc)} | ${f(ranking.deepseek_rawConfidence.averagePrecision)} |`);
md.push(`| Static rule (binary) | ${f(ranking.staticRule.auroc)} | ${f(ranking.staticRule.averagePrecision)} |`);
md.push('');
md.push(`Bootstrap 95% CI for JEV AUROC: **${f(bootAuroc.lo)} – ${f(bootAuroc.hi)}** (n=${cases.length}).`);
md.push('');
md.push('## 3. Risk–coverage curve (gated benchmark semantics)');
md.push('');
md.push('| model | candidates | max coverage with precision>=99% | max coverage with precision>=99.5% |');
md.push('| --- | --- | --- | --- |');
for (const [name, key] of [['JEV', 'jev'], ['DeepSeek', 'deepseek'], ['Static rules', 'rules']] as const) {
  const c99 = (oracle[0] as any)[key], c995 = (oracle[1] as any)[key];
  md.push(`| ${name} | ${c99.autoMerged} | ${pct(c99.coverage)} (prec ${pct(c99.precision)}) | ${pct(c995.coverage)} (prec ${pct(c995.precision)}) |`);
}
md.push('');
md.push('> **Oracle / retrospective** — these select the threshold on the OOD labels themselves and are shown only for reference.');
md.push('');
md.push('## 4. JEV score-bin calibration');
md.push('');
md.push('| bin | n | controls | breaking | mean score | control rate |');
md.push('| --- | --- | --- | --- | --- | --- |');
for (const b of calibration) md.push(`| [${b.bin[0].toFixed(1)}, ${b.bin[1] >= 1 ? '1.0' : b.bin[1].toFixed(1)}) | ${b.n} | ${b.controls} | ${b.breaking} | ${f(b.meanScore)} | ${pct(b.controlRate)} |`);
md.push('');
md.push('## 5–9. Frozen-threshold performance (original benchmark → OOD)');
md.push('');
md.push('| policy (frozen) | threshold | auto-merged | precision | coverage | unsafe merges | breaking recall |');
md.push('| --- | --- | --- | --- | --- | --- | --- |');
for (const fp of frozen) md.push(`| ${fp.policy} | ${fp.threshold} | ${fp.autoMerged} | ${pct(fp.precision)} | ${pct(fp.coverage)} | ${fp.unsafe} | ${pct(fp.breakingRecall)} |`);
md.push('');
if (bootJevFrozen) md.push(`Bootstrap 95% CI (JEV repo-disjoint frozen policy): coverage ${pct(bootJevFrozen.coverage.lo)}–${pct(bootJevFrozen.coverage.hi)}, precision ${pct(bootJevFrozen.precision.lo)}–${pct(bootJevFrozen.precision.hi)}.`);
if (bootDsFrozen) md.push(`Bootstrap 95% CI (DeepSeek repo-disjoint frozen policy): coverage ${pct(bootDsFrozen.coverage.lo)}–${pct(bootDsFrozen.coverage.hi)}, precision ${pct(bootDsFrozen.precision.lo)}–${pct(bootDsFrozen.precision.hi)}.`);
md.push('');
md.push('## 10. Model comparison (oracle + frozen)');
md.push('');
md.push('| model | AUROC | oracle cov@99% | oracle cov@99.5% | frozen auto-merged | frozen precision | frozen coverage | frozen unsafe |');
md.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
for (const [name, key, au, fpMatch] of [['Static rules', 'rules', ranking.staticRule.auroc, 'Static'], ['DeepSeek Flash', 'deepseek', ranking.deepseek_gated.auroc, 'DeepSeek'], ['JEV', 'jev', ranking.jev_pAutoMerge.auroc, 'JEV']] as const) {
  const o99 = (oracle[0] as any)[key], o995 = (oracle[1] as any)[key];
  const fp = frozen.find(x => x.policy.startsWith(fpMatch));
  md.push(`| ${name} | ${f(au)} | ${pct(o99.coverage)} | ${pct(o995.coverage)} | ${fp?.autoMerged ?? 'n/a'} | ${pct(fp?.precision)} | ${pct(fp?.coverage)} | ${fp?.unsafe ?? 'n/a'} |`);
}
md.push('');
md.push('## 11–13. Latency, cost, errors/retries');
md.push('');
md.push('| model | mean | p50 | p95 | max | total cost | cost/1k | in/out tok | ok/err/retry | evaluable |');
md.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const o of [op.rules, op.deepseek, op.jev]) {
  md.push(`| ${o.model} | ${o.latencyMeanMs} | ${o.latencyP50Ms} | ${o.latencyP95Ms} | ${o.latencyMaxMs} | $${o.totalCostUsd} | $${o.costPer1kUsd} | ${o.inputTokens}/${o.outputTokens} | ${o.successful}/${o.errors}/0 | ${o.evaluable} |`);
}
md.push('');
md.push('Decision distribution: ' + [op.rules, op.deepseek, op.jev].map(o => `${o.model} ${JSON.stringify(o.decisions)}`).join('; ') + '.');
md.push('');
md.push('## 14. Stratified results');
md.push('');
for (const [dim, rows] of Object.entries(stratified)) {
  md.push(`### ${dim}`);
  md.push('');
  md.push('| value | n | controls | breaking | JEV AUROC | JEV oracle cov@99 | unsafe |');
  md.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const r of rows as any[]) md.push(`| ${r.value} | ${r.n} | ${r.controls} | ${r.breaking} | ${f(r.jevAuroc)} | ${pct(r.jevOracleCoverage99)} | ${r.jevOracleUnsafe99} |`);
  md.push('');
}
md.push('## Classification');
md.push('');
md.push(`**${classification.label}. ${classification.title}**`);
md.push('');
md.push('Supporting observations:');
for (const o of classification.observations) md.push(`- ${o}`);
md.push('');
md.push(`Caveat: ${classification.caveat}`);
md.push('');
fs.writeFileSync('analysis/ood-validation.md', md.join('\n') + '\n');
console.log(JSON.stringify({ ranking, frozen: frozen.map(x => ({ policy: x.policy, threshold: x.threshold, autoMerged: x.autoMerged, precision: x.precision, coverage: x.coverage, unsafe: x.unsafe })), bootstrap: { jevAuroc: bootAuroc }, op, modelReturned }, null, 2));

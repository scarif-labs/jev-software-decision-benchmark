// @ts-nocheck
// Read-only forensic analysis of the completed 1,102-case run.
// Reads results/*.jsonl + data/dataset.jsonl and writes analysis/decision-forensics.{json,md}.
// Does not modify any benchmark input/output and does not propose a deployed threshold.
import fs from 'node:fs';
import { autoMergeCurve, coverageAtPrecision, isEvaluable } from '../src/evaluate.js';
import type { DependencyCase, JudgeResult } from '../src/types.js';

type Cls = 'AUTO_MERGE' | 'HOLD' | 'REVIEW';
const toCls = (d: string): Cls => (d === 'AUTO_MERGE' ? 'AUTO_MERGE' : d === 'HOLD' ? 'HOLD' : 'REVIEW');

const cases = fs.readFileSync('data/dataset.jsonl', 'utf8').split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l) as DependencyCase);
const caseById = new Map(cases.map(c => [c.id, c]));
const load = (f: string) => {
  const rows = fs.readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l) as JudgeResult & Record<string, unknown>);
  return new Map(rows.map(r => [(r as { id: string }).id, r]));
};
const jev = load('results/JEV.jsonl');
const ds = load('results/OPENROUTER.jsonl');
const rules = load('results/RULES.jsonl');

interface Row {
  id: string;
  safe: boolean;
  gold: string;
  updateType: string;
  splits: NonNullable<DependencyCase['splits']>;
  jevDecision: string;
  jevScore: number;
  jevProbs: Record<string, number>;
  dsDecision: string;
  dsConfidence: number | null;
  dsRisk: string | null;
  dsAuto: number | null;
  rulesDecision: string;
  rulesScore: number;
}
const rows: Row[] = cases.map(c => {
  const j = jev.get(c.id)!;
  const d = ds.get(c.id)!;
  const r = rules.get(c.id)!;
  return {
    id: c.id,
    safe: c.gold === 'AUTO_MERGE',
    gold: c.gold,
    updateType: c.updateType ?? 'unknown',
    splits: c.splits!,
    jevDecision: j.decision,
    jevScore: (j.probabilities as Record<string, number>)?.AUTO_MERGE ?? 0,
    jevProbs: (j.probabilities as Record<string, number>) ?? {},
    dsDecision: d.decision,
    dsConfidence: (d.confidence as number) ?? null,
    dsRisk: (d.risk as string) ?? null,
    dsAuto: (d.autoMergeScore as number | null) ?? (d.decision === 'AUTO_MERGE' ? ((d.confidence as number) ?? 0) : null),
    rulesDecision: r.decision,
    rulesScore: r.decision === 'AUTO_MERGE' ? 1 : 0,
  };
});

// ---------- metrics ----------
function auroc(scores: number[], labels: number[]): number | null {
  const n = scores.length;
  const order = scores.map((s, i) => [s, labels[i]] as [number, number]).sort((a, b) => a[0] - b[0]);
  const ranks = new Array(n).fill(0);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && order[j + 1][0] === order[i][0]) j++;
    const avg = (i + 1 + (j + 1)) / 2;
    for (let k = i; k <= j; k++) ranks[k] = avg;
    i = j + 1;
  }
  const nPos = labels.filter(l => l === 1).length;
  const nNeg = n - nPos;
  if (!nPos || !nNeg) return null;
  let sum = 0;
  for (let k = 0; k < n; k++) if (order[k][1] === 1) sum += ranks[k];
  return (sum - (nPos * (nPos + 1)) / 2) / (nPos * nNeg);
}
function averagePrecision(scores: number[], labels: number[]): number {
  const P = labels.filter(l => l === 1).length;
  if (!P) return 0;
  const order = scores.map((s, i) => [s, labels[i]] as [number, number]).sort((a, b) => b[0] - a[0]);
  let tp = 0, fp = 0, ap = 0, prevRecall = 0;
  for (const [, y] of order) {
    if (y === 1) tp++; else fp++;
    const recall = tp / P, precision = tp / (tp + fp);
    ap += (recall - prevRecall) * precision;
    prevRecall = recall;
  }
  return ap;
}
function prCurve(scores: number[], labels: number[]): Array<{ score: number; precision: number; recall: number; selected: number }> {
  const P = labels.filter(l => l === 1).length;
  const order = scores.map((s, i) => [s, labels[i]] as [number, number]).sort((a, b) => b[0] - a[0]);
  const out: Array<{ score: number; precision: number; recall: number; selected: number }> = [];
  let tp = 0, fp = 0;
  for (const [s, y] of order) {
    if (y === 1) tp++; else fp++;
    out.push({ score: s, precision: tp / (tp + fp), recall: P ? tp / P : 0, selected: tp + fp });
  }
  return out;
}
function bins(scores: number[], labels: number[], edges: number[]) {
  const out: Array<{ lo: number; hi: number; n: number; meanScore: number; controls: number; breaking: number; controlRate: number }> = [];
  for (let b = 0; b < edges.length - 1; b++) {
    const lo = edges[b], hi = edges[b + 1];
    const idx = scores.map((_, i) => i).filter(i => scores[i] >= lo && (b === edges.length - 2 ? scores[i] <= hi : scores[i] < hi));
    const n = idx.length;
    const controls = idx.filter(i => labels[i] === 1).length;
    const meanScore = n ? idx.reduce((s, i) => s + scores[i], 0) / n : 0;
    out.push({ lo, hi, n, meanScore, controls, breaking: n - controls, controlRate: n ? controls / n : 0 });
  }
  return out;
}

const labels = rows.map(r => (r.safe ? 1 : 0));
const jevScores = rows.map(r => r.jevScore);
const dsRaw = rows.map(r => r.dsConfidence ?? 0);
const dsGated = rows.map(r => r.dsAuto ?? 0);
const ruleScores = rows.map(r => r.rulesScore);

const ranking = {
  jev_autoMergeScore: { auroc: auroc(jevScores, labels), averagePrecision: averagePrecision(jevScores, labels) },
  deepseek_confidence_raw: { auroc: auroc(dsRaw, labels), averagePrecision: averagePrecision(dsRaw, labels) },
  deepseek_autoMergeScore_gated: { auroc: auroc(dsGated, labels), averagePrecision: averagePrecision(dsGated, labels) },
  static_rule_binary: { auroc: auroc(ruleScores, labels), averagePrecision: averagePrecision(ruleScores, labels) },
};

function gatedCoverage(subset: Row[], target: number) {
  const cs = subset.map(r => caseById.get(r.id)!);
  const rs = subset.map(r => jev.get(r.id)!) as JudgeResult[];
  return coverageAtPrecision(cs, rs, target);
}

const jevBreakingAutoMerges = rows
  .filter(r => !r.safe && r.jevDecision === 'AUTO_MERGE')
  .sort((a, b) => b.jevScore - a.jevScore)
  .map(r => ({
    id: r.id,
    jevDecision: r.jevDecision,
    jevScore: r.jevScore,
    jevProbabilities: r.jevProbs,
    deepseekDecision: r.dsDecision,
    deepseekConfidence: r.dsConfidence,
    deepseekRisk: r.dsRisk,
    staticRuleDecision: r.rulesDecision,
    updateType: r.updateType,
    repoDisjoint: r.splits.repoDisjoint,
    timeOrder: r.splits.timeOrder,
    packageFamily: r.splits.packageFamily,
  }));

const top = (list: Row[], n: number, dir: 'break' | 'control') =>
  list
    .filter(r => (dir === 'break' ? !r.safe : r.safe))
    .sort((a, b) => b.jevScore - a.jevScore)
    .slice(0, n)
    .map(r => ({ id: r.id, jevScore: r.jevScore, jevDecision: r.jevDecision, jevProbabilities: r.jevProbs, deepseekDecision: r.dsDecision, deepseekConfidence: r.dsConfidence, staticRuleDecision: r.rulesDecision, updateType: r.updateType }));
const top25Breaking = top(rows, 25, 'break');
const top25Controls = top(rows, 25, 'control');

const edges = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0001];
const calibrationBins = bins(jevScores, labels, edges);

// ---------- by split ----------
const dims: Array<[string, Array<[string, (r: Row) => boolean]>]> = [
  ['update-type', [['major', r => r.updateType === 'major'], ['minor', r => r.updateType === 'minor'], ['patch', r => r.updateType === 'patch'], ['other', r => r.updateType === 'other']]],
  ['repo-disjoint', [['train', r => r.splits.repoDisjoint === 'train'], ['test', r => r.splits.repoDisjoint === 'test']]],
  ['time-ordered', [['train', r => r.splits.timeOrder === 'train'], ['holdout', r => r.splits.timeOrder === 'holdout']]],
  ['package-family', [['rest', r => r.splits.packageFamily === 'rest'], ['stress', r => r.splits.packageFamily === 'stress']]],
  ['dependency-scope', [['direct', r => r.splits.dependencyScope === 'direct'], ['transitive', r => r.splits.dependencyScope === 'transitive']]],
];
const bySplit: Record<string, Record<string, unknown>> = {};
for (const [dim, values] of dims) {
  bySplit[dim] = {};
  for (const [value, pred] of values) {
    const sub = rows.filter(pred);
    if (!sub.length) continue;
    const lb = sub.map(r => (r.safe ? 1 : 0));
    const jevCov = gatedCoverage(sub, 0.99);
    bySplit[dim][value] = {
      n: sub.length,
      controls: sub.filter(r => r.safe).length,
      breaking: sub.filter(r => !r.safe).length,
      auroc: {
        jev: auroc(sub.map(r => r.jevScore), lb),
        deepseekConfidence: auroc(sub.map(r => r.dsConfidence ?? 0), lb),
        deepseekGated: auroc(sub.map(r => r.dsAuto ?? 0), lb),
        staticRule: auroc(sub.map(r => r.rulesScore), lb),
      },
      jevCoverage99: { coverage: jevCov.coverage, precision: jevCov.precision, unsafe: jevCov.unsafe, threshold: jevCov.threshold, autoMerged: jevCov.autoMerged },
    };
  }
}

// ---------- time-ordered problem ----------
function thresholdDiagnostics(sub: Row[], target: number) {
  const amRows = sub.filter(r => r.jevDecision === 'AUTO_MERGE').sort((a, b) => b.jevScore - a.jevScore);
  const controls = sub.filter(r => r.safe).length;
  const breaking = sub.length - controls;
  const points: Array<{ threshold: number; autoMerged: number; unsafe: number; precision: number; coverage: number }> = [];
  let unsafeSoFar = 0;
  const uniq = [...new Set(amRows.map(r => r.jevScore))];
  for (const t of uniq) {
    const sel = amRows.filter(r => r.jevScore >= t);
    const unsafe = sel.filter(r => !r.safe).length;
    points.push({ threshold: t, autoMerged: sel.length, unsafe, precision: sel.length ? (sel.length - unsafe) / sel.length : 1, coverage: sel.length / sub.length });
  }
  const feasible = points.filter(p => p.autoMerged > 0 && p.precision >= target);
  const devBreakingAuto = amRows.filter(r => !r.safe);
  const devControlAuto = amRows.filter(r => r.safe);
  return {
    n: sub.length,
    controls,
    breaking,
    autoMergeDecisions: amRows.length,
    autoMergeOnBreaking: devBreakingAuto.length,
    autoMergeOnControls: devControlAuto.length,
    maxScoreBreaking: devBreakingAuto.length ? Math.max(...devBreakingAuto.map(r => r.jevScore)) : null,
    maxScoreControl: devControlAuto.length ? Math.max(...devControlAuto.map(r => r.jevScore)) : null,
    topBreakingAutoScores: devBreakingAuto.slice(0, 10).map(r => ({ id: r.id, score: r.jevScore, updateType: r.updateType })),
    feasibleThresholds: feasible.length,
    bestFeasible: feasible.length ? feasible.reduce((a, b) => (b.coverage > a.coverage ? b : a)) : null,
    firstPoints: points.slice(0, 15),
  };
}
const timeDev = rows.filter(r => r.splits.timeOrder === 'train');
const timeHold = rows.filter(r => r.splits.timeOrder === 'holdout');
const timeOrderAnalysis = {
  dev: thresholdDiagnostics(timeDev, 0.99),
  holdout: thresholdDiagnostics(timeHold, 0.99),
  oracleHoldoutCoverage99: gatedCoverage(timeHold, 0.99),
  oracleHoldoutCoverage995: gatedCoverage(timeHold, 0.995),
};

// ---------- disagreements ----------
const disagreements = {
  jev_vs_deepseek: rows.filter(r => toCls(r.jevDecision) !== toCls(r.dsDecision)),
  jev_vs_rules: rows.filter(r => toCls(r.jevDecision) !== toCls(r.rulesDecision)),
  deepseek_vs_rules: rows.filter(r => toCls(r.dsDecision) !== toCls(r.rulesDecision)),
  all_three_disagree: rows.filter(r => new Set([toCls(r.jevDecision), toCls(r.dsDecision), toCls(r.rulesDecision)]).size === 3),
};
const disagreeRow = (r: Row) => ({
  id: r.id,
  gold: r.gold,
  updateType: r.updateType,
  jev: { decision: r.jevDecision, score: r.jevScore, probabilities: r.jevProbs },
  deepseek: { decision: r.dsDecision, confidence: r.dsConfidence, risk: r.dsRisk, autoMergeScore: r.dsAuto },
  rules: { decision: r.rulesDecision },
});
const disagreementSummary = {
  counts: {
    jev_vs_deepseek: disagreements.jev_vs_deepseek.length,
    jev_vs_rules: disagreements.jev_vs_rules.length,
    deepseek_vs_rules: disagreements.deepseek_vs_rules.length,
    all_three_disagree: disagreements.all_three_disagree.length,
  },
  jev_vs_deepseek: disagreements.jev_vs_deepseek.sort((a, b) => b.jevScore - a.jevScore).map(disagreeRow),
  jev_vs_rules: disagreements.jev_vs_rules.sort((a, b) => b.jevScore - a.jevScore).map(disagreeRow),
  all_three_disagree: disagreements.all_three_disagree.sort((a, b) => b.jevScore - a.jevScore).map(disagreeRow),
};

const jevCurve = autoMergeCurve(cases, cases.map(c => jev.get(c.id)!) as JudgeResult[]);
const dsCurve = autoMergeCurve(cases, cases.map(c => ds.get(c.id)!) as JudgeResult[]);
const rulesCurve = autoMergeCurve(cases, cases.map(c => rules.get(c.id)!) as JudgeResult[]);

const report = {
  meta: {
    generatedAt: new Date().toISOString(),
    cases: rows.length,
    controls: rows.filter(r => r.safe).length,
    breaking: rows.filter(r => !r.safe).length,
    files: ['results/JEV.jsonl', 'results/OPENROUTER.jsonl', 'results/RULES.jsonl', 'data/dataset.jsonl'],
    note: 'Read-only forensic analysis. No rerun, no result modification, no threshold proposed.',
  },
  jevBreakingAutoMerges,
  top25JevBreaking: top25Breaking,
  top25JevControls: top25Controls,
  calibrationBins,
  ranking,
  prCurve: { jev: prCurve(jevScores, labels), deepseekGated: prCurve(dsGated, labels), staticRule: prCurve(ruleScores, labels) },
  jevRiskCoverageCurve: jevCurve,
  deepseekRiskCoverageCurve: dsCurve,
  staticRuleRiskCoverageCurve: rulesCurve,
  bySplit,
  timeOrderAnalysis,
  disagreements: disagreementSummary,
};
fs.mkdirSync('analysis', { recursive: true });
fs.writeFileSync('analysis/decision-forensics.json', JSON.stringify(report, null, 2) + '\n');

// ---------- markdown ----------
const f = (n: number | null | undefined, d = 3) => (n === null || n === undefined ? 'n/a' : n.toFixed(d));
const pct = (n: number | null | undefined, d = 2) => (n === null || n === undefined ? 'n/a' : `${(n * 100).toFixed(d)}%`);
const md: string[] = [];
md.push('# Decision Forensics — JEV vs DeepSeek vs Static Rules');
md.push('');
md.push(`Read-only analysis of \`results/JEV.jsonl\`, \`results/OPENROUTER.jsonl\`, \`results/RULES.jsonl\`, \`data/dataset.jsonl\`.`);
md.push(`Cases: **${rows.length}** (${rows.filter(r => !r.safe).length} breaking / ${rows.filter(r => r.safe).length} control). No benchmark configuration was changed and no deployed threshold is proposed.`);
md.push('');
md.push('## 1. Every breaking case where JEV decided AUTO_MERGE');
md.push('');
if (!jevBreakingAutoMerges.length) md.push('_None._');
else {
  md.push('| case | JEV decision | JEV p(AUTO_MERGE) | JEV probs (AM/HOLD/RR) | DeepSeek decision | DeepSeek conf | DeepSeek risk | static rule |');
  md.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const r of jevBreakingAutoMerges) {
    md.push(`| ${r.id} | ${r.jevDecision} | ${f(r.jevScore)} | ${f(r.jevProbabilities.AUTO_MERGE)}/${f(r.jevProbabilities.HOLD)}/${f(r.jevProbabilities.REQUIRE_REVIEW)} | ${r.deepseekDecision} | ${f(r.deepseekConfidence)} | ${r.deepseekRisk ?? 'n/a'} | ${r.staticRuleDecision} |`);
  }
}
md.push('');
md.push('## 2. Top 25 JEV AUTO_MERGE scores — breaking cases');
md.push('');
md.push('| rank | case | JEV score | JEV decision | DeepSeek decision | DS conf | static rule |');
md.push('| --- | --- | --- | --- | --- | --- | --- |');
top25Breaking.forEach((r, i) => md.push(`| ${i + 1} | ${r.id} | ${f(r.jevScore)} | ${r.jevDecision} | ${r.deepseekDecision} | ${f(r.deepseekConfidence)} | ${r.staticRuleDecision} |`));
md.push('');
md.push('## 3. Top 25 JEV AUTO_MERGE scores — controls');
md.push('');
md.push('| rank | case | JEV score | JEV decision | DeepSeek decision | DS conf | static rule |');
md.push('| --- | --- | --- | --- | --- | --- | --- |');
top25Controls.forEach((r, i) => md.push(`| ${i + 1} | ${r.id} | ${f(r.jevScore)} | ${r.jevDecision} | ${r.deepseekDecision} | ${f(r.deepseekConfidence)} | ${r.staticRuleDecision} |`));
md.push('');
md.push('## 4. JEV calibration (fixed bins)');
md.push('');
md.push('| bin | n | controls | breaking | mean JEV score | control rate |');
md.push('| --- | --- | --- | --- | --- | --- |');
for (const b of calibrationBins) md.push(`| [${b.lo.toFixed(1)}, ${b.hi >= 1 ? '1.0' : b.hi.toFixed(1)}) | ${b.n} | ${b.controls} | ${b.breaking} | ${f(b.meanScore)} | ${pct(b.controlRate)} |`);
md.push('');
md.push('### Ranking quality (positive class = control / safe-to-auto-merge)');
md.push('');
md.push('| score | AUROC | average precision |');
md.push('| --- | --- | --- |');
md.push(`| JEV p(AUTO_MERGE) | ${f(ranking.jev_autoMergeScore.auroc)} | ${f(ranking.jev_autoMergeScore.averagePrecision)} |`);
md.push(`| DeepSeek raw confidence | ${f(ranking.deepseek_confidence_raw.auroc)} | ${f(ranking.deepseek_confidence_raw.averagePrecision)} |`);
md.push(`| DeepSeek gated AUTO_MERGE score | ${f(ranking.deepseek_autoMergeScore_gated.auroc)} | ${f(ranking.deepseek_autoMergeScore_gated.averagePrecision)} |`);
md.push(`| static rule (binary) | ${f(ranking.static_rule_binary.auroc)} | ${f(ranking.static_rule_binary.averagePrecision)} |`);
md.push('');
md.push('> Note: raw DeepSeek confidence is confidence in its *chosen* label, not p(AUTO_MERGE); for review decisions a high confidence is anti-correlated with auto-merge safety. The gated score sets non-AUTO_MERGE decisions to 0.');
md.push('');
md.push('### Risk–coverage (gated benchmark semantics: decision==AUTO_MERGE and score>=t)');
md.push('');
md.push('| model | coverage@99% | precision@99% | unsafe@99% | coverage@99.5% | precision@99.5% | unsafe@99.5% |');
md.push('| --- | --- | --- | --- | --- | --- | --- |');
{
  const c99j = coverageAtPrecision(cases, cases.map(c => jev.get(c.id)!) as JudgeResult[], 0.99);
  const c995j = coverageAtPrecision(cases, cases.map(c => jev.get(c.id)!) as JudgeResult[], 0.995);
  const c99d = coverageAtPrecision(cases, cases.map(c => ds.get(c.id)!) as JudgeResult[], 0.99);
  const c995d = coverageAtPrecision(cases, cases.map(c => ds.get(c.id)!) as JudgeResult[], 0.995);
  const c99r = coverageAtPrecision(cases, cases.map(c => rules.get(c.id)!) as JudgeResult[], 0.99);
  const c995r = coverageAtPrecision(cases, cases.map(c => rules.get(c.id)!) as JudgeResult[], 0.995);
  md.push(`| JEV | ${pct(c99j.coverage)} | ${pct(c99j.precision)} | ${c99j.unsafe} | ${pct(c995j.coverage)} | ${pct(c995j.precision)} | ${c995j.unsafe} |`);
  md.push(`| DeepSeek | ${pct(c99d.coverage)} | ${pct(c99d.precision)} | ${c99d.unsafe} | ${pct(c995d.coverage)} | ${pct(c995d.precision)} | ${c995d.unsafe} |`);
  md.push(`| static rules | ${pct(c99r.coverage)} | ${pct(c99r.precision)} | ${c99r.unsafe} | ${pct(c995r.coverage)} | ${pct(c995r.precision)} | ${c995r.unsafe} |`);
}
md.push('');
md.push('## 5. Score / coverage by stratification (JEV gated coverage @99%)');
md.push('');
md.push('| dimension | value | n | controls | breaking | JEV AUROC | DS conf AUROC | DS gated AUROC | rules AUROC | JEV cov@99 | JEV prec@99 | JEV unsafe@99 |');
md.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const dim of Object.keys(bySplit)) {
  for (const [value, vRaw] of Object.entries(bySplit[dim])) {
    const v = vRaw as { n: number; controls: number; breaking: number; auroc: Record<string, number | null>; jevCoverage99: { coverage: number; precision: number; unsafe: number } };
    md.push(`| ${dim} | ${value} | ${v.n} | ${v.controls} | ${v.breaking} | ${f(v.auroc.jev)} | ${f(v.auroc.deepseekConfidence)} | ${f(v.auroc.deepseekGated)} | ${f(v.auroc.staticRule)} | ${pct(v.jevCoverage99.coverage)} | ${pct(v.jevCoverage99.precision)} | ${v.jevCoverage99.unsafe} |`);
  }
}
md.push('');
md.push('## 6. Why the time-ordered development split produced no deployable JEV threshold');
md.push('');
const d = timeOrderAnalysis.dev, h = timeOrderAnalysis.holdout;
md.push(`- Time-ordered **dev** (train): n=${d.n}, ${d.breaking} breaking / ${d.controls} control. JEV made **${d.autoMergeDecisions}** AUTO_MERGE decisions, of which **${d.autoMergeOnBreaking} on breaking** cases and ${d.autoMergeOnControls} on controls.`);
md.push(`- Highest JEV score among dev breaking cases: **${f(d.maxScoreBreaking)}**; highest among dev controls: **${f(d.maxScoreControl)}**.`);
md.push(`- Dev thresholds meeting >=99% precision with nonzero coverage: **${d.feasibleThresholds}**.`);
md.push(`- Time-ordered **holdout** (oracle, retrospective): coverage@99% = ${pct(timeOrderAnalysis.oracleHoldoutCoverage99.coverage)}, precision = ${pct(timeOrderAnalysis.oracleHoldoutCoverage99.precision)}, unsafe = ${timeOrderAnalysis.oracleHoldoutCoverage99.unsafe}, with ${h.autoMergeOnBreaking} breaking AUTO_MERGE decisions out of ${h.autoMergeDecisions}.`);
md.push('');
md.push('Interpretation: the dev split contains a small number of JEV AUTO_MERGE decisions, and at least one breaking case carries a score at/above the control scores. Because precision@99% needs roughly 100 confident auto-merges to absorb a single error (1/0.01), a handful of dev auto-merges cannot satisfy the target at any threshold, so the frozen policy falls back to "do nothing". The retrospective holdout number is computed by re-selecting the threshold on the holdout labels themselves; it can find a higher cut that happens to exclude that split\'s risky case, which is not a deployable rule. This is a small-sample calibration problem, not evidence that JEV\'s signal is absent: JEV still ranks controls above breaking overall (AUROC ' + f(ranking.jev_autoMergeScore.auroc) + ').');
md.push('');
md.push('## 7. Ranking comparison');
md.push('');
md.push(`- JEV p(AUTO_MERGE): AUROC **${f(ranking.jev_autoMergeScore.auroc)}**, AP **${f(ranking.jev_autoMergeScore.averagePrecision)}**.`);
md.push(`- DeepSeek gated AUTO_MERGE score: AUROC **${f(ranking.deepseek_autoMergeScore_gated.auroc)}**, AP **${f(ranking.deepseek_autoMergeScore_gated.averagePrecision)}**.`);
md.push(`- DeepSeek raw confidence: AUROC **${f(ranking.deepseek_confidence_raw.auroc)}**, AP **${f(ranking.deepseek_confidence_raw.averagePrecision)}**.`);
md.push(`- Static rule (binary): AUROC **${f(ranking.static_rule_binary.auroc)}**, AP **${f(ranking.static_rule_binary.averagePrecision)}**.`);
md.push('');
md.push('## 8. Disagreements (mapped to AUTO_MERGE / HOLD / REVIEW)');
md.push('');
md.push(`- JEV vs DeepSeek: **${disagreementSummary.counts.jev_vs_deepseek}**`);
md.push(`- JEV vs static rules: **${disagreementSummary.counts.jev_vs_rules}**`);
md.push(`- DeepSeek vs static rules: **${disagreementSummary.counts.deepseek_vs_rules}**`);
md.push(`- All three disagree: **${disagreementSummary.counts.all_three_disagree}**`);
md.push('');
md.push('### All-three-disagree cases (top 25 by JEV score)');
md.push('');
md.push('| case | gold | update type | JEV | JEV score | DeepSeek | DS conf | rules |');
md.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
disagreementSummary.all_three_disagree.slice(0, 25).forEach(r => md.push(`| ${r.id} | ${r.gold} | ${r.updateType} | ${r.jev.decision} | ${f(r.jev.score)} | ${r.deepseek.decision} | ${f(r.deepseek.confidence)} | ${r.rules.decision} |`));
md.push('');
md.push('### JEV vs DeepSeek disagreements (top 25 by JEV score)');
md.push('');
md.push('| case | gold | JEV | JEV score | DeepSeek | DS conf | rules |');
md.push('| --- | --- | --- | --- | --- | --- | --- |');
disagreementSummary.jev_vs_deepseek.slice(0, 25).forEach(r => md.push(`| ${r.id} | ${r.gold} | ${r.jev.decision} | ${f(r.jev.score)} | ${r.deepseek.decision} | ${f(r.deepseek.confidence)} | ${r.rules.decision} |`));
md.push('');
md.push('### JEV vs static-rule disagreements (top 25 by JEV score)');
md.push('');
md.push('| case | gold | JEV | JEV score | rules | DeepSeek | DS conf |');
md.push('| --- | --- | --- | --- | --- | --- | --- |');
disagreementSummary.jev_vs_rules.slice(0, 25).forEach(r => md.push(`| ${r.id} | ${r.gold} | ${r.jev.decision} | ${f(r.jev.score)} | ${r.rules.decision} | ${r.deepseek.decision} | ${f(r.deepseek.confidence)} |`));
md.push('');
md.push('## Conclusion');
md.push('');
md.push(`JEV's p(AUTO_MERGE) carries a genuine, transferable ordering signal (AUROC ${f(ranking.jev_autoMergeScore.auroc)}), stronger than DeepSeek's gated score (${f(ranking.deepseek_autoMergeScore_gated.auroc)}) and the static binary rule (${f(ranking.static_rule_binary.auroc)}). Its weakness is the *magnitude* of high-confidence mass: few cases reach the probability level required to sustain 99% precision under a frozen threshold, so deployable coverage is small and temporally fragile. DeepSeek is conservative (most cases go to HUMAN_REVIEW) and its raw confidence is not an auto-merge probability; gated, it ranks worse than JEV. The static rule gets high held-out coverage only because its binary score and the fallback threshold collapse the gate to "merge everything it flags", and it is the only model that produced an unsafe auto-merge in the oracle policy.`);
md.push('');
fs.writeFileSync('analysis/decision-forensics.md', md.join('\n') + '\n');
console.log(`wrote analysis/decision-forensics.json and analysis/decision-forensics.md`);
console.log(JSON.stringify({ jevBreakingAutoMerges: jevBreakingAutoMerges.length, ranking, disagree: disagreementSummary.counts, timeDev: { autoMergeDecisions: d.autoMergeDecisions, onBreaking: d.autoMergeOnBreaking, maxScoreBreaking: d.maxScoreBreaking, maxScoreControl: d.maxScoreControl, feasible: d.feasibleThresholds }, holdoutOracle: timeOrderAnalysis.oracleHoldoutCoverage99 }, null, 2));

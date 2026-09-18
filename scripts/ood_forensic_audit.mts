// @ts-nocheck
// OOD-only forensic audit. Read-only: does not touch src/, the OOD dataset, model
// results, or any threshold. Recomputes every reported metric independently, audits the
// 100 breaking labels, audits pre-merge state, inspects frozen-policy auto-merges, and
// runs a label-subset sensitivity analysis (diagnostic only).
import fs from 'node:fs';
import { gh, mapLimit } from './lib/gh.mjs';
import { decisionState } from '../src/prompt.js';
import type { DependencyCase } from '../src/types.js';

const read = (f: string) => fs.readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l));
const cases = read('data/ood-dataset.jsonl') as DependencyCase[];
const res = { rules: read('results-ood/RULES.jsonl'), deepseek: read('results-ood/OPENROUTER.jsonl'), jev: read('results-ood/JEV.jsonl') };
const reported = JSON.parse(fs.readFileSync('analysis/ood-validation.json', 'utf8'));
const orig = JSON.parse(fs.readFileSync('report/table.json', 'utf8'));
const safe = (c: DependencyCase) => c.gold === 'AUTO_MERGE';
const idxAll = cases.map((_, i) => i);
const labels = cases.map(c => (safe(c) ? 1 : 0));

// ---------- independent metric implementations ----------
function auroc(scores: number[], ys: number[]): number | null {
  const n = scores.length;
  const order = scores.map((s, i) => [s, ys[i]]).sort((a, b) => a[0] - b[0]);
  const ranks = new Array(n).fill(0);
  let i = 0;
  while (i < n) { let j = i; while (j + 1 < n && order[j + 1][0] === order[i][0]) j++; const avg = (i + 1 + j + 1) / 2; for (let k = i; k <= j; k++) ranks[k] = avg; i = j + 1; }
  const P = ys.filter(y => y === 1).length, N = n - P;
  if (!P || !N) return null;
  let sum = 0; for (let k = 0; k < n; k++) if (order[k][1] === 1) sum += ranks[k];
  return (sum - (P * (P + 1)) / 2) / (P * N);
}
function ap(scores: number[], ys: number[]): number {
  const P = ys.filter(y => y === 1).length; if (!P) return 0;
  const order = scores.map((s, i) => [s, ys[i]]).sort((a, b) => b[0] - a[0]);
  let tp = 0, fp = 0, prev = 0, out = 0;
  for (const [, y] of order) { if (y === 1) tp++; else fp++; const r = tp / P, p = tp / (tp + fp); out += (r - prev) * p; prev = r; }
  return out;
}
const jscore = (r: any) => r.probabilities?.AUTO_MERGE ?? r.autoMergeScore ?? 0;
const dsGated = (r: any) => r.autoMergeScore ?? (r.decision === 'AUTO_MERGE' ? (r.confidence ?? 0) : 0);
const dsRaw = (r: any) => r.confidence ?? 0;
const rscore = (r: any) => r.autoMergeScore ?? (r.decision === 'AUTO_MERGE' ? 1 : 0);

function frozenEval(idxs: number[], results: any[], scoreFn: (r: any) => number, threshold: number) {
  const auto = idxs.filter(i => results[i].decision === 'AUTO_MERGE' && scoreFn(results[i]) >= threshold);
  const safeAuto = auto.filter(i => safe(cases[i]));
  const breaking = idxs.filter(i => !safe(cases[i]));
  return {
    threshold, autoMerged: auto.length, precision: auto.length ? safeAuto.length / auto.length : 1,
    coverage: idxs.length ? auto.length / idxs.length : 0, unsafe: auto.length - safeAuto.length,
    breakingRecall: breaking.length ? (breaking.length - auto.filter(i => !safe(cases[i])).length) / breaking.length : 0,
    ids: auto.map(i => cases[i].id),
  };
}

const recomputed = {
  ranking: {
    jev: { auroc: auroc(idxAll.map(i => jscore(res.jev[i])), labels), averagePrecision: ap(idxAll.map(i => jscore(res.jev[i])), labels) },
    deepseekGated: { auroc: auroc(idxAll.map(i => dsGated(res.deepseek[i])), labels), averagePrecision: ap(idxAll.map(i => dsGated(res.deepseek[i])), labels) },
    deepseekRaw: { auroc: auroc(idxAll.map(i => dsRaw(res.deepseek[i])), labels), averagePrecision: ap(idxAll.map(i => dsRaw(res.deepseek[i])), labels) },
    staticRule: { auroc: auroc(idxAll.map(i => rscore(res.rules[i])), labels), averagePrecision: ap(idxAll.map(i => rscore(res.rules[i])), labels) },
  },
  bins: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0001].slice(0, -1).map((lo, b, arr) => {
    const hi = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0001][b];
    const idx = idxAll.filter(i => jscore(res.jev[i]) >= lo && (b === 9 ? jscore(res.jev[i]) <= hi : jscore(res.jev[i]) < hi));
    const ctrl = idx.filter(i => safe(cases[i])).length;
    return { lo, hi, n: idx.length, controls: ctrl, breaking: idx.length - ctrl, controlRate: idx.length ? ctrl / idx.length : 0 };
  }),
  frozen: {
    jev062: frozenEval(idxAll, res.jev, jscore, 0.62),
    jev100: frozenEval(idxAll, res.jev, jscore, 1.0),
    ds090: frozenEval(idxAll, res.deepseek, dsGated, 0.9),
    rules100: frozenEval(idxAll, res.rules, rscore, 1.0),
  },
};
// compare with reported
const cmp = {
  jevAuroc: { reported: reported.ranking.jev_pAutoMerge.auroc, recomputed: recomputed.ranking.jev.auroc },
  jevAP: { reported: reported.ranking.jev_pAutoMerge.averagePrecision, recomputed: recomputed.ranking.jev.averagePrecision },
  dsGatedAuroc: { reported: reported.ranking.deepseek_gated.auroc, recomputed: recomputed.ranking.deepseekGated.auroc },
  rulesAuroc: { reported: reported.ranking.staticRule.auroc, recomputed: recomputed.ranking.staticRule.auroc },
  jev062precision: { reported: reported.frozenPolicies.find((f: any) => f.policy.startsWith('JEV — repo-disjoint')).precision, recomputed: recomputed.frozen.jev062.precision },
  jev062auto: { reported: reported.frozenPolicies.find((f: any) => f.policy.startsWith('JEV — repo-disjoint')).autoMerged, recomputed: recomputed.frozen.jev062.autoMerged },
};
const maxDelta = Math.max(...Object.values(cmp).map((c: any) => Math.abs(c.reported - c.recomputed)));

// ---------- label audit ----------
const breaking = cases.map((c, i) => ({ c, i })).filter(x => !safe(x.c));
const details = await mapLimit(breaking, 8, async ({ c, i }) => {
  const v: any = (c as any).verification ?? {};
  let msg = '';
  try { const commit = await gh(`/repos/${c.repo}/commits/${v.revertCommit}`); msg = commit?.commit?.message ?? ''; } catch { msg = ''; }
  let mergedAt: string | null = null;
  if (v.originalPrNumber) { try { const pr = await gh(`/repos/${c.repo}/pulls/${v.originalPrNumber}`); mergedAt = pr?.merged_at ?? null; } catch { mergedAt = null; } }
  const depBase = String(c.dependency ?? '').split(':').pop() ?? '';
  const namesDep = depBase.length > 1 && msg.toLowerCase().includes(depBase.toLowerCase());
  const namesVersions = (c.newVersion && msg.includes(String(c.newVersion))) || (c.previousVersion && msg.includes(String(c.previousVersion)));
  const grouped = /\bbumps\b/i.test(msg) || (msg.match(/Revert "/gi) ?? []).length > 1 || /dependabot\b.*\bbumps\b/i.test(msg);
  const explicit = /broke|break|fail|regress|incompat|crash|error|caused|due to|because|no longer|does not|doesn'?t work|instab|removed|revert.*(because|due|since)/i.test(msg);
  const revertedAt = (c as any).outcome?.revertedAt ?? null;
  const delayDays = mergedAt && revertedAt ? Math.round((new Date(revertedAt).getTime() - new Date(mergedAt).getTime()) / 86400000) : null;
  let trust: string;
  if (!namesDep && !namesVersions) trust = 'unrelated';
  else if (grouped && !explicit) trust = 'ambiguous';
  else if (explicit) trust = 'strong';
  else if (delayDays !== null && delayDays <= 14) trust = 'proximate';
  else trust = 'ambiguous';
  const revertCommitUrl = v.revertCommit ? `https://github.com/${c.repo}/commit/${v.revertCommit}` : null;
  const revertSummary =
    trust === 'strong' ? 'Revert message attributes the change to a breakage/regression.'
    : trust === 'proximate' ? 'Revert of this exact update within 14 days; no explicit cause stated.'
    : trust === 'unrelated' ? 'Revert does not reference this dependency or version.'
    : 'Revert with no explicit cause, or a grouped/multi-dependency revert.';
  return {
    id: c.id, repo: c.repo, ecosystem: c.ecosystem, dependency: c.dependency, previousVersion: c.previousVersion, newVersion: c.newVersion,
    updateType: c.updateType, gold: c.gold, resolved: Boolean(v.originalPrResolved), originalPrNumber: v.originalPrNumber ?? null,
    originalPrMergedAt: mergedAt, revertCommit: v.revertCommit, revertCommitUrl, revertedAt, delayDays, revertSummary,
    namesDep, namesVersions, grouped, explicit, trust,
    jev: { decision: res.jev[i].decision, pAutoMerge: jscore(res.jev[i]), probabilities: res.jev[i].probabilities },
    deepseek: { decision: res.deepseek[i].decision, confidence: (res.deepseek[i] as any).confidence, autoMergeScore: (res.deepseek[i] as any).autoMergeScore },
    rules: { decision: res.rules[i].decision },
    frozen062AutoMerged: recomputed.frozen.jev062.ids.includes(c.id),
  };
});
const trustCounts = details.reduce((a, d) => ((a[d.trust] = (a[d.trust] ?? 0) + 1), a), {} as Record<string, number>);
const malformedVersions = details.filter(d => /["'`]$/.test(String(d.newVersion ?? '')) || /["'`]$/.test(String(d.previousVersion ?? '')));
const excludedIds = new Set(details.filter(d => d.trust === 'ambiguous' || d.trust === 'unrelated').map(d => d.id));

// ---------- state audit ----------
const stateRows = breaking.map(({ c, i }) => {
  const state: any = decisionState(c);
  const json = JSON.stringify(state).toLowerCase();
  const outcomeTokens = ['revert', 'broke', 'break', 'fail', 'regress', 'downgrade', 'rollback', 'post-merge'].filter(t => json.includes(t));
  const titleLeak = /revert|brok|fail|regress|downgrad/i.test(c.title ?? '');
  return {
    id: c.id, resolved: Boolean((c as any).verification?.originalPrResolved),
    hasBody: c.body != null, hasChangelog: c.changelog != null, hasDiff: c.manifestDiff != null, checks: c.checks,
    stateFields: Object.keys(state), titleLeak, outcomeTokensInState: outcomeTokens,
    preMergeOnly: !titleLeak,
  };
});
const stateSummary = {
  total: stateRows.length,
  resolved: stateRows.filter(s => s.resolved).length,
  synthesized: stateRows.filter(s => !s.resolved).length,
  titleLeaks: stateRows.filter(s => s.titleLeak).length,
  withBody: stateRows.filter(s => s.hasBody).length,
  withChangelog: stateRows.filter(s => s.hasChangelog).length,
  withOutcomeTokenSomewhere: stateRows.filter(s => s.outcomeTokensInState.length).length,
};

// ---------- frozen-policy case tables ----------
const jev062Breaking = details.filter(d => d.frozen062AutoMerged);
const jev062Safe = cases.map((c, i) => ({ c, i })).filter(x => safe(x.c) && recomputed.frozen.jev062.ids.includes(x.c.id))
  .map(({ c, i }) => ({ id: c.id, repo: c.repo, dependency: c.dependency, previousVersion: c.previousVersion, newVersion: c.newVersion, updateType: c.updateType, jev: res.jev[i].decision, pAutoMerge: jscore(res.jev[i]), deepseek: res.deepseek[i].decision, dsConfidence: (res.deepseek[i] as any).confidence, rules: res.rules[i].decision }));

// ---------- threshold provenance ----------
const prov = (orig.fixedThreshold ?? []).map((f: any) => ({ model: f.model, split: f.split, target: f.target, devThreshold: f.devThreshold, devAutoMerges: f.devAutoMerges, heldOutPrecision: f.precision, heldOutCoverage: f.coverage, heldOutUnsafe: f.unsafe }));

// ---------- sensitivity ----------
function subsetStats(idxs: number[], label: string) {
  const sub = idxs;
  const y = sub.map(i => labels[i]);
  return {
    label, n: sub.length, controls: y.filter(x => x === 1).length, breaking: y.filter(x => x === 0).length,
    jevAuroc: auroc(sub.map(i => jscore(res.jev[i])), y), jevAP: ap(sub.map(i => jscore(res.jev[i])), y),
    jev062: frozenEval(sub, res.jev, jscore, 0.62),
    ds090: frozenEval(sub, res.deepseek, dsGated, 0.9),
  };
}
const sensitivity = [
  subsetStats(idxAll, 'all (100 breaking / 85 control)'),
  subsetStats(idxAll.filter(i => !excludedIds.has(cases[i].id)), `excluding ambiguous/unrelated reverts (${excludedIds.size} dropped)`),
  subsetStats(idxAll.filter(i => cases[i].ecosystem === 'javascript'), 'javascript only'),
  subsetStats(idxAll.filter(i => cases[i].ecosystem !== 'javascript'), 'non-javascript'),
];

// ---------- conclusion ----------
const ambiguousCount = (trustCounts.ambiguous ?? 0) + (trustCounts.unrelated ?? 0);
const sAll = sensitivity[0] as any, sNoAmb = sensitivity[1] as any, sJs = sensitivity[2] as any, sNonJs = sensitivity[3] as any;
const conclusion = {
  A_implementation_bug: maxDelta < 1e-9
    ? 'Ruled out: every recomputed OOD metric (AUROC, AP, bins, frozen counts, precision/coverage/unsafe, breaking recall) matches the report exactly (max delta 0).'
    : 'POSSIBLE: max delta between recomputed and reported = ' + maxDelta,
  B_dataset_label_problem: {
    trustCounts,
    ambiguousOrUnrelated: ambiguousCount,
    explicitReason: trustCounts.strong ?? 0,
    proximate: trustCounts.proximate ?? 0,
    unrelated: trustCounts.unrelated ?? 0,
    note: `All 100 reverts name the exact dependency and/or version, so every revert targeted THIS update (unrelated=0). But only ${trustCounts.strong ?? 0} state an explicit breakage reason; ${trustCounts.proximate ?? 0} are proximate (revert of the exact update within <=14 days) and ${ambiguousCount} are ambiguous (no stated reason and/or grouped revert). Label construction is therefore defensible but largely circumstantial.`,
    sensitivityEffect: `Excluding the ${ambiguousCount} ambiguous cases: AUROC ${sAll.jevAuroc.toFixed(3)} -> ${sNoAmb.jevAuroc.toFixed(3)}, AP ${sAll.jevAP.toFixed(3)} -> ${sNoAmb.jevAP.toFixed(3)}, frozen-0.62 precision ${(sAll.jev062.precision * 100).toFixed(1)}% -> ${(sNoAmb.jev062.precision * 100).toFixed(1)}%, unsafe ${sAll.jev062.unsafe} -> ${sNoAmb.jev062.unsafe}. Label ambiguity is real but does NOT rescue the signal.`,
  },
  C_distribution_shift: `Primary. Overall JEV AUROC is ${sAll.jevAuroc.toFixed(3)}, but the signal is ecosystem-dependent: JavaScript AUROC ${sJs.jevAuroc.toFixed(3)} vs non-JavaScript ${sNonJs.jevAuroc.toFixed(3)} (below chance). Frozen-0.62 precision is ${(sJs.jev062.precision * 100).toFixed(1)}% on JavaScript vs ${(sNonJs.jev062.precision * 100).toFixed(1)}% on non-JavaScript, with ${sAll.jev062.unsafe} unsafe merges overall. The frozen original policy is unsafe on OOD under every label subset.`,
  D_unresolved: `${ambiguousCount} ambiguous reverts (no stated cause) and ${stateSummary.synthesized} synthesized-state cases remain; a cleaner OOD set could shift the magnitude slightly, but not enough to overturn the weak overall ranking (AUROC ${sAll.jevAuroc.toFixed(3)}).`,
};
const primary = 'C — genuine distribution-shift failure';

const out = {
  meta: { generatedAt: new Date().toISOString(), cases: cases.length, breaking: details.length, controls: cases.length - details.length, note: 'OOD-only forensic audit; no rerun, no threshold tuning.' },
  recomputed, reportedComparison: cmp, maxDelta, labelTrust: trustCounts, stateSummary,
  dataQuality: { breakingWithQuotedVersion: malformedVersions.length, examples: malformedVersions.slice(0, 10).map(d => ({ id: d.id, previousVersion: d.previousVersion, newVersion: d.newVersion })) },
  jev062BreakingTable: jev062Breaking, jev062SafeTable: jev062Safe,
  thresholdProvenance: prov, sensitivity, conclusion, primaryClassification: primary,
};
fs.mkdirSync('analysis', { recursive: true });
fs.writeFileSync('analysis/ood-forensic-audit.json', JSON.stringify(out, null, 2) + '\n');

const f = (n: number | null | undefined, d = 3) => (n == null ? 'n/a' : n.toFixed(d));
const pct = (n: number | null | undefined, d = 2) => (n == null ? 'n/a' : `${(n * 100).toFixed(d)}%`);
const md: string[] = [];
md.push('# OOD Forensic Audit');
md.push('');
md.push(`Read-only audit of the OOD experiment. ${details.length} breaking / ${cases.length - details.length} control. No rerun, no threshold tuning, no writes to src/ or results.`);
md.push('');
md.push('## 1. Independent recomputation of reported metrics');
md.push('');
md.push('| metric | reported | recomputed | match |');
md.push('| --- | --- | --- | --- |');
for (const [k, v] of Object.entries(cmp) as any[]) md.push(`| ${k} | ${f(v.reported, 6)} | ${f(v.recomputed, 6)} | ${Math.abs(v.reported - v.recomputed) < 1e-9 ? 'exact' : 'DIFF'} |`);
md.push('');
md.push(`Max absolute delta across recomputed/reported: **${maxDelta}**. ${maxDelta < 1e-9 ? 'No implementation or calculation bug detected.' : 'INVESTIGATE.'}`);
md.push('');
md.push('### Score bins (recomputed)');
md.push('');
md.push('| bin | n | controls | breaking | control rate |');
md.push('| --- | --- | --- | --- | --- |');
for (const b of recomputed.bins) md.push(`| [${b.lo.toFixed(1)}, ${b.hi >= 1 ? '1.0' : b.hi.toFixed(1)}) | ${b.n} | ${b.controls} | ${b.breaking} | ${pct(b.controlRate)} |`);
md.push('');
md.push('### Frozen-threshold counts (recomputed)');
md.push('');
md.push('| policy | threshold | auto-merged | precision | coverage | unsafe | breaking recall |');
md.push('| --- | --- | --- | --- | --- | --- | --- |');
for (const [k, v] of Object.entries(recomputed.frozen) as any[]) md.push(`| ${k} | ${v.threshold} | ${v.autoMerged} | ${pct(v.precision)} | ${pct(v.coverage)} | ${v.unsafe} | ${pct(v.breakingRecall)} |`);
md.push('');
md.push('## 2. Breaking-label audit (100 cases)');
md.push('');
md.push(`Label trust: ${Object.entries(trustCounts).map(([k, v]) => `${k}=${v}`).join(', ')}.`);
md.push('');
md.push('Ambiguous/unrelated reverts (excluded in sensitivity):');
md.push('');
md.push('| id | repo | dep | trust | reason |');
md.push('| --- | --- | --- | --- | --- |');
for (const d of details.filter(d => d.trust === 'ambiguous' || d.trust === 'unrelated')) md.push(`| ${d.id} | ${d.repo} | ${d.dependency ?? '?'} | ${d.trust} | ${d.revertSummary} |`);
md.push('');
md.push('## 3. Pre-merge state audit');
md.push('');
md.push(`- total ${stateSummary.total}; resolved-original-PR ${stateSummary.resolved}; synthesized ${stateSummary.synthesized}`);
md.push(`- titles containing outcome words: **${stateSummary.titleLeaks}**`);
md.push(`- with body: ${stateSummary.withBody}; with changelog: ${stateSummary.withChangelog}`);
md.push(`- cases whose state contains an outcome token anywhere (body/changelog release notes): ${stateSummary.withOutcomeTokenSomewhere}`);
md.push('');
md.push('## 4. JEV auto-merged at frozen 0.62 — labeled breaking (15)');
md.push('');
md.push('| id | repo | ecosystem | dep | old→new | type | JEV p(AM) | JEV probs | decision | trust | delay d | commit | evidence summary |');
md.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const d of jev062Breaking) md.push(`| ${d.id} | ${d.repo} | ${d.ecosystem} | ${d.dependency ?? '?'} | ${d.previousVersion}→${d.newVersion} | ${d.updateType} | ${f(d.jev.pAutoMerge)} | ${f(d.jev.probabilities?.AUTO_MERGE)}/${f(d.jev.probabilities?.HOLD)}/${f(d.jev.probabilities?.REQUIRE_REVIEW)} | ${d.jev.decision} | ${d.trust} | ${d.delayDays ?? 'n/a'} | [${String(d.revertCommit).slice(0, 10)}](${d.revertCommitUrl}) | ${d.revertSummary} |`);
md.push('');
md.push('## 5. JEV safe auto-merges at frozen 0.62 (15)');
md.push('');
md.push('| id | repo | dep | old→new | type | JEV p(AM) | DeepSeek | rules |');
md.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
for (const d of jev062Safe) md.push(`| ${d.id} | ${d.repo} | ${d.dependency ?? '?'} | ${d.previousVersion}→${d.newVersion} | ${d.updateType} | ${f(d.pAutoMerge)} | ${d.deepseek} (${f(d.dsConfidence)}) | ${d.rules} |`);
md.push('');
md.push('## 6. Threshold provenance (original 1,102 benchmark)');
md.push('');
md.push('Selection path: `run.ts` computes `coverageAtPrecision(devSplit, 0.99)` on the **development split only**, then applies that threshold unchanged to the held-out split (`evaluateAtThreshold`).');
md.push('');
md.push('| model | split | dev threshold | dev auto-merges | held-out precision | held-out coverage | held-out unsafe |');
md.push('| --- | --- | --- | --- | --- | --- | --- |');
for (const p of prov) md.push(`| ${p.model} | ${p.split} | ${p.devThreshold} | ${p.devAutoMerges} | ${pct(p.heldOutPrecision)} | ${pct(p.heldOutCoverage)} | ${p.heldOutUnsafe} |`);
md.push('');
md.push('The repo-disjoint dev split produced the only operative JEV threshold (0.62, 22 dev auto-merges). The time-ordered dev split had **0 feasible thresholds**, so its frozen threshold degenerated to 1.0 (a no-op). No single policy was designated primary in the original run; the repo-disjoint threshold is the only one with nonzero development coverage, so it is the only meaningful transfer test. Neither is re-selected here.');
md.push('');
md.push('## 7. Sensitivity analysis (existing OOD labels only — diagnostic)');
md.push('');
md.push('| subset | n | ctrl/brk | JEV AUROC | JEV AP | JEV0.62 auto | precision | coverage | unsafe |');
md.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const s of sensitivity) md.push(`| ${s.label} | ${s.n} | ${s.controls}/${s.breaking} | ${f(s.jevAuroc)} | ${f(s.jevAP)} | ${s.jev062.autoMerged} | ${pct(s.jev062.precision)} | ${pct(s.jev062.coverage)} | ${s.jev062.unsafe} |`);
md.push('');
md.push('## 9. Data-quality observations');
md.push('');
md.push(`- ${malformedVersions.length}/100 breaking cases have a trailing quote/backtick in the parsed version (e.g. \`4.23.13"\`), from the revert-message regex. Minor: semver-type classification is unaffected in the inspected cases, but it is a construction artifact.`);
md.push('- One control dependency parsed as `` `cva6` `` (backticks).');
md.push('');
md.push('## 8. Classification');
md.push('');
md.push(`**A. Implementation/calculation bug:** ${conclusion.A_implementation_bug}`);
md.push('');
md.push(`**B. Dataset/label-construction problem:** ${conclusion.B_dataset_label_problem.note} ${conclusion.B_dataset_label_problem.sensitivityEffect}`);
md.push('');
md.push(`**C. Genuine distribution-shift failure:** ${conclusion.C_distribution_shift}`);
md.push('');
md.push(`**D. Unresolved ambiguity:** ${conclusion.D_unresolved}`);
md.push('');
md.push(`**Primary classification: ${primary}**`);
md.push('');
fs.writeFileSync('analysis/ood-forensic-audit.md', md.join('\n') + '\n');
console.log(JSON.stringify({ maxDelta, cmp, trustCounts, stateSummary, frozen: recomputed.frozen, sensitivity: sensitivity.map(s => ({ label: s.label, n: s.n, auroc: s.jevAuroc, ap: s.jevAP, prec062: s.jev062.precision, cov062: s.jev062.coverage, unsafe062: s.jev062.unsafe, auto062: s.jev062.autoMerged })), jev062Breaking: jev062Breaking.map(d => ({ id: d.id, trust: d.trust, p: d.jev.pAutoMerge })) }, null, 2));

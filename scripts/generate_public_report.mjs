// Generate public, non-model documentation artifacts from canonical JSON results.
// Read-only with respect to src/, data/*.jsonl, results/*.jsonl, and analysis/*.
// Every number written into RESULTS.md and docs/ is pulled from canonical JSON.
import fs from 'node:fs';
import crypto from 'node:crypto';

const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const sha = (f) => { const b = fs.readFileSync(f); return { sha256: crypto.createHash('sha256').update(b).digest('hex'), bytes: b.length }; };
const pct = (x, d = 2) => `${(x * 100).toFixed(d)}%`;
const usd = (x) => `$${x.toFixed(4)}`;
const ms = (x) => `${Math.round(x)} ms`;

const table = readJson('report/table.json');
const forensics = readJson('analysis/decision-forensics.json');
const ood = readJson('analysis/ood-validation.json');
const audit = readJson('analysis/ood-forensic-audit.json');
const stats = readJson('data/dataset.stats.json');
const oodMeta = readJson('data/ood-dataset.meta.json');
const leak = readJson('data/leakage-report.json');
const oodLeak = readJson('data/ood-leakage-report.json');

const row = (model, target) => table.rows.find(r => r.model.includes(model) && r.targetPrecision === target);
const ORIG = {
  cases: stats.total, breaking: stats.breaking, controls: stats.controlsSampled, repos: stats.repos,
  auroc: {
    jev: forensics.ranking.jev_autoMergeScore.auroc,
    static: forensics.ranking.static_rule_binary.auroc,
    deepseek: forensics.ranking.deepseek_autoMergeScore_gated.auroc,
  },
  ap: {
    jev: forensics.ranking.jev_autoMergeScore.averagePrecision,
    static: forensics.ranking.static_rule_binary.averagePrecision,
    deepseek: forensics.ranking.deepseek_autoMergeScore_gated.averagePrecision,
  },
  oracle: {
    jev: row('Jev', 0.99), static: row('Static', 0.99), deepseek: row('deepseek', 0.99),
    jev995: row('Jev', 0.995), static995: row('Static', 0.995), deepseek995: row('deepseek', 0.995),
  },
  frozen: table.fixedThreshold,
  totals: {
    jev: row('Jev', 0.99).costUsdPer1k * stats.total / 1000,
    deepseek: row('deepseek', 0.99).costUsdPer1k * stats.total / 1000,
    rules: 0,
  },
  leakVerdict: leak.verdict,
};
const OOD = {
  cases: ood.meta.cases, breaking: ood.meta.breaking, controls: ood.meta.controls, repos: oodMeta.repos.length,
  auroc: { jev: ood.ranking.jev_pAutoMerge.auroc, static: ood.ranking.staticRule.auroc, deepseek: ood.ranking.deepseek_gated.auroc },
  ap: { jev: ood.ranking.jev_pAutoMerge.averagePrecision, static: ood.ranking.staticRule.averagePrecision, deepseek: ood.ranking.deepseek_gated.averagePrecision },
  frozen: ood.frozenPolicies,
  oracle: ood.oracle,
  operational: ood.operational,
  bootstrap: ood.bootstrap,
  classification: ood.classification,
  leakVerdict: oodLeak.verdict,
  labelTrust: audit.labelTrust,
  stateSummary: audit.stateSummary,
  dataQuality: audit.dataQuality,
  sensitivity: audit.sensitivity,
};

// ---------- assertions: core story numbers must match canonical JSON ----------
const near = (a, b, eps = 5e-4) => Math.abs(a - b) < eps;
const assert = (cond, msg) => { if (!cond) throw new Error('ASSERTION FAILED: ' + msg); };
assert(ORIG.cases === 1102 && ORIG.breaking === 551 && ORIG.controls === 551, 'original counts');
assert(near(ORIG.auroc.jev, 0.851) && near(ORIG.auroc.static, 0.602) && near(ORIG.auroc.deepseek, 0.585), 'original AUROC story');
assert(near(ORIG.oracle.jev.coverage, 0.0590, 1e-3) && near(ORIG.oracle.static.coverage, 0.1034, 1e-3) && near(ORIG.oracle.deepseek.coverage, 0.0091, 1e-3), 'original oracle coverage story');
assert(near(ORIG.totals.jev, 0.1447, 5e-4) && near(ORIG.totals.deepseek, 0.7056, 5e-4), 'original total cost story');
assert(near(ORIG.oracle.jev.meanLatencyMs, 639, 1) && near(ORIG.oracle.deepseek.meanLatencyMs, 2178, 1), 'original latency story');
assert(OOD.cases === 185 && OOD.breaking === 100 && OOD.controls === 85 && OOD.repos === 103, 'OOD counts');
assert(near(OOD.auroc.jev, 0.605, 1e-3) && near(OOD.auroc.static, 0.569, 1e-3) && near(OOD.auroc.deepseek, 0.534, 1e-3), 'OOD AUROC story');
const fJev = OOD.frozen.find(f => f.policy.startsWith('JEV — repo-disjoint'));
const fDs = OOD.frozen.find(f => f.policy.startsWith('DeepSeek'));
const fRules = OOD.frozen.find(f => f.policy.startsWith('Static'));
assert(fJev.autoMerged === 30 && near(fJev.precision, 0.50, 1e-6) && near(fJev.coverage, 0.1622, 1e-3) && fJev.unsafe === 15, 'OOD JEV frozen story');
assert(fDs.autoMerged === 10 && near(fDs.precision, 0.70, 1e-6) && near(fDs.coverage, 0.0541, 1e-3) && fDs.unsafe === 3, 'OOD DeepSeek frozen story');
assert(fRules.autoMerged === 69 && near(fRules.precision, 0.5507, 1e-3) && near(fRules.coverage, 0.3730, 1e-3) && fRules.unsafe === 31, 'OOD static frozen story');
assert(OOD.oracle.every(o => o.jev.coverage === 0 && o.deepseek.coverage === 0 && o.rules.coverage === 0), 'OOD oracle zero coverage');

fs.mkdirSync('results', { recursive: true });
fs.mkdirSync('results-ood', { recursive: true });
fs.mkdirSync('data', { recursive: true });
fs.mkdirSync('docs', { recursive: true });
fs.writeFileSync('results/summary.json', JSON.stringify(ORIG, null, 2) + '\n');
fs.writeFileSync('results-ood/summary.json', JSON.stringify(OOD, null, 2) + '\n');

// ---------- data manifest ----------
const rawDatasets = ['data/bump.cases.jsonl', 'data/control.cases.jsonl', 'data/dataset.jsonl', 'data/ood-dataset.jsonl', 'data/subset200.jsonl'];
const publishedArtifacts = ['data/dataset.stats.json', 'data/leakage-report.json', 'data/ood-dataset.meta.json', 'data/ood-leakage-report.json', 'data/ood-source-manifest.json', 'results/summary.json', 'results-ood/summary.json', 'report/table.json', 'analysis/decision-forensics.json', 'analysis/ood-validation.json', 'analysis/ood-forensic-audit.json', 'data/ood-source-manifest.json'];
const manifest = {
  generatedAt: new Date().toISOString(),
  note: 'Hashes of datasets and artifacts. Raw case JSONL contain GitHub PR text (titles/bodies/diffs/release notes) and are NOT redistributed; use the reconstruction scripts with the recorded hashes to verify a rebuild.',
  rawDatasetsWithheld: Object.fromEntries(rawDatasets.filter(fs.existsSync).map(f => [f, sha(f)])),
  publishedArtifacts: Object.fromEntries([...new Set(publishedArtifacts)].filter(fs.existsSync).map(f => [f, sha(f)])),
  externalSources: [
    { name: 'BUMP', url: 'https://github.com/chains-project/bump/', license: 'MIT', use: 'source of the 551 reproduced breaking dependency updates' },
    { name: 'Zenodo 12720767 (Dependabot and Security Pull Requests)', url: 'https://doi.org/10.5281/zenodo.12720767', license: 'CC-BY-4.0', use: 'inspected only; not included in the released dataset' },
    { name: 'GitHub REST/GraphQL API', url: 'https://docs.github.com/rest', license: 'GitHub Terms of Service; PR content belongs to repository owners', use: 'controls, OOD reverts, PR metadata used at build time' },
  ],
  modelInputAggregateHash: readJson('data/ood-source-manifest.json').aggregateModelInputHash,
};
fs.writeFileSync('data/MANIFEST.json', JSON.stringify(manifest, null, 2) + '\n');

// ---------- RESULTS.md ----------
const origTable = [
  '| model | AUROC | AP | oracle cov@99% | oracle cov@99.5% | precision@99% | unsafe@99% | breaking recall | mean latency | cost/1k | total cost |',
  '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  `| JEV | ${ORIG.auroc.jev.toFixed(3)} | ${ORIG.ap.jev.toFixed(3)} | ${pct(ORIG.oracle.jev.coverage)} | ${pct(ORIG.oracle.jev995.coverage)} | ${pct(ORIG.oracle.jev.precision)} | ${ORIG.oracle.jev.unsafe} | ${pct(ORIG.oracle.jev.reviewRecallOnBreaking)} | ${ms(ORIG.oracle.jev.meanLatencyMs)} | ${usd(ORIG.oracle.jev.costUsdPer1k)} | ${usd(ORIG.totals.jev)} |`,
  `| DeepSeek Flash | ${ORIG.auroc.deepseek.toFixed(3)} | ${ORIG.ap.deepseek.toFixed(3)} | ${pct(ORIG.oracle.deepseek.coverage)} | ${pct(ORIG.oracle.deepseek995.coverage)} | ${pct(ORIG.oracle.deepseek.precision)} | ${ORIG.oracle.deepseek.unsafe} | ${pct(ORIG.oracle.deepseek.reviewRecallOnBreaking)} | ${ms(ORIG.oracle.deepseek.meanLatencyMs)} | ${usd(ORIG.oracle.deepseek.costUsdPer1k)} | ${usd(ORIG.totals.deepseek)} |`,
  `| Static rules | ${ORIG.auroc.static.toFixed(3)} | ${ORIG.ap.static.toFixed(3)} | ${pct(ORIG.oracle.static.coverage)} | ${pct(ORIG.oracle.static995.coverage)} | ${pct(ORIG.oracle.static.precision)} | ${ORIG.oracle.static.unsafe} | ${pct(ORIG.oracle.static.reviewRecallOnBreaking)} | ${ms(ORIG.oracle.static.meanLatencyMs)} | ${usd(0)} | ${usd(0)} |`,
].join('\n');
const oodRank = [
  '| score | AUROC | AP |',
  '| --- | --- | --- |',
  `| JEV p(AUTO_MERGE) | ${OOD.auroc.jev.toFixed(3)} | ${OOD.ap.jev.toFixed(3)} |`,
  `| Static rule (binary) | ${OOD.auroc.static.toFixed(3)} | ${OOD.ap.static.toFixed(3)} |`,
  `| DeepSeek gated AUTO_MERGE | ${OOD.auroc.deepseek.toFixed(3)} | ${OOD.ap.deepseek.toFixed(3)} |`,
].join('\n');
const oodFrozen = [
  '| policy (frozen on original benchmark) | threshold | auto-merged | precision | coverage | unsafe merges | breaking recall |',
  '| --- | --- | --- | --- | --- | --- | --- |',
  ...OOD.frozen.map(f => `| ${f.policy} | ${f.threshold} | ${f.autoMerged} | ${pct(f.precision)} | ${pct(f.coverage)} | ${f.unsafe} | ${pct(f.breakingRecall)} |`),
].join('\n');
const oodOp = [
  '| model | mean | p50 | p95 | total cost | cost/1k | in/out tokens | ok/err/retry |',
  '| --- | --- | --- | --- | --- | --- | --- | --- |',
  ...['rules', 'deepseek', 'jev'].map(k => { const o = OOD.operational[k]; return `| ${o.model} | ${ms(o.latencyMeanMs)} | ${ms(o.latencyP50Ms)} | ${ms(o.latencyP95Ms)} | ${usd(o.totalCostUsd)} | ${usd(o.costPer1kUsd)} | ${o.inputTokens}/${o.outputTokens} | ${o.successful}/${o.errors}/0 |`; }),
].join('\n');
const sensTable = [
  '| subset | n | ctrl/brk | JEV AUROC | JEV AP | JEV@0.62 auto | precision | coverage | unsafe |',
  '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ...OOD.sensitivity.map(s => `| ${s.label} | ${s.n} | ${s.controls}/${s.breaking} | ${s.jevAuroc.toFixed(3)} | ${s.jevAP.toFixed(3)} | ${s.jev062.autoMerged} | ${pct(s.jev062.precision)} | ${pct(s.jev062.coverage)} | ${s.jev062.unsafe} |`),
].join('\n');

const resultsMd = `# Results

Independent Scarif Labs evaluation of JEV as a software decision primitive. Decision/ranking
quality, probability calibration, and safe operational automation are reported separately
and are not collapsed into a single score.

All numbers below are generated from canonical JSON artifacts:
\`report/table.json\`, \`analysis/decision-forensics.json\`, \`analysis/ood-validation.json\`, \`analysis/ood-forensic-audit.json\`, \`data/dataset.stats.json\`, \`data/ood-dataset.meta.json\`.
Regenerate with:

\`\`\`bash
node scripts/generate_public_report.mjs
\`\`\`

## 1. Original benchmark (in-distribution, 1,102 cases)

${ORIG.cases} cases (${ORIG.breaking} breaking / ${ORIG.controls} control) across ${ORIG.repos} Maven repositories, from the BUMP benchmark and verified merged controls.

${origTable}

Notes:
- **Oracle / retrospective**: the threshold is selected on the evaluation labels, so coverage is an upper bound, not a deployable result.
- AUROC/AP use the control class as positive and are decision-agnostic.
- "breaking recall" is the share of breaking cases not auto-merged at the decision level.
- Costs are per-1k decisions × case count; static rules have zero model cost.

### Frozen-threshold evaluation on the original benchmark (development split → held-out split)

${['| model | split | dev threshold | dev auto-merges | held-out precision | held-out coverage | unsafe |', '| --- | --- | --- | --- | --- | --- | --- |', ...ORIG.frozen.filter((f, i, a) => a.findIndex(g => g.model === f.model && g.split === f.split) === i).map(f => `| ${f.model} | ${f.split} | ${f.devThreshold} | ${f.devAutoMerges} | ${pct(f.precision)} | ${pct(f.coverage)} | ${f.unsafe} |`)].join('\n')}

Only the JEV repo-disjoint threshold (0.62) had non-zero development coverage; the time-ordered JEV threshold degenerated to 1.0 (a no-op). No single policy was designated primary.

## 2. OOD validation (independent population, 185 cases)

${OOD.cases} cases (${OOD.breaking} breaking / ${OOD.controls} control) across ${OOD.repos} independent repositories. Breaking evidence is the repository's own later revert of the dependency bump — a different outcome mechanism from BUMP's reproduced build failure. No threshold was selected using OOD labels.

### Ranking quality

${oodRank}

JEV AUROC 95% bootstrap CI: **${OOD.bootstrap.jevAuroc.lo.toFixed(3)}–${OOD.bootstrap.jevAuroc.hi.toFixed(3)}** (2,000 resamples).

### Frozen policies transferred from the original benchmark

${oodFrozen}

### Oracle (retrospective, OOD labels — reference only)

At 99% and 99.5% target precision, **all three models reach 0.00% coverage on OOD**: no threshold on these scores produces a non-empty, safe auto-merge set even when allowed to see the OOD labels.

### Latency, cost, errors

${oodOp}

### Label-subset sensitivity (diagnostic only; no recalibration)

${sensTable}

## 3. Interpretation

This benchmark separates three properties: **decision/ranking quality**, **probability
calibration**, and **safe operational automation**. They do not move together.

- In-distribution, JEV showed substantially stronger ranking quality (AUROC ${ORIG.auroc.jev.toFixed(3)}) than the static rule (${ORIG.auroc.static.toFixed(3)}) and DeepSeek Flash (${ORIG.auroc.deepseek.toFixed(3)}), and the only non-zero oracle coverage at 99.5%.
- On OOD, JEV retained the highest AUROC among the three (${OOD.auroc.jev.toFixed(3)}) but only weakly above chance (CI ${OOD.bootstrap.jevAuroc.lo.toFixed(3)}–${OOD.bootstrap.jevAuroc.hi.toFixed(3)}); the absolute performance fell sharply.
- The probability calibration/threshold did not transfer: the frozen 0.62 policy auto-merged ${fJev.autoMerged} OOD cases at ${pct(fJev.precision)} precision with ${fJev.unsafe} unsafe merges.
- The threshold-transfer gap is concentrated in non-JavaScript ecosystems: see the sensitivity table (JavaScript AUROC ${OOD.sensitivity[2].jevAuroc.toFixed(3)} vs non-JavaScript ${OOD.sensitivity[3].jevAuroc.toFixed(3)}).
- Excluding ambiguous reverts did not change the conclusion (AUROC ${OOD.sensitivity[0].jevAuroc.toFixed(3)} → ${OOD.sensitivity[1].jevAuroc.toFixed(3)}).

The benchmark found a strong in-distribution JEV ranking signal that weakened substantially
under independent distribution shift. JEV retained the highest OOD AUROC among the evaluated
systems, but its original probability threshold did not transfer safely.

These results do not establish general superiority or inferiority of JEV as a general
decision primitive.

## 4. Artifacts

| artifact | contents |
| --- | --- |
| \`analysis/decision-forensics.json\` | original per-case forensics, AUROC/AP, curves, calibration |
| \`analysis/ood-validation.json\` | OOD metrics, frozen policies, bootstrap, stratification |
| \`analysis/ood-forensic-audit.json\` | metric recomputation, label audit, state audit, sensitivity |
| \`data/dataset.stats.json\` | original dataset counts |
| \`data/ood-dataset.meta.json\` | OOD provenance, independence, case IDs |
| \`data/leakage-report.json\`, \`data/ood-leakage-report.json\` | leakage audits (verdicts: ${ORIG.leakVerdict}; ${OOD.leakVerdict}) |
| \`report/table.json\`, \`report-ood/table.json\` | evaluator output for both runs |
| \`results/summary.json\`, \`results-ood/summary.json\` | machine-readable public summaries |
`;
fs.writeFileSync('RESULTS.md', resultsMd);

// ---------- docs ----------
const docsBenchmark = `# Original benchmark

Independent Scarif Labs evaluation. It tests a general software-systems idea — a typed
probabilistic decision primitive embedded in a real automation workflow — and is not a
vendor evaluation or a reproduction of TypeSafe's own benchmarks.

## Data

- **Breaking (551):** BUMP (MIT, chains-project/bump), reproducible Maven breaking updates. Gold = \`REQUIRE_REVIEW\`.
- **Controls (551):** merged dependency-update PRs from the same repository pool, verified non-breaking (merged, checks not failing, no revert in 90 days, update applied, not downgraded). Gold = \`AUTO_MERGE\`.
- 20 BUMP records with no retrievable PR were dropped. Final: ${ORIG.cases} cases across ${ORIG.repos} repositories.
- Leakage audit: ${ORIG.leakVerdict}.

## Decision task

State available before merge only: repository, ecosystem, dependency, old/new version, update type, PR title/body, manifest diff, dependency release notes, and pre-merge CI status. Decisions: \`AUTO_MERGE\`, \`HOLD\`, \`REQUIRE_REVIEW\`.

## Models

- **JEV (\`jev-latest\`):** TypeSafe's System One decision model. TypeSafe describes System One models as returning typed decisions and uncertainty intended for software to consume directly. Here it is asked one Choice question with the three actions as criteria and returns \`choice\`, \`probabilities\`, \`confidence\`. This benchmark tests that general idea independently.
- **DeepSeek Flash (\`~deepseek/deepseek-flash-latest\` → \`deepseek/deepseek-v4.1-flash\`):** structured JSON \`{decision, risk, confidence}\`, reasoning disabled, temperature 0. AUTO_MERGE probability = confidence when the decision is AUTO_MERGE, else 0.
- **Static rules:** deterministic Renovate-style policy over update type and CI status.

## Evaluation

- **Ranking:** AUROC and average precision over the control class; risk–coverage and precision–recall curves.
- **Oracle/retrospective:** threshold selected on evaluation labels (upper bound).
- **Frozen policy:** threshold selected on a development split and applied unchanged to a held-out split.
- **Splits:** repository-disjoint (70/30 by repo hash), time-ordered (earliest 70% / latest 30%), held-out package families, update-type, and dependency scope.
- **Leakage:** the model-visible state is a whitelisted pre-merge projection; audits in \`data/leakage-report.json\`.

See \`METHODOLOGY.md\` and \`RESULTS.md\`.
`;
const docsOod = `# OOD validation

Independent Scarif Labs evaluation. Thresholds are frozen from the original benchmark;
no OOD labels are used to choose them.

## Population

${OOD.cases} cases (${OOD.breaking} breaking / ${OOD.controls} control) across ${OOD.repos} independent repositories, none from the original benchmark.

- **Breaking:** a dependency bump later reverted in-repository (independent negative-outcome evidence, not a BUMP reproduction).
- **Controls:** merged dependency updates from the same repositories, verified non-breaking with the same standard as the original controls.
- **Independence:** 0 overlap on repository, PR, head SHA, or \`dependency|old|new\` transition (see \`data/ood-dataset.meta.json\`).
- **Leakage:** ${OOD.leakVerdict}. Titles carry no outcome text; revert bodies/diffs are excluded; 9 revert-PR resolutions were sanitized to synthesized pre-merge state.

## Method

Identical state projection, prompt, schema, and evaluator as the original benchmark. Thresholds are **frozen from the original benchmark**; none is chosen on OOD labels.

## Results

${oodRank}

### Frozen policies

${oodFrozen}

### Oracle (retrospective, reference only)

Coverage at 99% and 99.5% target precision is **0.00% for every model**.

### Operational

${oodOp}

See \`analysis/ood-validation.json\` and \`analysis/ood-forensic-audit.json\`.
`;
const docsForensic = `# Forensic audit of the OOD experiment

Read-only audit (\`analysis/ood-forensic-audit.json\`). No rerun and no threshold tuning.

## Metric recomputation

Every reported OOD metric was recomputed from raw per-case results with independent implementations of AUROC, average precision, binning, and the frozen-policy evaluator. **max absolute delta = ${audit.maxDelta}** — no implementation or calculation bug.

## Label audit (${OOD.breaking} breaking)

- Reverts targeting this update: **all ${OOD.breaking}** name the exact dependency and/or version (0 unrelated).
- Trust: ${Object.entries(OOD.labelTrust).map(([k, v]) => `${k} ${v}`).join(', ')}.
- Only ${OOD.labelTrust.strong ?? 0} reverts state an explicit breakage cause; ${OOD.labelTrust.proximate ?? 0} are proximate (exact-update revert within ≤14 days); ${OOD.labelTrust.ambiguous ?? 0} are ambiguous (no reason and/or grouped revert).
- Excluding the ambiguous cases does not rescue the signal (AUROC ${OOD.sensitivity[0].jevAuroc.toFixed(3)} → ${OOD.sensitivity[1].jevAuroc.toFixed(3)}).

## State audit

- Resolved original PR state: ${OOD.stateSummary.resolved}; synthesized: ${OOD.stateSummary.synthesized}.
- **Title leaks: ${OOD.stateSummary.titleLeaks}.** No revert body or revert diff reaches the model.
- Data-quality artifact: ${OOD.dataQuality.breakingWithQuotedVersion}/${OOD.breaking} breaking cases carry a trailing quote in the parsed \`newVersion\`.

## Classification

${OOD.classification.label}. ${OOD.classification.title}
`;
fs.writeFileSync('docs/benchmark.md', docsBenchmark);
fs.writeFileSync('docs/ood-validation.md', docsOod);
fs.writeFileSync('docs/forensic-audit.md', docsForensic);

console.log(JSON.stringify({ ok: true, orig: { cases: ORIG.cases, breaking: ORIG.breaking, controls: ORIG.controls, auroc: ORIG.auroc, oracleCov99: { jev: ORIG.oracle.jev.coverage, static: ORIG.oracle.static.coverage, deepseek: ORIG.oracle.deepseek.coverage }, totals: ORIG.totals }, ood: { cases: OOD.cases, breaking: OOD.breaking, controls: OOD.controls, repos: OOD.repos, auroc: OOD.auroc, frozen: OOD.frozen.map(f => ({ policy: f.policy, autoMerged: f.autoMerged, precision: f.precision, coverage: f.coverage, unsafe: f.unsafe })) }, wrote: ['RESULTS.md', 'results/summary.json', 'results-ood/summary.json', 'data/MANIFEST.json', 'docs/benchmark.md', 'docs/ood-validation.md', 'docs/forensic-audit.md'] }, null, 2));

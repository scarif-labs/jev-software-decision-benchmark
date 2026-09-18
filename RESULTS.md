# Results

Independent Scarif Labs evaluation of JEV as a software decision primitive. Decision/ranking
quality, probability calibration, and safe operational automation are reported separately
and are not collapsed into a single score.

All numbers below are generated from canonical JSON artifacts:
`report/table.json`, `analysis/decision-forensics.json`, `analysis/ood-validation.json`, `analysis/ood-forensic-audit.json`, `data/dataset.stats.json`, `data/ood-dataset.meta.json`.
Regenerate with:

```bash
node scripts/generate_public_report.mjs
```

## 1. Original benchmark (in-distribution, 1,102 cases)

1102 cases (551 breaking / 551 control) across 148 Maven repositories, from the BUMP benchmark and verified merged controls.

| model | AUROC | AP | oracle cov@99% | oracle cov@99.5% | precision@99% | unsafe@99% | breaking recall | mean latency | cost/1k | total cost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| JEV | 0.851 | 0.843 | 5.90% | 5.90% | 100.00% | 0 | 99.09% | 639 ms | $0.1313 | $0.1447 |
| DeepSeek Flash | 0.585 | 0.459 | 0.91% | 0.91% | 100.00% | 0 | 98.55% | 2178 ms | $0.6403 | $0.7056 |
| Static rules | 0.602 | 0.486 | 10.34% | 0.00% | 99.12% | 1 | 99.82% | 0 ms | $0.0000 | $0.0000 |

Notes:
- **Oracle / retrospective**: the threshold is selected on the evaluation labels, so coverage is an upper bound, not a deployable result.
- AUROC/AP use the control class as positive and are decision-agnostic.
- "breaking recall" is the share of breaking cases not auto-merged at the decision level.
- Costs are per-1k decisions × case count; static rules have zero model cost.

### Frozen-threshold evaluation on the original benchmark (development split → held-out split)

| model | split | dev threshold | dev auto-merges | held-out precision | held-out coverage | unsafe |
| --- | --- | --- | --- | --- | --- | --- |
| Static rules | repo-disjoint | 1 | 0 | 100.00% | 19.55% | 0 |
| Static rules | time-ordered | 1 | 0 | 100.00% | 34.14% | 0 |
| ~deepseek/deepseek-flash-latest | repo-disjoint | 0.9 | 5 | 100.00% | 1.40% | 0 |
| ~deepseek/deepseek-flash-latest | time-ordered | 0.9 | 1 | 100.00% | 2.72% | 0 |
| Jev 1.13 | repo-disjoint | 0.62 | 22 | 100.00% | 12.01% | 0 |
| Jev 1.13 | time-ordered | 1 | 0 | 100.00% | 0.00% | 0 |

Only the JEV repo-disjoint threshold (0.62) had non-zero development coverage; the time-ordered JEV threshold degenerated to 1.0 (a no-op). No single policy was designated primary.

## 2. OOD validation (independent population, 185 cases)

185 cases (100 breaking / 85 control) across 103 independent repositories. Breaking evidence is the repository's own later revert of the dependency bump — a different outcome mechanism from BUMP's reproduced build failure. No threshold was selected using OOD labels.

### Ranking quality

| score | AUROC | AP |
| --- | --- | --- |
| JEV p(AUTO_MERGE) | 0.605 | 0.510 |
| Static rule (binary) | 0.569 | 0.368 |
| DeepSeek gated AUTO_MERGE | 0.534 | 0.385 |

JEV AUROC 95% bootstrap CI: **0.525–0.685** (2,000 resamples).

### Frozen policies transferred from the original benchmark

| policy (frozen on original benchmark) | threshold | auto-merged | precision | coverage | unsafe merges | breaking recall |
| --- | --- | --- | --- | --- | --- | --- |
| JEV — repo-disjoint (orig) | 0.62 | 30 | 50.00% | 16.22% | 15 | 85.00% |
| JEV — time-ordered (orig) | 1 | 0 | 100.00% | 0.00% | 0 | 100.00% |
| DeepSeek — repo-disjoint (orig) | 0.9 | 10 | 70.00% | 5.41% | 3 | 97.00% |
| Static rules — repo-disjoint (orig) | 1 | 69 | 55.07% | 37.30% | 31 | 69.00% |

### Oracle (retrospective, OOD labels — reference only)

At 99% and 99.5% target precision, **all three models reach 0.00% coverage on OOD**: no threshold on these scores produces a non-empty, safe auto-merge set even when allowed to see the OOD labels.

### Latency, cost, errors

| model | mean | p50 | p95 | total cost | cost/1k | in/out tokens | ok/err/retry |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Static rules | 0 ms | 0 ms | 0 ms | $0.0000 | $0.0000 | 0/0 | 185/0/0 |
| DeepSeek Flash | 2579 ms | 1914 ms | 6782 ms | $0.1225 | $0.6623 | 473083/5531 | 185/0/0 |
| JEV | 468 ms | 393 ms | 856 ms | $0.0232 | $0.1254 | 552533/9173 | 185/0/0 |

### Label-subset sensitivity (diagnostic only; no recalibration)

| subset | n | ctrl/brk | JEV AUROC | JEV AP | JEV@0.62 auto | precision | coverage | unsafe |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| all (100 breaking / 85 control) | 185 | 85/100 | 0.605 | 0.510 | 30 | 50.00% | 16.22% | 15 |
| excluding ambiguous/unrelated reverts (15 dropped) | 170 | 85/85 | 0.592 | 0.538 | 28 | 53.57% | 16.47% | 13 |
| javascript only | 130 | 62/68 | 0.673 | 0.573 | 23 | 60.87% | 17.69% | 9 |
| non-javascript | 55 | 23/32 | 0.379 | 0.335 | 7 | 14.29% | 12.73% | 6 |

## 3. Interpretation

This benchmark separates three properties: **decision/ranking quality**, **probability
calibration**, and **safe operational automation**. They do not move together.

- In-distribution, JEV showed substantially stronger ranking quality (AUROC 0.851) than the static rule (0.602) and DeepSeek Flash (0.585), and the only non-zero oracle coverage at 99.5%.
- On OOD, JEV retained the highest AUROC among the three (0.605) but only weakly above chance (CI 0.525–0.685); the absolute performance fell sharply.
- The probability calibration/threshold did not transfer: the frozen 0.62 policy auto-merged 30 OOD cases at 50.00% precision with 15 unsafe merges.
- The threshold-transfer gap is concentrated in non-JavaScript ecosystems: see the sensitivity table (JavaScript AUROC 0.673 vs non-JavaScript 0.379).
- Excluding ambiguous reverts did not change the conclusion (AUROC 0.605 → 0.592).

The benchmark found a strong in-distribution JEV ranking signal that weakened substantially
under independent distribution shift. JEV retained the highest OOD AUROC among the evaluated
systems, but its original probability threshold did not transfer safely.

These results do not establish general superiority or inferiority of JEV as a general
decision primitive.

## 4. Artifacts

| artifact | contents |
| --- | --- |
| `analysis/decision-forensics.json` | original per-case forensics, AUROC/AP, curves, calibration |
| `analysis/ood-validation.json` | OOD metrics, frozen policies, bootstrap, stratification |
| `analysis/ood-forensic-audit.json` | metric recomputation, label audit, state audit, sensitivity |
| `data/dataset.stats.json` | original dataset counts |
| `data/ood-dataset.meta.json` | OOD provenance, independence, case IDs |
| `data/leakage-report.json`, `data/ood-leakage-report.json` | leakage audits (verdicts: PASS: no outcome-derived field reaches the model; PASS) |
| `report/table.json`, `report-ood/table.json` | evaluator output for both runs |
| `results/summary.json`, `results-ood/summary.json` | machine-readable public summaries |

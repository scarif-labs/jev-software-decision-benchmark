# OOD validation

Independent Scarif Labs evaluation. Thresholds are frozen from the original benchmark;
no OOD labels are used to choose them.

## Population

185 cases (100 breaking / 85 control) across 103 independent repositories, none from the original benchmark.

- **Breaking:** a dependency bump later reverted in-repository (independent negative-outcome evidence, not a BUMP reproduction).
- **Controls:** merged dependency updates from the same repositories, verified non-breaking with the same standard as the original controls.
- **Independence:** 0 overlap on repository, PR, head SHA, or `dependency|old|new` transition (see `data/ood-dataset.meta.json`).
- **Leakage:** PASS. Titles carry no outcome text; revert bodies/diffs are excluded; 9 revert-PR resolutions were sanitized to synthesized pre-merge state.

## Method

Identical state projection, prompt, schema, and evaluator as the original benchmark. Thresholds are **frozen from the original benchmark**; none is chosen on OOD labels.

## Results

| score | AUROC | AP |
| --- | --- | --- |
| JEV p(AUTO_MERGE) | 0.605 | 0.510 |
| Static rule (binary) | 0.569 | 0.368 |
| DeepSeek gated AUTO_MERGE | 0.534 | 0.385 |

### Frozen policies

| policy (frozen on original benchmark) | threshold | auto-merged | precision | coverage | unsafe merges | breaking recall |
| --- | --- | --- | --- | --- | --- | --- |
| JEV — repo-disjoint (orig) | 0.62 | 30 | 50.00% | 16.22% | 15 | 85.00% |
| JEV — time-ordered (orig) | 1 | 0 | 100.00% | 0.00% | 0 | 100.00% |
| DeepSeek — repo-disjoint (orig) | 0.9 | 10 | 70.00% | 5.41% | 3 | 97.00% |
| Static rules — repo-disjoint (orig) | 1 | 69 | 55.07% | 37.30% | 31 | 69.00% |

### Oracle (retrospective, reference only)

Coverage at 99% and 99.5% target precision is **0.00% for every model**.

### Operational

| model | mean | p50 | p95 | total cost | cost/1k | in/out tokens | ok/err/retry |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Static rules | 0 ms | 0 ms | 0 ms | $0.0000 | $0.0000 | 0/0 | 185/0/0 |
| DeepSeek Flash | 2579 ms | 1914 ms | 6782 ms | $0.1225 | $0.6623 | 473083/5531 | 185/0/0 |
| JEV | 468 ms | 393 ms | 856 ms | $0.0232 | $0.1254 | 552533/9173 | 185/0/0 |

See `analysis/ood-validation.json` and `analysis/ood-forensic-audit.json`.

# OOD Validation — dependency-update decision transfer

Independent population: **185** cases (100 breaking / 85 control), not derived from BUMP. Model returned by OpenRouter: `deepseek/deepseek-v4.1-flash`.
All thresholds below are **frozen from the original 1,102-case benchmark**; none is selected on OOD labels.

## 1–2. Ranking quality (positive class = control / safe-to-auto-merge)

| score | AUROC | Average Precision |
| --- | --- | --- |
| JEV p(AUTO_MERGE) | 0.605 | 0.510 |
| DeepSeek gated AUTO_MERGE score | 0.534 | 0.385 |
| DeepSeek raw confidence | 0.462 | 0.382 |
| Static rule (binary) | 0.569 | 0.368 |

Bootstrap 95% CI for JEV AUROC: **0.525 – 0.685** (n=185).

## 3. Risk–coverage curve (gated benchmark semantics)

| model | candidates | max coverage with precision>=99% | max coverage with precision>=99.5% |
| --- | --- | --- | --- |
| JEV | 0 | 0.00% (prec 100.00%) | 0.00% (prec 100.00%) |
| DeepSeek | 0 | 0.00% (prec 100.00%) | 0.00% (prec 100.00%) |
| Static rules | 0 | 0.00% (prec 100.00%) | 0.00% (prec 100.00%) |

> **Oracle / retrospective** — these select the threshold on the OOD labels themselves and are shown only for reference.

## 4. JEV score-bin calibration

| bin | n | controls | breaking | mean score | control rate |
| --- | --- | --- | --- | --- | --- |
| [0.0, 0.1) | 113 | 46 | 67 | 0.012 | 40.71% |
| [0.1, 0.2) | 11 | 6 | 5 | 0.145 | 54.55% |
| [0.2, 0.3) | 6 | 3 | 3 | 0.258 | 50.00% |
| [0.3, 0.4) | 5 | 4 | 1 | 0.360 | 80.00% |
| [0.4, 0.5) | 10 | 4 | 6 | 0.444 | 40.00% |
| [0.5, 0.6) | 8 | 5 | 3 | 0.531 | 62.50% |
| [0.6, 0.7) | 6 | 4 | 2 | 0.627 | 66.67% |
| [0.7, 0.8) | 6 | 3 | 3 | 0.752 | 50.00% |
| [0.8, 0.9) | 7 | 1 | 6 | 0.846 | 14.29% |
| [0.9, 1.0) | 13 | 9 | 4 | 0.940 | 69.23% |

## 5–9. Frozen-threshold performance (original benchmark → OOD)

| policy (frozen) | threshold | auto-merged | precision | coverage | unsafe merges | breaking recall |
| --- | --- | --- | --- | --- | --- | --- |
| JEV — repo-disjoint (orig) | 0.62 | 30 | 50.00% | 16.22% | 15 | 85.00% |
| JEV — time-ordered (orig) | 1 | 0 | 100.00% | 0.00% | 0 | 100.00% |
| DeepSeek — repo-disjoint (orig) | 0.9 | 10 | 70.00% | 5.41% | 3 | 97.00% |
| Static rules — repo-disjoint (orig) | 1 | 69 | 55.07% | 37.30% | 31 | 69.00% |

Bootstrap 95% CI (JEV repo-disjoint frozen policy): coverage 10.81%–22.16%, precision 32.00%–68.97%.
Bootstrap 95% CI (DeepSeek repo-disjoint frozen policy): coverage 2.16%–8.65%, precision 37.50%–100.00%.

## 10. Model comparison (oracle + frozen)

| model | AUROC | oracle cov@99% | oracle cov@99.5% | frozen auto-merged | frozen precision | frozen coverage | frozen unsafe |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Static rules | 0.569 | 0.00% | 0.00% | 69 | 55.07% | 37.30% | 31 |
| DeepSeek Flash | 0.534 | 0.00% | 0.00% | 10 | 70.00% | 5.41% | 3 |
| JEV | 0.605 | 0.00% | 0.00% | 30 | 50.00% | 16.22% | 15 |

## 11–13. Latency, cost, errors/retries

| model | mean | p50 | p95 | max | total cost | cost/1k | in/out tok | ok/err/retry | evaluable |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Static rules | 0 | 0 | 0 | 0 | $0 | $0 | 0/0 | 185/0/0 | 185 |
| DeepSeek Flash | 2579 | 1914 | 6782 | 17671 | $0.1225 | $0.6623 | 473083/5531 | 185/0/0 | 185 |
| JEV | 468 | 393 | 856 | 2443 | $0.0232 | $0.1254 | 552533/9173 | 185/0/0 | 185 |

Decision distribution: Static rules {"REQUIRE_REVIEW":107,"AUTO_MERGE":69,"HOLD":9}; DeepSeek Flash {"HUMAN_REVIEW":143,"AUTO_MERGE":40,"HOLD":2}; JEV {"REQUIRE_REVIEW":132,"HOLD":12,"AUTO_MERGE":41}.

## 14. Stratified results

### ecosystem

| value | n | controls | breaking | JEV AUROC | JEV oracle cov@99 | unsafe |
| --- | --- | --- | --- | --- | --- | --- |
| javascript | 130 | 62 | 68 | 0.673 | 0.00% | 0 |
| java | 16 | 7 | 9 | 0.373 | 0.00% | 0 |
| rust | 15 | 7 | 8 | 0.509 | 0.00% | 0 |
| go | 11 | 6 | 5 | 0.100 | 0.00% | 0 |
| python | 9 | 1 | 8 | n/a | 0.00% | 0 |
| ruby | 4 | 2 | 2 | n/a | 0.00% | 0 |

### update-type

| value | n | controls | breaking | JEV AUROC | JEV oracle cov@99 | unsafe |
| --- | --- | --- | --- | --- | --- | --- |
| major | 88 | 43 | 45 | 0.758 | 1.14% | 0 |
| minor | 63 | 28 | 35 | 0.609 | 0.00% | 0 |
| patch | 33 | 13 | 20 | 0.708 | 0.00% | 0 |
| other | 1 | 1 | 0 | n/a | 100.00% | 0 |

### package-manager

| value | n | controls | breaking | JEV AUROC | JEV oracle cov@99 | unsafe |
| --- | --- | --- | --- | --- | --- | --- |
| npm | 130 | 62 | 68 | 0.673 | 0.00% | 0 |
| cargo | 15 | 7 | 8 | 0.509 | 0.00% | 0 |
| gradle | 13 | 7 | 6 | 0.345 | 0.00% | 0 |
| go | 11 | 6 | 5 | 0.100 | 0.00% | 0 |
| pip | 9 | 1 | 8 | n/a | 0.00% | 0 |
| bundler | 4 | 2 | 2 | n/a | 0.00% | 0 |
| maven | 3 | 0 | 3 | n/a | 0.00% | 0 |

## Classification

**C. Signal does not replicate (as a transferable decision signal), with a weak stratum-specific ordering exception**

Supporting observations:
- JEV AUROC on OOD = 0.605 (95% CI 0.525-0.685) vs 0.851 on the original benchmark; AP 0.510 vs a 0.459 base rate.
- Calibration does not transfer: the control rate per JEV score bin is non-monotonic and the 0.8-0.9 bin is 14% control (86% breaking).
- The frozen original threshold 0.62 auto-merges 30 OOD cases at 0.500 precision with 15 unsafe merges; the frozen time-ordered threshold 1.0 auto-merges nothing.
- The retrospective OOD oracle reaches 0% coverage at 99% precision for every model, so no threshold on these scores supports safe automation.
- The weak ordering that exists is concentrated in JavaScript (AUROC 0.673) and major updates (0.758); other strata are near or below chance (Go 0.100, Java 0.373), with small n.

Caveat: The OOD label channel (in-repo revert) and population (mostly npm) differ from BUMP, and some reverts may not reflect a genuine breaking regression. That label noise would attenuate a real signal, so the failure to replicate the decision signal is firm, while the ordering signal is not proven absent.


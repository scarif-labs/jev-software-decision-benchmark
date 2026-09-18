# Decision Forensics — JEV vs DeepSeek vs Static Rules

Read-only analysis of `results/JEV.jsonl`, `results/OPENROUTER.jsonl`, `results/RULES.jsonl`, `data/dataset.jsonl`.
Cases: **1102** (551 breaking / 551 control). No benchmark configuration was changed and no deployed threshold is proposed.

## 1. Every breaking case where JEV decided AUTO_MERGE

| case | JEV decision | JEV p(AUTO_MERGE) | JEV probs (AM/HOLD/RR) | DeepSeek decision | DeepSeek conf | DeepSeek risk | static rule |
| --- | --- | --- | --- | --- | --- | --- | --- |
| bump-3e2f981f08e7 | AUTO_MERGE | 0.600 | 0.600/0.390/0.010 | HUMAN_REVIEW | 0.600 | MEDIUM | HOLD |
| bump-a61b52b3627b | AUTO_MERGE | 0.540 | 0.540/0.420/0.040 | AUTO_MERGE | 0.850 | LOW | HOLD |
| bump-d8031ba94b60 | AUTO_MERGE | 0.490 | 0.490/0.440/0.070 | HUMAN_REVIEW | 0.600 | MEDIUM | HOLD |
| bump-a047d2d3f938 | AUTO_MERGE | 0.410 | 0.410/0.250/0.340 | HUMAN_REVIEW | 0.700 | MEDIUM | HOLD |
| bump-c90c8fd408f5 | AUTO_MERGE | 0.360 | 0.360/0.360/0.280 | HUMAN_REVIEW | 0.600 | MEDIUM | HOLD |

## 2. Top 25 JEV AUTO_MERGE scores — breaking cases

| rank | case | JEV score | JEV decision | DeepSeek decision | DS conf | static rule |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | bump-3e2f981f08e7 | 0.600 | AUTO_MERGE | HUMAN_REVIEW | 0.600 | HOLD |
| 2 | bump-a61b52b3627b | 0.540 | AUTO_MERGE | AUTO_MERGE | 0.850 | HOLD |
| 3 | bump-d8031ba94b60 | 0.490 | AUTO_MERGE | HUMAN_REVIEW | 0.600 | HOLD |
| 4 | bump-8f91818349e8 | 0.470 | HOLD | AUTO_MERGE | 0.850 | HOLD |
| 5 | bump-8b1bc48bc378 | 0.450 | HOLD | HUMAN_REVIEW | 0.600 | HOLD |
| 6 | bump-e259f250790e | 0.430 | HOLD | AUTO_MERGE | 0.850 | HOLD |
| 7 | bump-919c808279d2 | 0.420 | HOLD | HUMAN_REVIEW | 0.600 | HOLD |
| 8 | bump-a047d2d3f938 | 0.410 | AUTO_MERGE | HUMAN_REVIEW | 0.700 | HOLD |
| 9 | bump-52c069901110 | 0.380 | HOLD | AUTO_MERGE | 0.800 | HOLD |
| 10 | bump-923528a3dd1b | 0.380 | HOLD | AUTO_MERGE | 0.850 | HOLD |
| 11 | bump-d6eda931038e | 0.380 | HOLD | HUMAN_REVIEW | 0.600 | HOLD |
| 12 | bump-c90c8fd408f5 | 0.360 | AUTO_MERGE | HUMAN_REVIEW | 0.600 | HOLD |
| 13 | bump-7e8c62e2bb21 | 0.340 | HOLD | HUMAN_REVIEW | 0.600 | HOLD |
| 14 | bump-8c4d6c00ba37 | 0.340 | HOLD | AUTO_MERGE | 0.800 | HOLD |
| 15 | bump-9564cba457bb | 0.340 | HOLD | HUMAN_REVIEW | 0.600 | HOLD |
| 16 | bump-d9d866185ffa | 0.340 | HOLD | HUMAN_REVIEW | 0.600 | HOLD |
| 17 | bump-14270a2ff9e0 | 0.330 | HOLD | HUMAN_REVIEW | 0.600 | HOLD |
| 18 | bump-27ea953051c0 | 0.330 | HOLD | HUMAN_REVIEW | 0.600 | HOLD |
| 19 | bump-6c9a2ecf3bac | 0.330 | REQUIRE_REVIEW | HUMAN_REVIEW | 0.700 | HOLD |
| 20 | bump-abfb7dd92cff | 0.330 | HOLD | AUTO_MERGE | 0.720 | HOLD |
| 21 | bump-4ea77102208e | 0.320 | HOLD | HUMAN_REVIEW | 0.600 | HOLD |
| 22 | bump-feffea0a79cb | 0.300 | HOLD | HUMAN_REVIEW | 0.600 | HOLD |
| 23 | bump-bfe01b1632ae | 0.290 | REQUIRE_REVIEW | HUMAN_REVIEW | 0.700 | HOLD |
| 24 | bump-50be65a0234e | 0.290 | HOLD | HUMAN_REVIEW | 0.700 | HOLD |
| 25 | bump-ef830a40b026 | 0.290 | REQUIRE_REVIEW | HUMAN_REVIEW | 0.700 | HOLD |

## 3. Top 25 JEV AUTO_MERGE scores — controls

| rank | case | JEV score | JEV decision | DeepSeek decision | DS conf | static rule |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | ctrl-feedzai_pdb-494 | 0.970 | AUTO_MERGE | AUTO_MERGE | 0.900 | AUTO_MERGE |
| 2 | ctrl-alphagov_pay-adminusers-3346 | 0.960 | AUTO_MERGE | AUTO_MERGE | 0.900 | AUTO_MERGE |
| 3 | ctrl-Wmaarts_pitest-mutation-testing-elements-plugin-380 | 0.950 | AUTO_MERGE | AUTO_MERGE | 0.850 | AUTO_MERGE |
| 4 | ctrl-alphagov_pay-cardid-1494 | 0.930 | AUTO_MERGE | AUTO_MERGE | 0.850 | AUTO_MERGE |
| 5 | ctrl-alphagov_pay-cardid-1489 | 0.900 | AUTO_MERGE | AUTO_MERGE | 0.850 | AUTO_MERGE |
| 6 | ctrl-dadoonet_fscrawler-2499 | 0.900 | AUTO_MERGE | AUTO_MERGE | 0.850 | AUTO_MERGE |
| 7 | ctrl-alphagov_pay-cardid-1497 | 0.890 | AUTO_MERGE | AUTO_MERGE | 0.850 | AUTO_MERGE |
| 8 | ctrl-alphagov_pay-adminusers-3337 | 0.880 | AUTO_MERGE | AUTO_MERGE | 0.850 | AUTO_MERGE |
| 9 | ctrl-alphagov_pay-cardid-1492 | 0.880 | AUTO_MERGE | AUTO_MERGE | 0.850 | AUTO_MERGE |
| 10 | ctrl-alphagov_pay-cardid-1495 | 0.880 | AUTO_MERGE | AUTO_MERGE | 0.780 | AUTO_MERGE |
| 11 | ctrl-alphagov_pay-cardid-1488 | 0.860 | AUTO_MERGE | AUTO_MERGE | 0.850 | AUTO_MERGE |
| 12 | ctrl-dadoonet_fscrawler-2493 | 0.860 | AUTO_MERGE | AUTO_MERGE | 0.900 | AUTO_MERGE |
| 13 | ctrl-jenkinsci_file-operations-plugin-187 | 0.860 | AUTO_MERGE | HUMAN_REVIEW | 0.700 | AUTO_MERGE |
| 14 | ctrl-Wmaarts_pitest-mutation-testing-elements-plugin-385 | 0.860 | AUTO_MERGE | AUTO_MERGE | 0.850 | AUTO_MERGE |
| 15 | ctrl-Wmaarts_pitest-mutation-testing-elements-plugin-383 | 0.830 | AUTO_MERGE | AUTO_MERGE | 0.900 | AUTO_MERGE |
| 16 | ctrl-dadoonet_fscrawler-2501 | 0.830 | AUTO_MERGE | AUTO_MERGE | 0.850 | AUTO_MERGE |
| 17 | ctrl-alphagov_pay-adminusers-3334 | 0.820 | AUTO_MERGE | AUTO_MERGE | 0.900 | AUTO_MERGE |
| 18 | ctrl-alphagov_pay-cardid-1496 | 0.820 | AUTO_MERGE | AUTO_MERGE | 0.930 | AUTO_MERGE |
| 19 | ctrl-alphagov_pay-adminusers-3339 | 0.818 | AUTO_MERGE | HUMAN_REVIEW | 0.600 | AUTO_MERGE |
| 20 | ctrl-scoverage_scoverage-maven-plugin-180 | 0.810 | AUTO_MERGE | AUTO_MERGE | 0.750 | AUTO_MERGE |
| 21 | ctrl-googleapis_gax-java-1504 | 0.810 | AUTO_MERGE | AUTO_MERGE | 0.850 | AUTO_MERGE |
| 22 | ctrl-alphagov_pay-adminusers-3336 | 0.808 | AUTO_MERGE | AUTO_MERGE | 0.850 | AUTO_MERGE |
| 23 | ctrl-Samsung_LPVS-889 | 0.790 | AUTO_MERGE | HUMAN_REVIEW | 0.720 | AUTO_MERGE |
| 24 | ctrl-googleapis_gax-java-1492 | 0.790 | AUTO_MERGE | AUTO_MERGE | 0.850 | AUTO_MERGE |
| 25 | ctrl-alphagov_pay-adminusers-3341 | 0.790 | AUTO_MERGE | AUTO_MERGE | 0.800 | AUTO_MERGE |

## 4. JEV calibration (fixed bins)

| bin | n | controls | breaking | mean JEV score | control rate |
| --- | --- | --- | --- | --- | --- |
| [0.0, 0.1) | 530 | 128 | 402 | 0.022 | 24.15% |
| [0.1, 0.2) | 164 | 92 | 72 | 0.143 | 56.10% |
| [0.2, 0.3) | 164 | 109 | 55 | 0.246 | 66.46% |
| [0.3, 0.4) | 92 | 78 | 14 | 0.343 | 84.78% |
| [0.4, 0.5) | 58 | 52 | 6 | 0.444 | 89.66% |
| [0.5, 0.6) | 27 | 26 | 1 | 0.539 | 96.30% |
| [0.6, 0.7) | 21 | 20 | 1 | 0.642 | 95.24% |
| [0.7, 0.8) | 24 | 24 | 0 | 0.744 | 100.00% |
| [0.8, 0.9) | 16 | 16 | 0 | 0.845 | 100.00% |
| [0.9, 1.0) | 6 | 6 | 0 | 0.935 | 100.00% |

### Ranking quality (positive class = control / safe-to-auto-merge)

| score | AUROC | average precision |
| --- | --- | --- |
| JEV p(AUTO_MERGE) | 0.851 | 0.843 |
| DeepSeek raw confidence | 0.280 | 0.343 |
| DeepSeek gated AUTO_MERGE score | 0.585 | 0.459 |
| static rule (binary) | 0.602 | 0.486 |

> Note: raw DeepSeek confidence is confidence in its *chosen* label, not p(AUTO_MERGE); for review decisions a high confidence is anti-correlated with auto-merge safety. The gated score sets non-AUTO_MERGE decisions to 0.

### Risk–coverage (gated benchmark semantics: decision==AUTO_MERGE and score>=t)

| model | coverage@99% | precision@99% | unsafe@99% | coverage@99.5% | precision@99.5% | unsafe@99.5% |
| --- | --- | --- | --- | --- | --- | --- |
| JEV | 5.90% | 100.00% | 0 | 5.90% | 100.00% | 0 |
| DeepSeek | 0.91% | 100.00% | 0 | 0.91% | 100.00% | 0 |
| static rules | 10.34% | 99.12% | 1 | 0.00% | 100.00% | 0 |

## 5. Score / coverage by stratification (JEV gated coverage @99%)

| dimension | value | n | controls | breaking | JEV AUROC | DS conf AUROC | DS gated AUROC | rules AUROC | JEV cov@99 | JEV prec@99 | JEV unsafe@99 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| update-type | major | 305 | 92 | 213 | 0.943 | 0.044 | 0.516 | 0.500 | 0.33% | 100.00% | 0 |
| update-type | minor | 406 | 256 | 150 | 0.786 | 0.439 | 0.529 | 0.598 | 10.84% | 100.00% | 0 |
| update-type | patch | 230 | 203 | 27 | 0.617 | 0.567 | 0.572 | 0.650 | 20.43% | 100.00% | 0 |
| update-type | other | 161 | 0 | 161 | n/a | n/a | n/a | n/a | 0.00% | 100.00% | 0 |
| repo-disjoint | train | 744 | 355 | 389 | 0.824 | 0.296 | 0.572 | 0.559 | 2.96% | 100.00% | 0 |
| repo-disjoint | test | 358 | 196 | 162 | 0.902 | 0.238 | 0.608 | 0.679 | 17.04% | 100.00% | 0 |
| time-ordered | train | 771 | 232 | 539 | 0.812 | 0.241 | 0.535 | 0.499 | 0.00% | 100.00% | 0 |
| time-ordered | holdout | 331 | 319 | 12 | 0.794 | 0.432 | 0.584 | 0.677 | 22.05% | 100.00% | 0 |
| package-family | rest | 910 | 421 | 489 | 0.840 | 0.278 | 0.579 | 0.592 | 5.16% | 100.00% | 0 |
| package-family | stress | 192 | 130 | 62 | 0.908 | 0.287 | 0.608 | 0.635 | 16.67% | 100.00% | 0 |
| dependency-scope | direct | 406 | 0 | 406 | n/a | n/a | n/a | n/a | 0.00% | 100.00% | 0 |
| dependency-scope | transitive | 145 | 0 | 145 | n/a | n/a | n/a | n/a | 0.00% | 100.00% | 0 |

## 6. Why the time-ordered development split produced no deployable JEV threshold

- Time-ordered **dev** (train): n=771, 539 breaking / 232 control. JEV made **17** AUTO_MERGE decisions, of which **3 on breaking** cases and 14 on controls.
- Highest JEV score among dev breaking cases: **0.600**; highest among dev controls: **0.550**.
- Dev thresholds meeting >=99% precision with nonzero coverage: **0**.
- Time-ordered **holdout** (oracle, retrospective): coverage@99% = 22.05%, precision = 100.00%, unsafe = 0, with 2 breaking AUTO_MERGE decisions out of 106.

Interpretation: the dev split contains a small number of JEV AUTO_MERGE decisions, and at least one breaking case carries a score at/above the control scores. Because precision@99% needs roughly 100 confident auto-merges to absorb a single error (1/0.01), a handful of dev auto-merges cannot satisfy the target at any threshold, so the frozen policy falls back to "do nothing". The retrospective holdout number is computed by re-selecting the threshold on the holdout labels themselves; it can find a higher cut that happens to exclude that split's risky case, which is not a deployable rule. This is a small-sample calibration problem, not evidence that JEV's signal is absent: JEV still ranks controls above breaking overall (AUROC 0.851).

## 7. Ranking comparison

- JEV p(AUTO_MERGE): AUROC **0.851**, AP **0.843**.
- DeepSeek gated AUTO_MERGE score: AUROC **0.585**, AP **0.459**.
- DeepSeek raw confidence: AUROC **0.280**, AP **0.343**.
- Static rule (binary): AUROC **0.602**, AP **0.486**.

## 8. Disagreements (mapped to AUTO_MERGE / HOLD / REVIEW)

- JEV vs DeepSeek: **330**
- JEV vs static rules: **435**
- DeepSeek vs static rules: **710**
- All three disagree: **35**

### All-three-disagree cases (top 25 by JEV score)

| case | gold | update type | JEV | JEV score | DeepSeek | DS conf | rules |
| --- | --- | --- | --- | --- | --- | --- | --- |
| bump-3e2f981f08e7 | REQUIRE_REVIEW | other | AUTO_MERGE | 0.600 | HUMAN_REVIEW | 0.600 | HOLD |
| ctrl-premium-minds_wicket-crudifier-166 | AUTO_MERGE | patch | AUTO_MERGE | 0.580 | HUMAN_REVIEW | 0.600 | HOLD |
| ctrl-jadler-mocking_jadler-232 | AUTO_MERGE | patch | AUTO_MERGE | 0.550 | HUMAN_REVIEW | 0.600 | HOLD |
| ctrl-internetofwater_nldi-services-301 | AUTO_MERGE | minor | AUTO_MERGE | 0.530 | HUMAN_REVIEW | 0.600 | HOLD |
| ctrl-Refactoring-Bot_Refactoring-Bot-62 | AUTO_MERGE | patch | AUTO_MERGE | 0.520 | HUMAN_REVIEW | 0.700 | HOLD |
| ctrl-Refactoring-Bot_Refactoring-Bot-65 | AUTO_MERGE | patch | AUTO_MERGE | 0.520 | HUMAN_REVIEW | 0.600 | HOLD |
| ctrl-jadler-mocking_jadler-231 | AUTO_MERGE | patch | AUTO_MERGE | 0.520 | HUMAN_REVIEW | 0.600 | HOLD |
| ctrl-jenkinsci_config-file-provider-plugin-339 | AUTO_MERGE | minor | AUTO_MERGE | 0.510 | HUMAN_REVIEW | 0.600 | HOLD |
| ctrl-sabomichal_jooq-meta-postgres-flyway-190 | AUTO_MERGE | minor | AUTO_MERGE | 0.490 | HUMAN_REVIEW | 0.700 | HOLD |
| bump-d8031ba94b60 | REQUIRE_REVIEW | patch | AUTO_MERGE | 0.490 | HUMAN_REVIEW | 0.600 | HOLD |
| ctrl-jenkinsci_config-file-provider-plugin-302 | AUTO_MERGE | minor | AUTO_MERGE | 0.490 | HUMAN_REVIEW | 0.600 | HOLD |
| ctrl-googleapis_java-bigquery-571 | AUTO_MERGE | patch | AUTO_MERGE | 0.490 | HUMAN_REVIEW | 0.750 | HOLD |
| ctrl-internetofwater_nldi-services-279 | AUTO_MERGE | minor | AUTO_MERGE | 0.480 | HUMAN_REVIEW | 0.600 | HOLD |
| ctrl-jenkinsci_github-oauth-plugin-282 | AUTO_MERGE | minor | AUTO_MERGE | 0.480 | HUMAN_REVIEW | 0.600 | HOLD |
| ctrl-pholser_junit-quickcheck-549 | AUTO_MERGE | minor | AUTO_MERGE | 0.470 | HUMAN_REVIEW | 0.700 | HOLD |
| ctrl-jenkinsci_code-coverage-api-plugin-738 | AUTO_MERGE | minor | AUTO_MERGE | 0.470 | HUMAN_REVIEW | 0.600 | HOLD |
| ctrl-jadler-mocking_jadler-238 | AUTO_MERGE | minor | AUTO_MERGE | 0.470 | HUMAN_REVIEW | 0.600 | HOLD |
| ctrl-1and1_snmpman-60 | AUTO_MERGE | patch | AUTO_MERGE | 0.470 | HUMAN_REVIEW | 0.700 | HOLD |
| ctrl-1and1_snmpman-51 | AUTO_MERGE | minor | AUTO_MERGE | 0.440 | HUMAN_REVIEW | 0.700 | HOLD |
| ctrl-pmckeown_dependency-track-maven-plugin-168 | AUTO_MERGE | minor | AUTO_MERGE | 0.430 | HUMAN_REVIEW | 0.600 | HOLD |
| bump-a047d2d3f938 | REQUIRE_REVIEW | minor | AUTO_MERGE | 0.410 | HUMAN_REVIEW | 0.700 | HOLD |
| ctrl-googleapis_java-storage-nio-538 | AUTO_MERGE | patch | AUTO_MERGE | 0.380 | HUMAN_REVIEW | 0.600 | HOLD |
| ctrl-jenkinsci_config-file-provider-plugin-307 | AUTO_MERGE | minor | AUTO_MERGE | 0.380 | HUMAN_REVIEW | 0.600 | HOLD |
| ctrl-jenkinsci_github-oauth-plugin-286 | AUTO_MERGE | minor | AUTO_MERGE | 0.380 | HUMAN_REVIEW | 0.700 | HOLD |
| ctrl-1and1_snmpman-59 | AUTO_MERGE | minor | AUTO_MERGE | 0.380 | HUMAN_REVIEW | 0.700 | HOLD |

### JEV vs DeepSeek disagreements (top 25 by JEV score)

| case | gold | JEV | JEV score | DeepSeek | DS conf | rules |
| --- | --- | --- | --- | --- | --- | --- |
| ctrl-jenkinsci_file-operations-plugin-187 | AUTO_MERGE | AUTO_MERGE | 0.860 | HUMAN_REVIEW | 0.700 | AUTO_MERGE |
| ctrl-alphagov_pay-adminusers-3339 | AUTO_MERGE | AUTO_MERGE | 0.818 | HUMAN_REVIEW | 0.600 | AUTO_MERGE |
| ctrl-Samsung_LPVS-889 | AUTO_MERGE | AUTO_MERGE | 0.790 | HUMAN_REVIEW | 0.720 | AUTO_MERGE |
| ctrl-feedzai_pdb-501 | AUTO_MERGE | AUTO_MERGE | 0.780 | HUMAN_REVIEW | 0.700 | AUTO_MERGE |
| ctrl-jenkinsci_postbuildscript-plugin-187 | AUTO_MERGE | AUTO_MERGE | 0.770 | HUMAN_REVIEW | 0.700 | AUTO_MERGE |
| ctrl-scoverage_scoverage-maven-plugin-196 | AUTO_MERGE | AUTO_MERGE | 0.760 | HUMAN_REVIEW | 0.600 | AUTO_MERGE |
| ctrl-google_guice-897 | AUTO_MERGE | AUTO_MERGE | 0.740 | HUMAN_REVIEW | 0.700 | AUTO_MERGE |
| ctrl-feedzai_pdb-497 | AUTO_MERGE | AUTO_MERGE | 0.740 | HUMAN_REVIEW | 0.700 | AUTO_MERGE |
| ctrl-alphagov_pay-adminusers-3332 | AUTO_MERGE | AUTO_MERGE | 0.720 | HUMAN_REVIEW | 0.600 | AUTO_MERGE |
| ctrl-googleapis_java-storage-3353 | AUTO_MERGE | AUTO_MERGE | 0.720 | HUMAN_REVIEW | 0.600 | AUTO_MERGE |
| ctrl-allure-framework_allure-maven-309 | AUTO_MERGE | AUTO_MERGE | 0.720 | HUMAN_REVIEW | 0.600 | AUTO_MERGE |
| ctrl-jenkinsci_file-operations-plugin-196 | AUTO_MERGE | AUTO_MERGE | 0.720 | HUMAN_REVIEW | 0.600 | AUTO_MERGE |
| ctrl-dadoonet_fscrawler-2500 | AUTO_MERGE | AUTO_MERGE | 0.710 | HUMAN_REVIEW | 0.600 | AUTO_MERGE |
| ctrl-camunda-community-hub_camunda-platform-7-mockito-544 | AUTO_MERGE | AUTO_MERGE | 0.690 | HUMAN_REVIEW | 0.600 | AUTO_MERGE |
| ctrl-Samsung_LPVS-897 | AUTO_MERGE | AUTO_MERGE | 0.680 | HUMAN_REVIEW | 0.600 | AUTO_MERGE |
| ctrl-googleapis_java-storage-3341 | AUTO_MERGE | AUTO_MERGE | 0.670 | HUMAN_REVIEW | 0.600 | AUTO_MERGE |
| ctrl-googleapis_gax-java-1501 | AUTO_MERGE | AUTO_MERGE | 0.660 | HUMAN_REVIEW | 0.600 | AUTO_MERGE |
| ctrl-jenkinsci_postbuildscript-plugin-196 | AUTO_MERGE | AUTO_MERGE | 0.650 | HUMAN_REVIEW | 0.600 | AUTO_MERGE |
| ctrl-feedzai_pdb-499 | AUTO_MERGE | AUTO_MERGE | 0.640 | HUMAN_REVIEW | 0.600 | AUTO_MERGE |
| ctrl-googleapis_java-storage-3332 | AUTO_MERGE | AUTO_MERGE | 0.630 | HUMAN_REVIEW | 0.600 | AUTO_MERGE |
| ctrl-internetofwater_nldi-services-305 | AUTO_MERGE | AUTO_MERGE | 0.630 | HUMAN_REVIEW | 0.600 | AUTO_MERGE |
| ctrl-dadoonet_fscrawler-2486 | AUTO_MERGE | AUTO_MERGE | 0.620 | HUMAN_REVIEW | 0.600 | AUTO_MERGE |
| bump-3e2f981f08e7 | REQUIRE_REVIEW | AUTO_MERGE | 0.600 | HUMAN_REVIEW | 0.600 | HOLD |
| ctrl-ASSERT-KTH_sorald-1194 | AUTO_MERGE | AUTO_MERGE | 0.590 | HUMAN_REVIEW | 0.600 | AUTO_MERGE |
| ctrl-premium-minds_wicket-crudifier-166 | AUTO_MERGE | AUTO_MERGE | 0.580 | HUMAN_REVIEW | 0.600 | HOLD |

### JEV vs static-rule disagreements (top 25 by JEV score)

| case | gold | JEV | JEV score | rules | DeepSeek | DS conf |
| --- | --- | --- | --- | --- | --- | --- |
| ctrl-pholser_junit-quickcheck-535 | AUTO_MERGE | AUTO_MERGE | 0.630 | HOLD | AUTO_MERGE | 0.750 |
| ctrl-camunda-community-hub_camunda-platform-7-mockito-541 | AUTO_MERGE | AUTO_MERGE | 0.620 | REQUIRE_REVIEW | AUTO_MERGE | 0.850 |
| bump-3e2f981f08e7 | REQUIRE_REVIEW | AUTO_MERGE | 0.600 | HOLD | HUMAN_REVIEW | 0.600 |
| ctrl-quarkiverse_quarkus-micrometer-registry-400 | AUTO_MERGE | AUTO_MERGE | 0.590 | HOLD | AUTO_MERGE | 0.850 |
| ctrl-premium-minds_wicket-crudifier-166 | AUTO_MERGE | AUTO_MERGE | 0.580 | HOLD | HUMAN_REVIEW | 0.600 |
| ctrl-pholser_junit-quickcheck-547 | AUTO_MERGE | AUTO_MERGE | 0.570 | HOLD | AUTO_MERGE | 0.850 |
| ctrl-jadler-mocking_jadler-232 | AUTO_MERGE | AUTO_MERGE | 0.550 | HOLD | HUMAN_REVIEW | 0.600 |
| ctrl-googleapis_java-bigquery-570 | AUTO_MERGE | AUTO_MERGE | 0.550 | HOLD | AUTO_MERGE | 0.850 |
| bump-a61b52b3627b | REQUIRE_REVIEW | AUTO_MERGE | 0.540 | HOLD | AUTO_MERGE | 0.850 |
| ctrl-International-Data-Spaces-Association_IDS-Messaging-Services-397 | AUTO_MERGE | AUTO_MERGE | 0.540 | HOLD | AUTO_MERGE | 0.850 |
| ctrl-camunda-community-hub_camunda-platform-7-camel-105 | AUTO_MERGE | AUTO_MERGE | 0.530 | HOLD | AUTO_MERGE | 0.850 |
| ctrl-1and1_snmpman-56 | AUTO_MERGE | AUTO_MERGE | 0.530 | HOLD | AUTO_MERGE | 0.850 |
| ctrl-internetofwater_nldi-services-301 | AUTO_MERGE | AUTO_MERGE | 0.530 | HOLD | HUMAN_REVIEW | 0.600 |
| ctrl-Refactoring-Bot_Refactoring-Bot-62 | AUTO_MERGE | AUTO_MERGE | 0.520 | HOLD | HUMAN_REVIEW | 0.700 |
| ctrl-Refactoring-Bot_Refactoring-Bot-65 | AUTO_MERGE | AUTO_MERGE | 0.520 | HOLD | HUMAN_REVIEW | 0.600 |
| ctrl-jadler-mocking_jadler-231 | AUTO_MERGE | AUTO_MERGE | 0.520 | HOLD | HUMAN_REVIEW | 0.600 |
| ctrl-sabomichal_jooq-meta-postgres-flyway-201 | AUTO_MERGE | AUTO_MERGE | 0.510 | HOLD | AUTO_MERGE | 0.750 |
| ctrl-jenkinsci_config-file-provider-plugin-339 | AUTO_MERGE | AUTO_MERGE | 0.510 | HOLD | HUMAN_REVIEW | 0.600 |
| ctrl-wesleyosantos91_poc-multi-module-arch-hexagonal-springboot-113 | AUTO_MERGE | AUTO_MERGE | 0.500 | HOLD | AUTO_MERGE | 0.850 |
| ctrl-sabomichal_jooq-meta-postgres-flyway-190 | AUTO_MERGE | AUTO_MERGE | 0.490 | HOLD | HUMAN_REVIEW | 0.700 |
| bump-d8031ba94b60 | REQUIRE_REVIEW | AUTO_MERGE | 0.490 | HOLD | HUMAN_REVIEW | 0.600 |
| ctrl-jenkinsci_config-file-provider-plugin-302 | AUTO_MERGE | AUTO_MERGE | 0.490 | HOLD | HUMAN_REVIEW | 0.600 |
| ctrl-googleapis_java-bigquery-571 | AUTO_MERGE | AUTO_MERGE | 0.490 | HOLD | HUMAN_REVIEW | 0.750 |
| ctrl-internetofwater_nldi-services-279 | AUTO_MERGE | AUTO_MERGE | 0.480 | HOLD | HUMAN_REVIEW | 0.600 |
| ctrl-jenkinsci_github-oauth-plugin-282 | AUTO_MERGE | AUTO_MERGE | 0.480 | HOLD | HUMAN_REVIEW | 0.600 |

## Conclusion

JEV's p(AUTO_MERGE) carries a genuine, transferable ordering signal (AUROC 0.851), stronger than DeepSeek's gated score (0.585) and the static binary rule (0.602). Its weakness is the *magnitude* of high-confidence mass: few cases reach the probability level required to sustain 99% precision under a frozen threshold, so deployable coverage is small and temporally fragile. DeepSeek is conservative (most cases go to HUMAN_REVIEW) and its raw confidence is not an auto-merge probability; gated, it ranks worse than JEV. The static rule gets high held-out coverage only because its binary score and the fallback threshold collapse the gate to "merge everything it flags", and it is the only model that produced an unsafe auto-merge in the oracle policy.


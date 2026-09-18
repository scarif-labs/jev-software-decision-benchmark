# OOD Forensic Audit

Read-only audit of the OOD experiment. 100 breaking / 85 control. No rerun, no threshold tuning, no writes to src/ or results.

## 1. Independent recomputation of reported metrics

| metric | reported | recomputed | match |
| --- | --- | --- | --- |
| jevAuroc | 0.605235 | 0.605235 | exact |
| jevAP | 0.509618 | 0.509618 | exact |
| dsGatedAuroc | 0.534176 | 0.534176 | exact |
| rulesAuroc | 0.568529 | 0.568529 | exact |
| jev062precision | 0.500000 | 0.500000 | exact |
| jev062auto | 30.000000 | 30.000000 | exact |

Max absolute delta across recomputed/reported: **0**. No implementation or calculation bug detected.

### Score bins (recomputed)

| bin | n | controls | breaking | control rate |
| --- | --- | --- | --- | --- |
| [0.0, 0.1) | 113 | 46 | 67 | 40.71% |
| [0.1, 0.2) | 11 | 6 | 5 | 54.55% |
| [0.2, 0.3) | 6 | 3 | 3 | 50.00% |
| [0.3, 0.4) | 5 | 4 | 1 | 80.00% |
| [0.4, 0.5) | 10 | 4 | 6 | 40.00% |
| [0.5, 0.6) | 8 | 5 | 3 | 62.50% |
| [0.6, 0.7) | 6 | 4 | 2 | 66.67% |
| [0.7, 0.8) | 6 | 3 | 3 | 50.00% |
| [0.8, 0.9) | 7 | 1 | 6 | 14.29% |
| [0.9, 1.0) | 13 | 9 | 4 | 69.23% |

### Frozen-threshold counts (recomputed)

| policy | threshold | auto-merged | precision | coverage | unsafe | breaking recall |
| --- | --- | --- | --- | --- | --- | --- |
| jev062 | 0.62 | 30 | 50.00% | 16.22% | 15 | 85.00% |
| jev100 | 1 | 0 | 100.00% | 0.00% | 0 | 100.00% |
| ds090 | 0.9 | 10 | 70.00% | 5.41% | 3 | 97.00% |
| rules100 | 1 | 69 | 55.07% | 37.30% | 31 | 69.00% |

## 2. Breaking-label audit (100 cases)

Label trust: strong=6, proximate=79, ambiguous=15.

Ambiguous/unrelated reverts (excluded in sensitivity):

| id | repo | dep | trust | reason |
| --- | --- | --- | --- | --- |
| ood-break-matxx_feh-peeler-39b1596c02 | matxx/feh-peeler | nuxt | ambiguous | Revert with no explicit cause, or a grouped/multi-dependency revert. |
| ood-break-ss220-space_Paradise-54187f7146 | ss220-space/Paradise | webpack | ambiguous | Revert with no explicit cause, or a grouped/multi-dependency revert. |
| ood-break-netdata_netdata-5a5263188b | netdata/netdata | github.com/microsoft/go-mssqldb | ambiguous | Revert with no explicit cause, or a grouped/multi-dependency revert. |
| ood-break-jstime_jstime-5b11ebe528 | jstime/jstime | v8 | ambiguous | Revert with no explicit cause, or a grouped/multi-dependency revert. |
| ood-break-owncloud_contacts-f8b4388305 | owncloud/contacts | karma-mocha | ambiguous | Revert with no explicit cause, or a grouped/multi-dependency revert. |
| ood-break-navikt_meroppfolging-frontend-01e3234696 | navikt/meroppfolging-frontend | next | ambiguous | Revert with no explicit cause, or a grouped/multi-dependency revert. |
| ood-break-mongodb_apix-action-002b807a2b | mongodb/apix-action | typescript | ambiguous | Revert with no explicit cause, or a grouped/multi-dependency revert. |
| ood-break-asyncapi_kotlin-asyncapi-beff22e1c8 | asyncapi/kotlin-asyncapi | io.swagger.core.v3:swagger-core-jakarta | ambiguous | Revert with no explicit cause, or a grouped/multi-dependency revert. |
| ood-break-twikoojs_twikoo-723e0c5d98 | twikoojs/twikoo | @cloudbase/js-sdk | ambiguous | Revert with no explicit cause, or a grouped/multi-dependency revert. |
| ood-break-mdn_dex-756ab48937 | mdn/dex | http-proxy-middleware | ambiguous | Revert with no explicit cause, or a grouped/multi-dependency revert. |
| ood-break-securesign_rhtas-console-ui-c6e69bd881 | securesign/rhtas-console-ui | vite | ambiguous | Revert with no explicit cause, or a grouped/multi-dependency revert. |
| ood-break-ChelseaKR_family-greenhouse-09357eea80 | ChelseaKR/family-greenhouse | tailwindcss | ambiguous | Revert with no explicit cause, or a grouped/multi-dependency revert. |
| ood-break-arabianq_pipewire-soundpad-c1d145fbc8 | arabianq/pipewire-soundpad | tokio | ambiguous | Revert with no explicit cause, or a grouped/multi-dependency revert. |
| ood-break-Mikecranesync_MIRA-6c68e57a0c | Mikecranesync/MIRA | starlette | ambiguous | Revert with no explicit cause, or a grouped/multi-dependency revert. |
| ood-break-repairman29_chump-e4842dad95 | repairman29/chump | tokio-tungstenite | ambiguous | Revert with no explicit cause, or a grouped/multi-dependency revert. |

## 3. Pre-merge state audit

- total 100; resolved-original-PR 91; synthesized 9
- titles containing outcome words: **0**
- with body: 89; with changelog: 87
- cases whose state contains an outcome token anywhere (body/changelog release notes): 60

## 4. JEV auto-merged at frozen 0.62 — labeled breaking (15)

| id | repo | ecosystem | dep | old→new | type | JEV p(AM) | JEV probs | decision | trust | delay d | commit | evidence summary |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ood-break-DeontewattsV1_Ethos-Aegis--415eb05ce0 | DeontewattsV1/Ethos-Aegis- | javascript | tsx | 4.22.3→4.23.13" | minor | 0.970 | 0.970/0.010/0.020 | AUTO_MERGE | proximate | 0 | [415eb05ce0](https://github.com/DeontewattsV1/Ethos-Aegis-/commit/415eb05ce0a3f8ca77c721c4dc85f8cbfd2db64c) | Revert of this exact update within 14 days; no explicit cause stated. |
| ood-break-MixinNetwork_android-app-5810a04412 | MixinNetwork/android-app | java | com.bugsnag:bugsnag-android | 6.26.1→6.27.0 | minor | 0.770 | 0.770/0.020/0.210 | AUTO_MERGE | proximate | 10 | [5810a04412](https://github.com/MixinNetwork/android-app/commit/5810a04412d056130b9cefde9333a5ba48fe6b8d) | Revert of this exact update within 14 days; no explicit cause stated. |
| ood-break-RedHatInsights_sources-api-go-64652fb899 | RedHatInsights/sources-api-go | go | gorm.io/driver/postgres | 1.6.0→1.6.2 | patch | 0.620 | 0.620/0.020/0.360 | AUTO_MERGE | proximate | 7 | [64652fb899](https://github.com/RedHatInsights/sources-api-go/commit/64652fb8993c1b40c2ee31280a8831c7b9b7bd3b) | Revert of this exact update within 14 days; no explicit cause stated. |
| ood-break-rajat-wyrm_intelliview-orchestrator-537cb15140 | rajat-wyrm/intelliview-orchestrator | python | pytest-cov | 6.0.0→6.3.0" | minor | 0.830 | 0.830/0.010/0.160 | AUTO_MERGE | proximate | 0 | [537cb15140](https://github.com/rajat-wyrm/intelliview-orchestrator/commit/537cb151401d31e18b4ce6563a09b43e79983d96) | Revert of this exact update within 14 days; no explicit cause stated. |
| ood-break-nla_nla-arclight-e1efbabd94 | nla/nla-arclight | ruby | selenium-webdriver | 4.45.0→4.46.0 | minor | 0.750 | 0.750/0.010/0.240 | AUTO_MERGE | proximate | 0 | [e1efbabd94](https://github.com/nla/nla-arclight/commit/e1efbabd9492abe05ba99e34764aac1c71fccb40) | Revert of this exact update within 14 days; no explicit cause stated. |
| ood-break-ARCoder181105_funcatlas-f6356353aa | ARCoder181105/funcatlas | javascript | react | 19.2.7→19.2.8" | patch | 0.950 | 0.950/0.010/0.040 | AUTO_MERGE | proximate | 0 | [f6356353aa](https://github.com/ARCoder181105/funcatlas/commit/f6356353aacad8cd390ddaf82b24e244f4dce7f0) | Revert of this exact update within 14 days; no explicit cause stated. |
| ood-break-zooniverse_front-end-monorepo-af5eca12ea | zooniverse/front-end-monorepo | javascript | vitest | 3.1.4→3.2.6 | minor | 0.880 | 0.880/0.010/0.110 | AUTO_MERGE | proximate | 0 | [af5eca12ea](https://github.com/zooniverse/front-end-monorepo/commit/af5eca12ea65ea3d91c133b9c915ecb6857c7e0a) | Revert of this exact update within 14 days; no explicit cause stated. |
| ood-break-Yeshwanth-kr_govt-image-compressor-2634032d9f | Yeshwanth-kr/govt-image-compressor | javascript | eslint | 10.6.0→10.7.0" | minor | 0.850 | 0.850/0.010/0.140 | AUTO_MERGE | proximate | 0 | [2634032d9f](https://github.com/Yeshwanth-kr/govt-image-compressor/commit/2634032d9f6a5f8d1e80aa1b3f7ec40c5562a3ff) | Revert of this exact update within 14 days; no explicit cause stated. |
| ood-break-netdata_netdata-5a5263188b | netdata/netdata | go | github.com/microsoft/go-mssqldb | 1.9.7→1.9.8 | patch | 0.750 | 0.750/0.020/0.230 | AUTO_MERGE | ambiguous | 0 | [5a5263188b](https://github.com/netdata/netdata/commit/5a5263188b97428e27cc8a31054f9ef52706cbbc) | Revert with no explicit cause, or a grouped/multi-dependency revert. |
| ood-break-navikt_meroppfolging-frontend-01e3234696 | navikt/meroppfolging-frontend | javascript | next | 16.3.0→16.3.1 | patch | 0.830 | 0.830/0.010/0.160 | AUTO_MERGE | ambiguous | 3 | [01e3234696](https://github.com/navikt/meroppfolging-frontend/commit/01e3234696f1eb9e619920abe99a390f346cd619) | Revert with no explicit cause, or a grouped/multi-dependency revert. |
| ood-break-navikt_dialogmote-frontend-db4f2eeb47 | navikt/dialogmote-frontend | javascript | open | 11.0.0→11.0.1 | patch | 0.980 | 0.980/0.000/0.020 | AUTO_MERGE | proximate | 3 | [db4f2eeb47](https://github.com/navikt/dialogmote-frontend/commit/db4f2eeb4736603e446338c898b773870e810359) | Revert of this exact update within 14 days; no explicit cause stated. |
| ood-break-shivbera18_quiz-repo-2558476011 | shivbera18/quiz-repo | javascript | vitest | 4.1.10→4.1.11 | patch | 0.860 | 0.860/0.010/0.130 | AUTO_MERGE | proximate | 1 | [2558476011](https://github.com/shivbera18/quiz-repo/commit/2558476011c2cd7e9a306a4678905ad3f8d413d7) | Revert of this exact update within 14 days; no explicit cause stated. |
| ood-break-nairuby_duka-f85d6077c1 | nairuby/duka | ruby | selenium-webdriver | 4.48.0→4.49.0" | minor | 0.640 | 0.640/0.020/0.340 | AUTO_MERGE | proximate | 0 | [f85d6077c1](https://github.com/nairuby/duka/commit/f85d6077c18b4ba6658d9679cebdb71136ff5d6f) | Revert of this exact update within 14 days; no explicit cause stated. |
| ood-break-otterscale_otterscale-1055288c2e | otterscale/otterscale | javascript | @bufbuild/buf | 1.72.0→1.73.0 | minor | 0.850 | 0.850/0.010/0.140 | AUTO_MERGE | proximate | 0 | [1055288c2e](https://github.com/otterscale/otterscale/commit/1055288c2e48b8611af6e7fb33f6731ba2399b0e) | Revert of this exact update within 14 days; no explicit cause stated. |
| ood-break-toxicbishop_Portfolio-4-c243d2c191 | toxicbishop/Portfolio-4 | javascript | lucide-react | 1.28.0→1.31.0" | minor | 0.960 | 0.960/0.010/0.030 | AUTO_MERGE | proximate | 0 | [c243d2c191](https://github.com/toxicbishop/Portfolio-4/commit/c243d2c191765221e4d3af080a6ee9132da38cbb) | Revert of this exact update within 14 days; no explicit cause stated. |

## 5. JEV safe auto-merges at frozen 0.62 (15)

| id | repo | dep | old→new | type | JEV p(AM) | DeepSeek | rules |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ood-ctrl-abenassi_calculadora-inflacion-ar-8 | abenassi/calculadora-inflacion-ar | @types/node | 26.4.0→26.5.0 | minor | 0.820 | AUTO_MERGE (0.900) | AUTO_MERGE |
| ood-ctrl-dlunch_wie-1427 | dlunch/wie | lucide | 1.44.0→1.45.0 | minor | 0.900 | AUTO_MERGE (0.850) | AUTO_MERGE |
| ood-ctrl-kestra-io_plugin-tika-91 | kestra-io/plugin-tika | `cva6` | 9.3.0→include | other | 0.720 | HUMAN_REVIEW (0.600) | AUTO_MERGE |
| ood-ctrl-SKB-CGN_ioBroker.energiefluss-erweitert-529 | SKB-CGN/ioBroker.energiefluss-erweitert | @tsconfig/node22 | 22.0.5→22.0.6 | patch | 0.930 | AUTO_MERGE (0.900) | AUTO_MERGE |
| ood-ctrl-Yeshwanth-kr_govt-image-compressor-47 | Yeshwanth-kr/govt-image-compressor | vite | 8.2.2→8.3.0 | minor | 0.770 | AUTO_MERGE (0.800) | AUTO_MERGE |
| ood-ctrl-Yeshwanth-kr_govt-image-compressor-45 | Yeshwanth-kr/govt-image-compressor | eslint | 10.9.1→10.10.0 | minor | 0.620 | AUTO_MERGE (0.850) | AUTO_MERGE |
| ood-ctrl-Yeshwanth-kr_govt-image-compressor-43 | Yeshwanth-kr/govt-image-compressor | eslint-plugin-react-refresh | 0.5.5→0.5.6 | patch | 0.980 | AUTO_MERGE (0.920) | AUTO_MERGE |
| ood-ctrl-Yeshwanth-kr_govt-image-compressor-42 | Yeshwanth-kr/govt-image-compressor | @types/react-dom | 19.2.5→19.2.7 | patch | 0.950 | AUTO_MERGE (0.950) | AUTO_MERGE |
| ood-ctrl-pycabbage_brave-search-mcp-remote-8 | pycabbage/brave-search-mcp-remote | @types/node | 26.4.0→26.5.0 | minor | 0.750 | AUTO_MERGE (0.850) | AUTO_MERGE |
| ood-ctrl-gocd_gocd-14608 | gocd/gocd | sass-embedded | 1.104.0→1.104.1 | patch | 0.900 | AUTO_MERGE (0.900) | AUTO_MERGE |
| ood-ctrl-ivopogace_riviera-sunbed-booking-1091 | ivopogace/riviera-sunbed-booking | @stripe/stripe-js | 9.15.0→9.16.0 | minor | 0.920 | AUTO_MERGE (0.850) | AUTO_MERGE |
| ood-ctrl-ivopogace_riviera-sunbed-booking-1087 | ivopogace/riviera-sunbed-booking | @angular/build | 22.1.6→22.1.8 | patch | 0.930 | AUTO_MERGE (0.850) | AUTO_MERGE |
| ood-ctrl-ivopogace_riviera-sunbed-booking-1086 | ivopogace/riviera-sunbed-booking | typescript-eslint | 8.69.0→8.70.0 | minor | 0.670 | AUTO_MERGE (0.850) | AUTO_MERGE |
| ood-ctrl-mdn_dex-524 | mdn/dex | @types/node | 24.13.3→24.13.5 | patch | 0.910 | AUTO_MERGE (0.900) | AUTO_MERGE |
| ood-ctrl-opensquare-network_subsquare-7526 | opensquare-network/subsquare | vitest | 4.1.5→4.1.11 | patch | 0.940 | AUTO_MERGE (0.850) | AUTO_MERGE |

## 6. Threshold provenance (original 1,102 benchmark)

Selection path: `run.ts` computes `coverageAtPrecision(devSplit, 0.99)` on the **development split only**, then applies that threshold unchanged to the held-out split (`evaluateAtThreshold`).

| model | split | dev threshold | dev auto-merges | held-out precision | held-out coverage | held-out unsafe |
| --- | --- | --- | --- | --- | --- | --- |
| Static rules | repo-disjoint | 1 | 0 | 100.00% | 19.55% | 0 |
| Static rules | repo-disjoint | 1 | 0 | 100.00% | 19.55% | 0 |
| Static rules | time-ordered | 1 | 0 | 100.00% | 34.14% | 0 |
| Static rules | time-ordered | 1 | 0 | 100.00% | 34.14% | 0 |
| ~deepseek/deepseek-flash-latest | repo-disjoint | 0.9 | 5 | 100.00% | 1.40% | 0 |
| ~deepseek/deepseek-flash-latest | repo-disjoint | 0.9 | 5 | 100.00% | 1.40% | 0 |
| ~deepseek/deepseek-flash-latest | time-ordered | 0.9 | 1 | 100.00% | 2.72% | 0 |
| ~deepseek/deepseek-flash-latest | time-ordered | 0.9 | 1 | 100.00% | 2.72% | 0 |
| Jev 1.13 | repo-disjoint | 0.62 | 22 | 100.00% | 12.01% | 0 |
| Jev 1.13 | repo-disjoint | 0.62 | 22 | 100.00% | 12.01% | 0 |
| Jev 1.13 | time-ordered | 1 | 0 | 100.00% | 0.00% | 0 |
| Jev 1.13 | time-ordered | 1 | 0 | 100.00% | 0.00% | 0 |

The repo-disjoint dev split produced the only operative JEV threshold (0.62, 22 dev auto-merges). The time-ordered dev split had **0 feasible thresholds**, so its frozen threshold degenerated to 1.0 (a no-op). No single policy was designated primary in the original run; the repo-disjoint threshold is the only one with nonzero development coverage, so it is the only meaningful transfer test. Neither is re-selected here.

## 7. Sensitivity analysis (existing OOD labels only — diagnostic)

| subset | n | ctrl/brk | JEV AUROC | JEV AP | JEV0.62 auto | precision | coverage | unsafe |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| all (100 breaking / 85 control) | 185 | 85/100 | 0.605 | 0.510 | 30 | 50.00% | 16.22% | 15 |
| excluding ambiguous/unrelated reverts (15 dropped) | 170 | 85/85 | 0.592 | 0.538 | 28 | 53.57% | 16.47% | 13 |
| javascript only | 130 | 62/68 | 0.673 | 0.573 | 23 | 60.87% | 17.69% | 9 |
| non-javascript | 55 | 23/32 | 0.379 | 0.335 | 7 | 14.29% | 12.73% | 6 |

## 9. Data-quality observations

- 26/100 breaking cases have a trailing quote/backtick in the parsed version (e.g. `4.23.13"`), from the revert-message regex. Minor: semver-type classification is unaffected in the inspected cases, but it is a construction artifact.
- One control dependency parsed as `` `cva6` `` (backticks).

## 8. Classification

**A. Implementation/calculation bug:** Ruled out: every recomputed OOD metric (AUROC, AP, bins, frozen counts, precision/coverage/unsafe, breaking recall) matches the report exactly (max delta 0).

**B. Dataset/label-construction problem:** All 100 reverts name the exact dependency and/or version, so every revert targeted THIS update (unrelated=0). But only 6 state an explicit breakage reason; 79 are proximate (revert of the exact update within <=14 days) and 15 are ambiguous (no stated reason and/or grouped revert). Label construction is therefore defensible but largely circumstantial. Excluding the 15 ambiguous cases: AUROC 0.605 -> 0.592, AP 0.510 -> 0.538, frozen-0.62 precision 50.0% -> 53.6%, unsafe 15 -> 13. Label ambiguity is real but does NOT rescue the signal.

**C. Genuine distribution-shift failure:** Primary. Overall JEV AUROC is 0.605, but the signal is ecosystem-dependent: JavaScript AUROC 0.673 vs non-JavaScript 0.379 (below chance). Frozen-0.62 precision is 60.9% on JavaScript vs 14.3% on non-JavaScript, with 15 unsafe merges overall. The frozen original policy is unsafe on OOD under every label subset.

**D. Unresolved ambiguity:** 15 ambiguous reverts (no stated cause) and 9 synthesized-state cases remain; a cleaner OOD set could shift the magnitude slightly, but not enough to overturn the weak overall ranking (AUROC 0.605).

**Primary classification: C — genuine distribution-shift failure**


# Methodology

This document describes how both datasets were constructed, how leakage was controlled,
and how the models are evaluated. It covers the original in-distribution benchmark and the
independent OOD validation. The implementation is frozen in `src/`; see
`data/ood-source-manifest.json` for source hashes.

This is an independent Scarif Labs research/engineering evaluation. It is not a TypeSafe
endorsement or product review, and it is not a reproduction of TypeSafe's own evaluations.
It separates decision/ranking quality, probability calibration, and safe operational
automation.

## 1. Decision task

Given one dependency-update PR and only pre-merge information, choose the safest action:

- `AUTO_MERGE` — merge automatically;
- `HOLD` — do not merge yet, but the update may become safe with more pre-merge evidence;
- human review (`REQUIRE_REVIEW` for JEV/rules, `HUMAN_REVIEW` for DeepSeek).

The gate used throughout is structural and identical across models:

```
auto_merge(case)  iff  decision == AUTO_MERGE  AND  autoMergeScore(case) >= threshold
```

`autoMergeScore` per adapter (defined in `src/evaluate.ts`):

| model | score |
| --- | --- |
| JEV | `probabilities.AUTO_MERGE` (calibrated distribution over the Choice options) |
| DeepSeek Flash | `confidence` when `decision == AUTO_MERGE`, else `0` (never treated as a distribution) |
| static rules | `1` if AUTO_MERGE else `0` |

## 2. Original dataset (in-distribution)

- **Breaking (551):** BUMP (`chains-project/bump`, MIT) benchmark records, used as
  `REQUIRE_REVIEW`. 20 records with no retrievable PR were dropped.
- **Controls (551):** merged dependency-update PRs from the same repositories, verified
  non-breaking: merged, no failing/pending checks, no revert within 90 days, the update
  is present at the PR head, and the default branch is not a downgrade. Sampling is
  round-robin across repositories.
- **Final:** 1,102 cases across 148 repositories.

## 3. OOD dataset (independent)

- **Breaking (100):** commits that **revert a dependency bump in-repository** (commit
  search for `Revert "build(deps): bump X from A to B"`), one per repository, across 100
  independent repositories. The revert is the project's own negative-outcome evidence, not
  a BUMP reproduction.
- **Controls (85):** merged dependency-update PRs from the same independent repositories,
  verified with the same standard as the original controls.
- **Final:** 185 cases across 103 repositories.
- **Independence:** 0 overlap with the original benchmark on repository, PR, head SHA, or
  `dependency|old|new` transition (`data/ood-dataset.meta.json`).
- **Sanitization:** where the original-PR resolver landed on the revert PR itself, the
  title/body were replaced with a synthesized pre-merge bump state and the manifest diff
  re-inverted (9 cases). Controls that were actually revert PRs were dropped.

## 4. Leakage control

The model-visible state is a whitelisted projection with top-level fields
`project`, `update`, `pullRequest`, `dependencyReleaseNotes`, `preMergeChecks`
(`src/prompt.ts`). Post-merge facts (merge status, revert, failure category, gold) are
never included. Audits:

- `data/leakage-report.json` — original dataset: **PASS**.
- `data/ood-leakage-report.json` — OOD dataset: **PASS** (0 title leaks, no revert body or
  revert diff).

## 5. Evaluation definitions

- **Ranking:** AUROC and average precision, control class positive. Decision-agnostic.
- **Risk–coverage:** for each threshold, precision and coverage of the auto-merge policy.
- **Oracle / retrospective:** threshold selected on the evaluation labels; an upper bound,
  always labelled retrospective.
- **Frozen policy:** threshold selected on a development split via
  `coverageAtPrecision(devSplit, target)` and applied unchanged to a held-out split
  (`evaluateAtThreshold`). This is the deployable evaluation.
- **Splits (original):** repository-disjoint (70/30 by repo hash), time-ordered (earliest
  70% / latest 30%), held-out package families, update type, dependency scope.
- **Errors:** cases whose adapter errors are marked `ERROR` and excluded from metrics, never
  converted into decisions.

## 6. Model configuration

- **JEV:** `jev-latest` (SDK default), one Choice question; input state identical to the
  other models. Pricing used: $42 / billion input tokens, output free.
- **DeepSeek Flash:** OpenRouter model alias `~deepseek/deepseek-flash-latest`, which
  resolves to `deepseek/deepseek-v4.1-flash`; reasoning disabled; temperature 0;
  JSON-schema output `{decision, risk, confidence}`; retry max 3 with exponential backoff.
- **Static rules:** deterministic policy in `src/rules.ts`.

## 7. OOD threshold provenance

The OOD evaluation applies thresholds **frozen from the original benchmark**; no threshold
is selected on OOD labels. The original run produced:

| model | split | dev threshold | dev auto-merges | held-out precision / coverage / unsafe |
| --- | --- | --- | --- | --- |
| JEV | repo-disjoint | 0.62 | 22 | 100% / 12.01% / 0 |
| JEV | time-ordered | 1.00 | 0 | 100% / 0.00% / 0 |
| DeepSeek | repo-disjoint | 0.90 | 5 | 100% / 1.40% / 0 |
| Static rules | repo-disjoint | 1.00 | 0 | 100% / 19.55% / 0 |

Only the JEV repo-disjoint threshold had non-zero development coverage; the time-ordered
threshold degenerated to a no-op. See `analysis/ood-forensic-audit.json` for the full audit.

## 8. Forensic audit summary

Independent recomputation of every OOD metric matched the report exactly (max delta 0).
Of 100 OOD breaking labels: 6 explicit causal reverts, 79 proximate, 15 ambiguous, 0
unrelated. Excluding ambiguous labels does not change the conclusion. Details in
`analysis/ood-forensic-audit.md`.

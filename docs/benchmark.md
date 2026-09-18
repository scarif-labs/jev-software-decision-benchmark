# Original benchmark

Independent Scarif Labs evaluation. It tests a general software-systems idea — a typed
probabilistic decision primitive embedded in a real automation workflow — and is not a
vendor evaluation or a reproduction of TypeSafe's own benchmarks.

## Data

- **Breaking (551):** BUMP (MIT, chains-project/bump), reproducible Maven breaking updates. Gold = `REQUIRE_REVIEW`.
- **Controls (551):** merged dependency-update PRs from the same repository pool, verified non-breaking (merged, checks not failing, no revert in 90 days, update applied, not downgraded). Gold = `AUTO_MERGE`.
- 20 BUMP records with no retrievable PR were dropped. Final: 1102 cases across 148 repositories.
- Leakage audit: PASS: no outcome-derived field reaches the model.

## Decision task

State available before merge only: repository, ecosystem, dependency, old/new version, update type, PR title/body, manifest diff, dependency release notes, and pre-merge CI status. Decisions: `AUTO_MERGE`, `HOLD`, `REQUIRE_REVIEW`.

## Models

- **JEV (`jev-latest`):** TypeSafe's System One decision model. TypeSafe describes System One models as returning typed decisions and uncertainty intended for software to consume directly. Here it is asked one Choice question with the three actions as criteria and returns `choice`, `probabilities`, `confidence`. This benchmark tests that general idea independently.
- **DeepSeek Flash (`~deepseek/deepseek-flash-latest` → `deepseek/deepseek-v4.1-flash`):** structured JSON `{decision, risk, confidence}`, reasoning disabled, temperature 0. AUTO_MERGE probability = confidence when the decision is AUTO_MERGE, else 0.
- **Static rules:** deterministic Renovate-style policy over update type and CI status.

## Evaluation

- **Ranking:** AUROC and average precision over the control class; risk–coverage and precision–recall curves.
- **Oracle/retrospective:** threshold selected on evaluation labels (upper bound).
- **Frozen policy:** threshold selected on a development split and applied unchanged to a held-out split.
- **Splits:** repository-disjoint (70/30 by repo hash), time-ordered (earliest 70% / latest 30%), held-out package families, update-type, and dependency scope.
- **Leakage:** the model-visible state is a whitelisted pre-merge projection; audits in `data/leakage-report.json`.

See `METHODOLOGY.md` and `RESULTS.md`.

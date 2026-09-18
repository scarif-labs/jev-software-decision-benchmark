# Building the real cases

## 1. BUMP stress set

The BUMP repository contains the JSON metadata for its reproducible breaking dependency updates under `data/benchmark`.

A convenient runtime approach is to download the repository archive:

```bash
curl -L https://github.com/chains-project/bump/archive/refs/heads/main.zip -o /tmp/bump.zip
unzip -q /tmp/bump.zip -d /tmp
```

Map each BUMP record to `DependencyCase` and set `gold=REQUIRE_REVIEW`.

**Do not include** `failureCategory`, `breakingCommit`, or any post-update result in the state passed to Jev/LLM.

## 2. Non-breaking controls

Use real merged dependency-update PRs and verify the post-merge outcome before labeling them `AUTO_MERGE`. A safe control should have, at minimum:

- PR merged successfully.
- Required checks passed before merge.
- No immediate revert of the update.
- No clearly attributable regression in a fixed observation window.

A historical dataset of dependency/security PRs is available at Zenodo DOI 10.5281/zenodo.12720767. Its largest dependency-update archive is multi-GB; for rapid work, use its smaller derived sample first and inspect the included schema before constructing controls.

## 3. Leakage audit

Before calling any judge, print the exact state object and verify that it contains no gold-label-derived fields.

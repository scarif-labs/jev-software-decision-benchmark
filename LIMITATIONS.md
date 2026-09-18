# Limitations and unresolved questions

This document lists the limitations that bear on interpretation. Negative findings are
stated explicitly and are not hidden.

## 1. The OOD outcome mechanism differs from the original benchmark

- Original breaking labels come from **BUMP**: a reproducible Maven build/test failure
  caused by a dependency update, confirmed by the benchmark authors.
- OOD breaking labels come from a **later in-repository revert** of the dependency bump.
  A revert is an independent negative-outcome signal, but it is not the same event class:
  a bump can be reverted for reasons other than a breaking regression (policy, a grouped
  update, a flaky upstream, an unrelated incident).
- Consequently, an OOD drop conflates **model generalization** with **label-mechanism
  change**. This is the single most important caveat.

## 2. OOD label quality is defensible but largely circumstantial

Forensic audit of the 100 OOD breaking cases (`analysis/ood-forensic-audit.json`):

- All 100 reverts name the exact dependency and/or version; **0 unrelated** reverts.
- **6** state an explicit breakage cause; **79** are *proximate* (revert of the exact
  update within ≤14 days, no stated reason); **15** are *ambiguous* (no reason and/or
  grouped revert).
- Excluding the 15 ambiguous cases does **not** rescue the signal: JEV AUROC moves
  0.605 → 0.592 and frozen-0.62 precision 50.0% → 53.6%.

## 3. OOD population is not balanced across ecosystems

- 130/185 OOD cases are JavaScript/npm; the original benchmark is Java/Maven.
- JEV AUROC is 0.673 on JavaScript and 0.379 (below chance) on non-JavaScript; the
  non-JavaScript subset has only 55 cases. The apparent OOD failure is partly an
  ecosystem-shift phenomenon and partly small-sample noise.

## 4. OOD state reconstruction is imperfect

- 91/100 breaking cases resolved to the real original bump PR (title/body/diff/checks);
  **9** were sanitized to synthesized pre-merge state because the resolver had landed on
  the revert PR itself (which would have leaked the outcome).
- 89 have a PR body, 87 have a changelog; the 9 synthesized cases have neither.
- No title leaks the outcome (0), and no revert body or revert diff reaches the model.
- **26/100** breaking cases carry a trailing quote in the parsed `newVersion`
  (e.g. `4.23.13"`) — a regex artifact, not semantically meaningful in the inspected
  cases, but a construction blemish.

## 5. Original benchmark limitations

- BUMP is a breakage stress test, not a production distribution; 551 controls were
  assembled by us, not by BUMP.
- Most BUMP breaking PRs had no CI checks configured, so the `checks` field is
  "no checks" for most breaking cases and green for some controls — a class-correlated
  signal that is legitimate pre-merge information but also partly an artifact of the
  source repositories.
- Controls are mostly verification tier C (version since superseded), verified by
  merge + no-revert + update-applied rather than a green build.

## 6. Temporal calibration instability

In the original benchmark, the time-ordered development split produced **no feasible JEV
threshold** (its highest-scoring breaking case, 0.60, exceeded its highest control, 0.55),
so the frozen time-ordered policy degenerated to a no-op. The repo-disjoint split produced
0.62. This is an early warning about temporal threshold portability and is consistent with
the OOD result; it is also a small-sample effect (17 JEV auto-merge decisions in that dev
split).

## 7. Retrospective vs deployable

Oracle coverage selects the threshold on evaluation labels and is an upper bound. Only the
frozen-policy numbers are deployable. On OOD, oracle coverage at 99% is 0% for every model,
so no deployable number is available there either.

## 8. Sample size and multiple comparisons

- OOD n = 185 (100/85): AUROC CI spans ~0.16.
- Subgroup results (ecosystem, update type) are small and should not be over-interpreted.
- No result here is a statistical-significance or promotional claim.

## 9. Unresolved questions

- Would a JEV threshold recalibrated on a *large, clean* OOD development split transfer
  better? (Not tested; would be a new experiment.)
- How much of the OOD drop is label-mechanism change vs ecosystem shift vs genuine
  generalization failure? The audit separates them qualitatively but cannot quantify the
  decomposition with n=185.
- Does the same pattern hold for other decision primitives / other dependency ecosystems?

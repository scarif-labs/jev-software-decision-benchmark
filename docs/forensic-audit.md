# Forensic audit of the OOD experiment

Read-only audit (`analysis/ood-forensic-audit.json`). No rerun and no threshold tuning.

## Metric recomputation

Every reported OOD metric was recomputed from raw per-case results with independent implementations of AUROC, average precision, binning, and the frozen-policy evaluator. **max absolute delta = 0** — no implementation or calculation bug.

## Label audit (100 breaking)

- Reverts targeting this update: **all 100** name the exact dependency and/or version (0 unrelated).
- Trust: strong 6, proximate 79, ambiguous 15.
- Only 6 reverts state an explicit breakage cause; 79 are proximate (exact-update revert within ≤14 days); 15 are ambiguous (no reason and/or grouped revert).
- Excluding the ambiguous cases does not rescue the signal (AUROC 0.605 → 0.592).

## State audit

- Resolved original PR state: 91; synthesized: 9.
- **Title leaks: 0.** No revert body or revert diff reaches the model.
- Data-quality artifact: 26/100 breaking cases carry a trailing quote in the parsed `newVersion`.

## Classification

C. Signal does not replicate (as a transferable decision signal), with a weak stratum-specific ordering exception

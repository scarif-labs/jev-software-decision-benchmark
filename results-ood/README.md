# OOD validation — results

Public summary: [`summary.json`](summary.json). Full analysis:
`analysis/ood-validation.json`, `analysis/ood-forensic-audit.json`, and `RESULTS.md`.

- 185 cases (100 breaking / 85 control), 103 independent repositories.
- JEV AUROC 0.605 (95% CI 0.525–0.685), static rules 0.569, DeepSeek Flash 0.534.
- Frozen-policy transfer (thresholds from the original benchmark, unchanged):
  - JEV 0.62 → 30 auto-merges, 50.0% precision, 16.22% coverage, 15 unsafe merges.
  - DeepSeek 0.90 → 10 auto-merges, 70.0% precision, 5.41% coverage, 3 unsafe merges.
  - Static rules 1.00 → 69 auto-merges, 55.07% precision, 37.30% coverage, 31 unsafe merges.
- Retrospective oracle coverage at 99% precision: 0% for all three models.
- JEV total cost $0.0232; DeepSeek $0.1225.

Per-case model outputs are withheld; regenerate with the OOD command in
`REPRODUCIBILITY.md`. See `data/README.md` for provenance and `LIMITATIONS.md` for caveats.

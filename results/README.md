# Original benchmark — results

Public summary: [`summary.json`](summary.json). Full analysis: `analysis/decision-forensics.json`
and `RESULTS.md`.

- 1,102 cases (551 breaking / 551 control), 148 repositories.
- JEV AUROC 0.851, static rules 0.602, DeepSeek Flash 0.585.
- Oracle coverage at 99% precision: JEV 5.90%, DeepSeek 0.91%, static rules 10.34%
  (static rules auto-merges 1 unsafe case; coverage at 99.5% is 0%).
- JEV total cost $0.1447; DeepSeek $0.7056; static rules $0.

Per-case model outputs (`RULES.jsonl`, `OPENROUTER.jsonl`, `JEV.jsonl`) are withheld from
the public repository; they are regenerated with `npm run benchmark` (see
`REPRODUCIBILITY.md`). Hashes of the derived summaries are in `data/MANIFEST.json`.

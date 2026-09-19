# Publication checklist

Status of the repository before public release. Packaging only — no model runs, no changes
to `src/`, datasets, or benchmark results.

## Required checks

- [x] **Data licensing checked**
  - BUMP (`chains-project/bump`) is **MIT** — the original breaking metadata may be
    redistributed.
  - Zenodo `10.5281/zenodo.12720767` is **CC-BY-4.0** — inspected only, **not included**.
  - Controls and OOD cases derive from **GitHub PRs**; raw PR text (titles, bodies, diffs,
    release notes) is **withheld** and only hashes/manifests + reconstruction scripts are
    published. See `data/README.md`.
- [x] **Secrets checked**
  - Secret scan over all publishable files (excluding `node_modules`, `.env`, raw API
    cache, and withheld `*.jsonl`): **no API keys, tokens, bearer headers, or provider
    secrets found**.
  - `.env` exists on the developer machine but is matched by `.gitignore` and must not be
    committed. `.env.example` contains empty placeholders only.
- [x] **Metrics cross-checked**
  - `scripts/generate_public_report.mjs` asserts every headline number against the
    canonical JSON and fails on mismatch.
  - `scripts/verify_public_numbers.mjs`: **548 numeric tokens checked across all public
    markdown, 0 unexplained** (all traceable to canonical JSON or explicit constants).
- [x] **Figures regenerated**
  - `analysis/figures/`: `auroc-comparison.svg`, `risk-coverage.svg`,
    `frozen-policy-transfer.svg`, `ecosystem-auroc.svg`, `score-calibration.svg`,
    `decision-agreement.svg`, `latency-cost.svg`. All valid XML, regenerated from canonical results.
- [x] **Methodology documented** — `METHODOLOGY.md`, `docs/benchmark.md`.
- [x] **Limitations documented** — `LIMITATIONS.md`.
- [x] **Reproducibility documented** — `REPRODUCIBILITY.md`.

## Additional checks performed

- [x] **No local filesystem paths** in publishable files (absolute-path occurrences are
  confined to gitignored report/pilot artifacts).
- [x] **No chat/session identifiers** (`gen-` ids, session/conversation ids) in
  publishable files.
- [x] **No `.env` committed** (gitignored).
- [x] **Links resolve** — relative links in all markdown verified.
- [x] **Tests pass** — `npx tsc --noEmit` (exit 0), `npm run schema-check` (leakage gate
  PASS on 1,102 cases).
- [x] **Existing benchmark artifacts unchanged** — `src/` mtimes 06:57–07:42, datasets
  06:57–08:46, canonical analyses 08:12–08:58; packaging wrote only new files plus the
  documentation listed below.
- [x] **Raw data withheld** — `data/*.jsonl` per-case files are gitignored; only
  manifests, stats, and leakage reports are committed.
- [x] **Negative findings included** — OOD failure, 15 ambiguous reverts, 26 parsing
  artifacts, 9 synthesized states, and calibration non-transfer are all documented.

## Open questions requiring the maintainer's decision

- [ ] **Confirm the code license.** `LICENSE` is MIT for our code/docs; the withheld data is
  third-party. Confirm the copyright holder line before publishing.
- [ ] **Decide whether to publish any raw dataset.** Recommendation: **no** — publish
  hashes + reconstruction scripts. If raw BUMP-derived metadata is published, it is MIT
  and may be redistributed, but the enriched PR bodies/diffs should still be withheld.
- [ ] **Confirm no model-provider terms prohibit publishing derived scores.** Only aggregate
  scores and short public metadata are published; no provider output text is republished
  beyond `analysis/ood-forensic-audit.json`'s short public commit-message excerpts.
- [ ] **Optional:** pin a release tag and cite the exact commit hash once pushed.

## Not done (by instruction)

- [x] Not published to GitHub.
- [x] No social post created.
- [x] No new model experiments run.

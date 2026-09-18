# Reproducibility

Everything reported in `README.md` and `RESULTS.md` is generated from canonical JSON
artifacts by committed scripts. No number is hand-typed in the generated outputs.

## 1. Regenerate the public report and figures (no model calls)

```bash
node scripts/generate_public_report.mjs   # RESULTS.md, docs/, results* summaries, data/MANIFEST.json
python scripts/make_figures.py           # analysis/figures/*.svg
```

`generate_public_report.mjs` asserts the headline numbers against the canonical JSON and
fails loudly on any mismatch.

## 2. Canonical artifacts

| artifact | produced by | committed |
| --- | --- | --- |
| `report/table.json` | `npm run benchmark` | withheld (contains a local path); regenerate |
| `analysis/decision-forensics.json` | `scripts/decision_forensics.mts` | yes |
| `analysis/ood-validation.json` | `scripts/ood_validation.mts` | yes |
| `analysis/ood-forensic-audit.json` | `scripts/ood_forensic_audit.mts` | yes |
| `data/dataset.stats.json`, `data/leakage-report.json` | dataset pipeline | yes |
| `data/ood-dataset.meta.json`, `data/ood-leakage-report.json`, `data/ood-source-manifest.json` | OOD pipeline | yes |
| `results/summary.json`, `results-ood/summary.json` | `generate_public_report.mjs` | yes |

## 3. Environment

- Node.js 20+ (`package.json` engines), `npm install`.
- Environment variables (never committed): `TYPESAFE_API_KEY`, `OPENROUTER_API_KEY`.
  See `.env.example`.
- DeepSeek pricing env used for cost: `OPENROUTER_USD_PER_MTOK_IN=0.30`,
  `OPENROUTER_USD_PER_MTOK_OUT=1.20`. JEV cost uses the SDK-reported tokens at
  $42 / billion input tokens.

## 4. Rebuild the datasets

Raw per-case JSONL contain GitHub PR text (titles, bodies, diffs, release notes) and are
**not redistributed**. To rebuild and verify against the recorded hashes in
`data/MANIFEST.json`:

```bash
# Original benchmark
npm run bump        # requires a local BUMP checkout at BUMP_DIR (default /tmp/bump-main)
npm run controls    # GitHub API (dependabot/renovate PRs)
npm run dataset
npm run audit

# OOD validation
node scripts/build_ood.mjs
node scripts/sanitize_ood.mjs
npx tsx scripts/ood_audit.mts
```

`data/MANIFEST.json` records SHA-256 and byte size for each withheld raw dataset so a
rebuild can be verified byte-for-byte where deterministic.

## 5. Rerun the models

Requires API keys and will incur cost. This is not needed to reproduce the published
numbers from the committed analyses.

```bash
cp .env.example .env    # set keys
JUDGES=rules,openrouter,jev DATASET=data/dataset.jsonl CONCURRENCY=8 OUTDIR=results REPORTDIR=report npm run benchmark
JUDGES=openrouter,jev       DATASET=data/ood-dataset.jsonl CONCURRENCY=8 OUTDIR=results-ood REPORTDIR=report-ood \
  OPENROUTER_USD_PER_MTOK_IN=0.30 OPENROUTER_USD_PER_MTOK_OUT=1.20 npm run benchmark
```

## 6. Determinism notes

- Dataset construction uses cached GitHub API responses; a fresh rebuild may differ if the
  upstream repositories change. Hashes pin the exact versions used.
- The OOD bootstrap CIs use 2,000 resamples and a seeded-free RNG; the point estimates are
  deterministic, CIs vary slightly across reruns.
- The static baseline is fully deterministic.

## 7. Verification commands

```bash
npx tsc --noEmit            # type-check the harness (src/)
npm run schema-check        # decision schema + leakage gate
node scripts/generate_public_report.mjs   # re-asserts headline numbers
```

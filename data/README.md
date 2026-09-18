# Data

This directory contains provenance, schema, and audit artifacts for the two datasets used
in the experiment. **Raw per-case JSONL files are withheld from the public repository**
because they contain GitHub PR text (titles, bodies, manifest diffs, dependency release
notes) whose redistribution is governed by GitHub's Terms of Service and the individual
repositories' licenses.

## Files

| file | contents | committed |
| --- | --- | --- |
| `README.md` | this document | yes |
| `MANIFEST.json` | SHA-256 + size of withheld raw datasets; hashes of published artifacts; external source licenses | yes |
| `dataset.stats.json` | original dataset counts | yes |
| `leakage-report.json` | original dataset leakage audit (verdict: PASS) | yes |
| `ood-dataset.meta.json` | OOD provenance, independence checks, case IDs, cost estimate | yes |
| `ood-leakage-report.json` | OOD leakage audit (verdict: PASS) | yes |
| `ood-source-manifest.json` | hashes of the frozen source/config; model-input aggregate hash | yes |
| `bump.cases.jsonl`, `control.cases.jsonl`, `dataset.jsonl` | original per-case records (GitHub text) | withheld |
| `ood-dataset.jsonl` | OOD per-case records (GitHub text) | withheld |
| `subset200.jsonl` | 200-case pilot subset (GitHub text) | withheld |

## External sources and licensing

| source | URL | license | use |
| --- | --- | --- | --- |
| BUMP | https://github.com/chains-project/bump/ | MIT | 551 reproduced breaking dependency updates (original benchmark) |
| Zenodo 12720767 | https://doi.org/10.5281/zenodo.12720767 | CC-BY-4.0 | inspected only; **not included** |
| GitHub REST/GraphQL API | https://docs.github.com/rest | GitHub ToS; PR content belongs to repository owners | controls, OOD reverts, PR metadata fetched at build time |

The repository's MIT `LICENSE` covers our code and generated summaries, not the withheld
third-party content.

## Reconstructing the datasets

```bash
npm run bump && npm run controls && npm run dataset && npm run audit   # original
node scripts/build_ood.mjs && node scripts/sanitize_ood.mjs && npx tsx scripts/ood_audit.mts   # OOD
```

Verify a rebuild against `MANIFEST.json` (`rawDatasetsWithheld`).

## Leakage

Both datasets pass the leakage gate: the model-visible state is a pre-merge-only
projection and contains no outcome-derived fields. See `leakage-report.json` and
`ood-leakage-report.json`.

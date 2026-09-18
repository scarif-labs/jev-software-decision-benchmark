# Figures

Publication figures for the benchmark, generated **only** from canonical JSON artifacts.
No model calls and no data changes.

```bash
python scripts/make_figures.py        # writes the six SVGs here
node scripts/check_figures.mjs       # objective layout audit (bounds / clipping / overlaps)
# optional raster preview at native 1600x900:
for f in analysis/figures/*.svg; do rsvg-convert -w 1600 -h 900 "$f" -o "${f%.svg}.png"; done
```

Outputs (6): `original-risk-coverage.svg`, `ood-risk-coverage.svg`, `auroc-comparison.svg`,
`score-calibration.svg`, `latency-cost.svg`, `frozen-policy-comparison.svg`.

## Risk–coverage curve semantics (verified, not assumed)

The canonical `riskCoverageCurve` arrays contain **distinct threshold / score operating
points — category (B) — not every ranked top-k operating point (category A)**:

| series | points | distinct thresholds |
| --- | --- | --- |
| original JEV | 56 | 56 |
| original DeepSeek | 12 | 12 |
| original static rules | 2 | 2 |
| OOD JEV | 29 | 29 |
| OOD DeepSeek | 7 | 7 |
| OOD static rules | 2 | 2 |

The static rule is binary (`autoMergeScore` ∈ {0, 1}); its only operating points are
`threshold > 1` (coverage 0) and `threshold = 1` (all flagged decisions). There are no
intermediate operating points.

**Rendering rule:** because only evaluated thresholds exist, the figures draw the operating
points as **markers and do not connect them**. A connecting line or staircase would imply
precision values at coverage levels that were never evaluated. The former `stepPath()`
helper was removed for this reason; the intent is documented in a comment in
`scripts/make_figures.py`.

## Axis and annotation decisions

- **Original risk–coverage** uses a **full 0–100% precision axis** plus a labelled inset
  zoom of the **90–100%** region, where all in-distribution operating points sit. The axis
  is not truncated.
- **Reference targets (99.0% / 99.5%)** are compact, right-aligned annotations inside the
  plot. No right margin is reserved for them (`margin.right` stays at the default 100 px).
- The "markers = evaluated threshold operating points · retrospective/oracle selection"
  note lives in the **subtitle/header**, not as floating text inside the plot.
- **Frozen-policy** figure has an increased left gutter so the model names (including
  "DeepSeek Flash") are fully visible; font sizes are unchanged.
- **Score-calibration** keeps the actual-data rendering (circles = original, squares = OOD)
  and drops the 20 per-point `n=` labels. Bin sample sizes are still shown, in a single
  footer line, so the information remains available without cluttering the score/rate
  relationship.
- **Latency–cost** keeps its design; the x-axis extends to 3,000 ms so the OOD DeepSeek
  point (≈2,579 ms) is inside the plot rather than clipped.
- **AUROC** figure is unchanged. Branding (`SCARIF LABS · RESEARCH`) is unchanged.

## Layout audit

`scripts/check_figures.mjs` estimates text bounding boxes from each SVG and reports
off-canvas text, near-edge text, and text–text overlaps. It should report **0 issues** for
all six figures.

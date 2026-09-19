# Figures

Publication figures for the benchmark, generated **only** from canonical JSON artifacts.
No model calls and no data changes.

```bash
python scripts/make_figures.py        # writes seven PNGs and SVGs
```

Outputs (7):
- `auroc-comparison.svg`: Grouped horizontal bar chart comparing ID vs OOD AUROC.
- `risk-coverage.svg`: Side-by-side precision-vs-coverage panels (ID and OOD).
- `frozen-policy-transfer.svg`: Stacked bar chart showing safe vs unsafe auto-merges on OOD.
- `ecosystem-auroc.svg`: JEV AUROC broken down by ecosystem.
- `score-calibration.svg`: Calibration error deviation per score bin.
- `decision-agreement.svg`: Pairwise decision agreement heatmap between the three systems.
- `latency-cost.svg`: Side-by-side bar charts for mean latency and cost per 1k decisions.

## Design Rules
The figures are generated using a consolidated `matplotlib` pipeline that adheres to clean visualization principles:
- **Semantic Palette**: JEV = blue, DeepSeek = orange, Static = slate, Safe = green, Unsafe = red.
- **Consistency**: Filled elements represent in-distribution (ID) data, outlined elements represent OOD data.
- **Data-ink ratio**: Grid lines are lightened, chartjunk removed, and direct labeling is preferred over legends where possible.

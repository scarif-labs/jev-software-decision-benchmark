"""
Figure generation for the JEV auto-merge evaluation report.

Produces six figures comparing JEV against a DeepSeek Flash baseline and a
static-rules baseline, on an original in-distribution benchmark and an
out-of-distribution (OOD) validation set:

    1. original-risk-coverage   - precision/coverage trade-off, original benchmark
    2. ood-risk-coverage        - precision/coverage trade-off, OOD validation
    3. auc-comparison           - ranking quality (AUROC), original vs OOD
    4. score-calibration        - predicted score vs observed outcome rate
    5. latency-cost             - operational cost/latency, original vs OOD
    6. frozen-policy-comparison - precision/coverage/unsafe-merges when a
                                   threshold frozen on the original split is
                                   applied unchanged to OOD data

Design language shared across all six figures:
    - filled circle  = original / in-distribution benchmark
    - hollow square  = OOD validation (same series color, unfilled)
    - JEV = C_JEV, DeepSeek Flash = C_DEEPSEEK, Static rules = C_RULES (fixed
      throughout; never reassigned per-figure)
    - percentages, currency and counts are formatted with the shared
      formatters below so every figure reads the same way
"""

import json
import math
import os
from typing import Callable, Optional, Sequence

import numpy as np
import matplotlib.pyplot as plt
import matplotlib.patheffects as path_effects
from matplotlib.lines import Line2D
from matplotlib.ticker import FuncFormatter

# ----------------------------------------------------------------------------
# CONFIGURATION & THEME
# ----------------------------------------------------------------------------
OUT_DIR = "analysis/figures"
os.makedirs(OUT_DIR, exist_ok=True)

FIGURE_DPI = 200  # crisp PNGs; SVGs are exported alongside and are resolution-independent

# Semantic colors. Each model keeps one fixed color everywhere it appears;
# the original-vs-OOD distinction is carried by marker fill (filled vs
# hollow), never by introducing a second color for the same series.
C_JEV = "#0284c7"
C_DEEPSEEK = "#ea580c"
C_RULES = "#64748b"
C_TEXT = "#0f172a"
C_SUBTEXT = "#475569"
C_AXIS = "#94a3b8"
C_GRID = "#f1f5f9"
C_GUIDE = "#ef4444"  # reserved for the target-precision threshold only

FOOTER_TEXT = "S C A R I F   L A B S  ·  R E S E A R C H"
TEXT_HALO = [path_effects.withStroke(linewidth=3, foreground="white")]

plt.rcParams.update({
    "font.family": "sans-serif",
    "font.sans-serif": ["Arial", "Helvetica", "DejaVu Sans"],
    "text.color": C_TEXT,
    "axes.labelcolor": C_TEXT,
    "axes.edgecolor": C_AXIS,
    "axes.linewidth": 1.5,
    "axes.spines.top": False,
    "axes.spines.right": False,
    "xtick.color": C_SUBTEXT,
    "ytick.color": C_SUBTEXT,
    "xtick.major.size": 6,
    "ytick.major.size": 6,
    "xtick.major.width": 1.5,
    "ytick.major.width": 1.5,
    "xtick.labelsize": 14,
    "ytick.labelsize": 14,
    "axes.labelsize": 16,
    "axes.titlesize": 18,
    "axes.titleweight": "bold",
    "figure.titlesize": 24,
    "figure.titleweight": "bold",
    "grid.color": C_GRID,
    "grid.linewidth": 1.5,
    "legend.fontsize": 14,
    "legend.frameon": False,
    "figure.figsize": (16, 9),
    "figure.facecolor": "#ffffff",
    "axes.facecolor": "#ffffff",
    "savefig.bbox": "tight",
    "savefig.pad_inches": 0.3,
})


# ----------------------------------------------------------------------------
# FORMATTING UTILITIES
# (centralized so every figure renders numbers the same way; see section 9
#  of the design brief - no chart should show "23.50%" next to another
#  chart's "23.5%")
# ----------------------------------------------------------------------------
def format_percent(x: float, decimals: int = 1) -> str:
    """0.235 -> '23.5%'; 0.20 -> '20%' (trailing .0 dropped); 1.0 -> '100%'."""
    val = round(x * 100, decimals)
    s = f"{val:.{decimals}f}"
    if decimals > 0:
        whole, frac = s.split(".")
        if int(frac) == 0:
            s = whole
    return f"{s}%"


def format_cost(x: float) -> str:
    """Adaptive-precision USD-per-1k-cases label: enough decimals to
    distinguish small costs, but trailing zeros are trimmed so $0.310
    (from a naive fixed-precision format) reads as $0.31."""
    if x == 0:
        return "$0"
    decimals = 4 if abs(x) < 0.01 else 3 if abs(x) < 1 else 2
    s = f"{x:,.{decimals}f}"
    int_part, frac_part = s.split(".")
    frac_part = frac_part.rstrip("0")
    s = int_part if frac_part == "" else f"{int_part}.{frac_part}"
    return f"${s}"


def format_count(x: float) -> str:
    return f"{int(round(x)):,}"


def nice_upper_bound(value: float, pad_frac: float = 0.18) -> float:
    """Round a data-driven max up to a visually clean axis ceiling, so a
    hardcoded xmax can never silently clip real data (section 23: edge cases)."""
    padded = max(value, 1e-9) * (1 + pad_frac)
    magnitude = 10 ** math.floor(math.log10(padded))
    step = magnitude / 2 if padded / magnitude < 5 else magnitude
    return math.ceil(padded / step) * step


def declutter_1d(values: Sequence[float], min_gap: float) -> list:
    """Nudge a small set of 1-D positions apart just enough that labels
    placed at them won't overlap, preserving order and total displacement.
    Used both for end-of-line labels (vertical) and paired value labels
    (horizontal) - see plot_dumbbell_row."""
    order = sorted(range(len(values)), key=lambda i: values[i])
    adjusted = [values[i] for i in order]
    for _ in range(50):
        moved = False
        for i in range(1, len(adjusted)):
            gap = adjusted[i] - adjusted[i - 1]
            if gap < min_gap:
                shift = (min_gap - gap) / 2
                adjusted[i - 1] -= shift
                adjusted[i] += shift
                moved = True
        if not moved:
            break
    result = [0.0] * len(values)
    for rank, i in enumerate(order):
        result[i] = adjusted[rank]
    return result


PCT_FORMATTER = FuncFormatter(lambda x, _pos: format_percent(x, 0))


# ----------------------------------------------------------------------------
# LAYOUT & STYLE UTILITIES
# ----------------------------------------------------------------------------
def load_json(path: str) -> dict:
    try:
        with open(path) as f:
            return json.load(f)
    except FileNotFoundError as exc:
        raise FileNotFoundError(
            f"Required input file not found: '{path}'. This script expects it "
            f"relative to the current working directory."
        ) from exc


def add_header(fig, title: str, subtitle: str) -> None:
    """Draws the title/subtitle only. Layout margins are set per-figure via
    fig.subplots_adjust(...) so a multi-panel figure can use different
    margins than a single-axes one without the two responsibilities
    fighting each other."""
    fig.text(0.02, 0.98, title, fontsize=28, fontweight="bold", color=C_TEXT, ha="left", va="top")
    fig.text(0.02, 0.93, subtitle, fontsize=17, color=C_SUBTEXT, ha="left", va="top")


def add_footer(fig) -> None:
    fig.text(0.98, 0.02, FOOTER_TEXT, fontsize=14, fontweight="bold", color=C_AXIS,
              ha="right", va="bottom")


def add_condition_key(ax, loc: str = "lower right", color: str = C_SUBTEXT):
    """The one legend every multi-condition figure needs: what filled vs.
    hollow markers mean. Reused rather than re-derived per figure.

    Registers itself with ax.add_artist so it survives a second ax.legend()
    call later on the same axes (e.g. the calibration chart's sample-size
    legend) - without this, matplotlib silently drops whichever legend was
    added first."""
    handles = [
        Line2D([0], [0], marker="o", color="none", markerfacecolor=color,
               markeredgecolor=color, markersize=11, label="Original benchmark"),
        Line2D([0], [0], marker="s", color="none", markerfacecolor="white",
               markeredgecolor=color, markeredgewidth=2, markersize=11, label="OOD validation"),
    ]
    legend = ax.legend(handles=handles, loc=loc, frameon=False, fontsize=13, handletextpad=0.6)
    ax.add_artist(legend)
    return legend


def style_grid(ax, axis: str = "both") -> None:
    ax.grid(True, axis=axis, linestyle="-", color=C_GRID, linewidth=1.5, zorder=0)


def export_figure(fig, name: str) -> None:
    fig.savefig(os.path.join(OUT_DIR, f"{name}.png"), dpi=FIGURE_DPI)
    fig.savefig(os.path.join(OUT_DIR, f"{name}.svg"))
    plt.close(fig)


# ----------------------------------------------------------------------------
# SHARED PLOTTING PRIMITIVES
# ----------------------------------------------------------------------------
def plot_risk_coverage_panel(
    ax,
    series: list,
    xlim: tuple,
    ylim: tuple,
    target: Optional[tuple] = None,
    target_label: str = "",
    label_fontsize: float = 15,
) -> None:
    """One precision-vs-coverage panel: step line + markers per series, an
    optional target band, and direct end-of-line labels (no legend box - a
    boxed legend has no reliably empty corner to sit in on this chart, since
    every series converges toward the same top-right region)."""
    style_grid(ax)

    label_targets = []  # (y, x, text, color) for the end-of-line label pass
    for s in series:
        pts = sorted(s["pts"], key=lambda p: p["coverage"])
        if not pts:
            continue
        cov = [p["coverage"] for p in pts]
        prec = [p["precision"] for p in pts]

        is_continuous = s.get("continuous", True)
        if is_continuous and len(cov) > 1:
            ax.plot(cov, prec, color=s["color"], drawstyle="steps-post", alpha=0.35,
                     linewidth=2, zorder=2)

        is_original = s.get("type", "orig") == "orig"
        marker = "o" if is_original else "s"
        facecolor = s["color"] if is_original else "none"
        ax.scatter(cov, prec, color=s["color"], marker=marker, facecolors=facecolor,
                    edgecolors=s["color"], s=90, linewidths=2.2, zorder=3)

        label_targets.append((prec[-1], cov[-1], s["label"], s["color"]))

    ax.set_xlim(*xlim)
    ax.set_ylim(*ylim)
    ax.set_xlabel("Coverage")
    ax.set_ylabel("Precision")
    ax.xaxis.set_major_formatter(PCT_FORMATTER)
    ax.yaxis.set_major_formatter(PCT_FORMATTER)

    if target is not None:
        lo, hi = target
        ax.axhspan(lo, hi, color=C_GUIDE, alpha=0.1, zorder=1)
        ax.axhline(lo, color=C_GUIDE, linestyle="--", alpha=0.6, linewidth=1.5, zorder=1)
        if target_label:
            ax.text(xlim[1] - (xlim[1] - xlim[0]) * 0.01, lo + (ylim[1] - lo) * 0.35,
                     target_label, color=C_GUIDE, fontsize=13, va="bottom", ha="right",
                     fontweight="bold")

    if label_targets:
        y_range = ylim[1] - ylim[0]
        adj_y = declutter_1d([t[0] for t in label_targets], min_gap=y_range * 0.07)
        x_pad = (xlim[1] - xlim[0]) * 0.012
        for y_final, (_, x_raw, text, color) in zip(adj_y, label_targets):
            ax.text(min(x_raw + x_pad, xlim[1] - x_pad / 2), y_final, text, color=color,
                     fontsize=label_fontsize, fontweight="bold", va="center", ha="left",
                     path_effects=TEXT_HALO, clip_on=False)


def plot_dumbbell_row(
    ax,
    y: float,
    color: str,
    orig_val: float,
    ood_val: float,
    xlim: tuple,
    value_fmt: Callable[[float], str],
    ood_ci: Optional[tuple] = None,
    row_height: float = 1.0,
) -> None:
    """One 'before -> after' row: filled circle (original) connected to a
    hollow square (OOD) by a line, with value labels placed to avoid both
    the axis edges and each other. Shared by the AUROC comparison and the
    frozen-policy comparison so both use the same before/after grammar."""
    x_range = xlim[1] - xlim[0]

    ax.plot([orig_val, ood_val], [y, y], color=color, linewidth=4, alpha=0.3, zorder=1)
    ax.scatter(orig_val, y, color=color, s=190, zorder=3)
    ax.scatter(ood_val, y, facecolors="white", edgecolors=color, marker="s", s=190,
                linewidths=2.8, zorder=3)
    if ood_ci is not None:
        lo, hi = ood_ci
        ax.errorbar(ood_val, y, xerr=[[max(ood_val - lo, 0)], [max(hi - ood_val, 0)]],
                     fmt="none", ecolor=color, elinewidth=2.6, capsize=4, zorder=2)

    text_orig, text_ood = value_fmt(orig_val), value_fmt(ood_val)
    gap = abs(ood_val - orig_val)
    collide_threshold = x_range * 0.10
    edge_margin = x_range * 0.03
    offset = x_range * 0.035

    if gap < collide_threshold:
        # Values are too close together for side-by-side labels: stack them
        # above/below the row instead of letting them overlap horizontally.
        mid_x = (orig_val + ood_val) / 2
        mid_x = min(max(mid_x, xlim[0] + edge_margin), xlim[1] - edge_margin)
        ax.text(mid_x, y + row_height * 0.30, text_orig, ha="center", va="bottom",
                 fontsize=12.5, color=C_SUBTEXT, path_effects=TEXT_HALO, clip_on=False)
        ax.text(mid_x, y - row_height * 0.30, text_ood, ha="center", va="top",
                 fontsize=13.5, fontweight="bold", color=color, path_effects=TEXT_HALO,
                 clip_on=False)
    else:
        for val, text, size, weight, col, other in (
            (orig_val, text_orig, 12.5, "normal", C_SUBTEXT, ood_val),
            (ood_val, text_ood, 13.5, "bold", color, orig_val),
        ):
            if val >= xlim[1] - edge_margin:
                ha, tx = "right", val - offset
            elif val <= xlim[0] + edge_margin:
                ha, tx = "left", val + offset
            elif val < other:
                ha, tx = "right", val - offset
            else:
                ha, tx = "left", val + offset
            ax.text(tx, y, text, ha=ha, va="center", fontsize=size, fontweight=weight,
                     color=col, path_effects=TEXT_HALO, clip_on=False)


# ----------------------------------------------------------------------------
# LOAD DATA
# ----------------------------------------------------------------------------
table = load_json("report/table.json")
forensics = load_json("analysis/decision-forensics.json")
ood = load_json("analysis/ood-validation.json")

# Sample sizes are read from the data when present and fall back to the
# figures' previous hardcoded values otherwise, so nothing changes visually
# until the source files actually carry these fields - at which point every
# subtitle that cites n stays correct automatically instead of drifting out
# of sync (they were previously typed as literal strings in three places).
ORIG_N = forensics.get("meta", {}).get("cases") or forensics.get("n", 1102)
OOD_N = ood.get("meta", {}).get("cases") or ood.get("n", 185)


def find_row(rows: list, predicate: Callable[[dict], bool], context: str) -> dict:
    for row in rows:
        if predicate(row):
            return row
    raise ValueError(f"No matching row found for {context}. Check the input JSON.")


# ----------------------------------------------------------------------------
# FIGURE 1 & 2: Risk / Coverage
# ----------------------------------------------------------------------------
def make_fig_original_risk_coverage() -> None:
    series = [
        {"label": "JEV", "color": C_JEV, "pts": forensics["jevRiskCoverageCurve"]},
        {"label": "DeepSeek Flash", "color": C_DEEPSEEK, "pts": forensics["deepseekRiskCoverageCurve"]},
        {"label": "Static rules", "color": C_RULES, "pts": forensics["staticRuleRiskCoverageCurve"],
         "continuous": False},
    ]
    precisions = [p["precision"] for s in series for p in s["pts"]]
    covs = [p["coverage"] for s in series for p in s["pts"]]

    fig, ax = plt.subplots()
    add_header(fig, "Original benchmark: risk/coverage",
               f"Precision-coverage trade-off (n={format_count(ORIG_N)}) · Retrospective/oracle selection")
    fig.subplots_adjust(top=0.85, left=0.08, right=0.95, bottom=0.1)

    xmax = nice_upper_bound(max(covs), pad_frac=0.08)
    ymin = max(0.0, min(precisions) - 0.02)
    plot_risk_coverage_panel(ax, series, xlim=(0, xmax), ylim=(ymin, 1.006),
                              target=(0.99, 1.0), target_label="99.0-100% target")

    add_footer(fig)
    export_figure(fig, "original-risk-coverage")


def make_fig_ood_risk_coverage() -> None:
    series = [
        {"label": "JEV", "color": C_JEV, "pts": ood["curves"]["riskCoverage"]["jev"], "type": "ood"},
        {"label": "DeepSeek Flash", "color": C_DEEPSEEK, "pts": ood["curves"]["riskCoverage"]["deepseek"],
         "type": "ood"},
        {"label": "Static rules", "color": C_RULES, "pts": ood["curves"]["riskCoverage"]["rules"],
         "type": "ood", "continuous": False},
    ]
    precisions = [p["precision"] for s in series for p in s["pts"]]
    covs = [p["coverage"] for s in series for p in s["pts"]]

    fig, ax = plt.subplots()
    add_header(fig, "OOD validation: risk/coverage",
               f"Independent OOD validation (n={format_count(OOD_N)}) · Retrospective/oracle selection")
    fig.subplots_adjust(top=0.85, left=0.08, right=0.95, bottom=0.1)

    # Same y-scaling logic as the original-benchmark panel above, so the two
    # figures are directly comparable rather than each choosing its own
    # incidental range (the previous version zoomed one and not the other).
    xmax = nice_upper_bound(max(covs), pad_frac=0.08)
    ymin = max(0.0, min(precisions) - 0.02)
    plot_risk_coverage_panel(ax, series, xlim=(0, xmax), ylim=(ymin, 1.006),
                              target=(0.99, 1.0), target_label="99.0-100% target")

    add_footer(fig)
    export_figure(fig, "ood-risk-coverage")


# ----------------------------------------------------------------------------
# FIGURE 3: AUROC - ranking quality, original vs OOD
# ----------------------------------------------------------------------------
def make_fig_auroc() -> None:
    models = [
        {"name": "Static rules", "color": C_RULES,
         "orig": forensics["ranking"]["static_rule_binary"]["auroc"],
         "ood": ood["ranking"]["staticRule"]["auroc"]},
        {"name": "DeepSeek Flash", "color": C_DEEPSEEK,
         "orig": forensics["ranking"]["deepseek_autoMergeScore_gated"]["auroc"],
         "ood": ood["ranking"]["deepseek_gated"]["auroc"]},
        {"name": "JEV", "color": C_JEV,
         "orig": forensics["ranking"]["jev_autoMergeScore"]["auroc"],
         "ood": ood["ranking"]["jev_pAutoMerge"]["auroc"],
         "ood_ci": (ood["bootstrap"]["jevAuroc"]["lo"], ood["bootstrap"]["jevAuroc"]["hi"])},
    ]

    all_vals = [m["orig"] for m in models] + [m["ood"] for m in models]
    for m in models:
        if "ood_ci" in m:
            all_vals.extend(m["ood_ci"])
    xlim = (min(0.5, min(all_vals)) - 0.05, max(all_vals) + 0.05)

    # A title is only earned if the OOD ranking is unambiguous; otherwise
    # fall back to a precise, non-speculative title.
    ood_vals = [m["ood"] for m in models]
    best_idx = max(range(len(models)), key=lambda i: ood_vals[i])
    runner_up = max(v for i, v in enumerate(ood_vals) if i != best_idx)
    if ood_vals[best_idx] - runner_up >= 0.03:
        title = f"{models[best_idx]['name']} keeps the strongest ranking quality out-of-distribution"
    else:
        title = "Ranking quality: original benchmark vs OOD"

    fig, ax = plt.subplots()
    add_header(fig, title,
               f"AUROC, positive class = control/safe · original n={format_count(ORIG_N)}, "
               f"OOD n={format_count(OOD_N)}")
    fig.subplots_adjust(top=0.83, left=0.14, right=0.95, bottom=0.12)

    style_grid(ax, axis="x")
    y_pos = np.arange(len(models))
    for j, m in enumerate(models):
        plot_dumbbell_row(ax, y_pos[j], m["color"], m["orig"], m["ood"], xlim,
                           value_fmt=lambda v: f"{v:.3f}", ood_ci=m.get("ood_ci"))

    ax.axvline(0.5, color=C_AXIS, linestyle=":", linewidth=2, zorder=1)
    ax.text(0.5, max(y_pos) + 0.6, "chance = 0.5", ha="center", va="bottom", fontsize=13,
             color=C_SUBTEXT)

    ax.set_xlim(*xlim)
    ax.set_ylim(min(y_pos) - 0.8, max(y_pos) + 0.9)
    ax.set_yticks(y_pos)
    ax.set_yticklabels([m["name"] for m in models], fontsize=16, fontweight="bold")
    ax.set_xlabel("AUROC")
    add_condition_key(ax, loc="lower right")

    add_footer(fig)
    export_figure(fig, "auc-comparison")


# ----------------------------------------------------------------------------
# FIGURE 4: Score calibration
# ----------------------------------------------------------------------------
def bubble_area(n: int, scale: float = 3.0, min_area: float = 20.0, max_area: float = 900.0) -> float:
    """Shared by the real markers and the size-legend swatches, so the
    legend always matches what's actually on the chart, including when the
    cap (added for robustness against very large bins) kicks in."""
    return min(max(n * scale, min_area), max_area)


def make_fig_score_calibration() -> None:
    orig_bins = forensics["calibrationBins"]
    ood_bins = ood["calibration"]
    centers = [0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95]

    fig, ax = plt.subplots()
    add_header(fig, "Score calibration",
               "Observed control rate by JEV p(AUTO_MERGE) score bin · bubble size = n")
    fig.subplots_adjust(top=0.85, left=0.08, right=0.95, bottom=0.1)

    ax.plot([0, 1], [0, 1], color=C_AXIS, linestyle="--", zorder=1)
    ax.text(0.99, 1.01, "Ideal calibration", ha="right", va="bottom", fontsize=14, color=C_SUBTEXT)

    for c, ob, od in zip(centers, orig_bins, ood_bins):
        if ob and ob["n"] > 0:
            ax.scatter(c, ob["controlRate"], color=C_JEV, marker="o", s=bubble_area(ob["n"]), zorder=3)
        if od and od["n"] > 0:
            # Hollow marker in the SAME model color as the filled one, so the
            # original-vs-OOD encoding matches every other figure (previously
            # this chart alone used an unrelated third color for OOD points).
            ax.scatter(c, od["controlRate"], facecolors="white", edgecolors=C_JEV, marker="s",
                        s=bubble_area(od["n"]), linewidths=2.5, zorder=3)

    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.set_xlabel("JEV p(AUTO_MERGE)")
    ax.set_ylabel("Observed control rate")
    ax.xaxis.set_major_formatter(PCT_FORMATTER)
    ax.yaxis.set_major_formatter(PCT_FORMATTER)
    style_grid(ax)
    add_condition_key(ax, loc="lower right", color=C_JEV)

    size_benchmarks = [10, 100, 500]
    size_handles = [
        plt.scatter([], [], s=bubble_area(n), color=C_SUBTEXT, alpha=0.6, edgecolors="none")
        for n in size_benchmarks
    ]
    size_legend = ax.legend(
        size_handles, [f"n = {n}" for n in size_benchmarks], loc="upper left", title="Sample size",
        title_fontsize=12, fontsize=12, labelspacing=1.2, borderpad=1, frameon=True,
        facecolor="white", edgecolor="none",
    )
    ax.add_artist(size_legend)

    add_footer(fig)
    export_figure(fig, "score-calibration")


# ----------------------------------------------------------------------------
# FIGURE 5: Latency vs cost
# ----------------------------------------------------------------------------
def make_fig_latency_cost() -> None:
    def row_99(m):
        return find_row(table["rows"], lambda r: m in r["model"] and r["targetPrecision"] == 0.99,
                         context=f"model containing '{m}' at targetPrecision=0.99 in table.rows")

    jev_orig, ds_orig = row_99("Jev"), row_99("deepseek")
    jev_ood, ds_ood = ood["operational"]["jev"], ood["operational"]["deepseek"]

    # Static rules have no LLM call in the loop, so latency and cost are
    # taken as zero by definition rather than measured - flagged explicitly
    # rather than silently pulled from a lookup that would never find them.
    RULES_LATENCY_MS, RULES_COST_PER_1K = 0.0, 0.0

    pts = [
        {"label": "JEV", "cond": "Original", "x": jev_orig["meanLatencyMs"], "y": jev_orig["costUsdPer1k"],
         "color": C_JEV, "type": "orig", "align": "left", "ox": 40, "oy": -20},
        {"label": "DeepSeek Flash", "cond": "Original", "x": ds_orig["meanLatencyMs"],
         "y": ds_orig["costUsdPer1k"], "color": C_DEEPSEEK, "type": "orig", "align": "right", "ox": -40,
         "oy": -20},
        {"label": "JEV", "cond": "OOD", "x": jev_ood["latencyMeanMs"], "y": jev_ood["costPer1kUsd"],
         "color": C_JEV, "type": "ood", "align": "left", "ox": 40, "oy": 30},
        {"label": "DeepSeek Flash", "cond": "OOD", "x": ds_ood["latencyMeanMs"],
         "y": ds_ood["costPer1kUsd"], "color": C_DEEPSEEK, "type": "ood", "align": "right", "ox": -40,
         "oy": 30},
        {"label": "Static rules", "cond": "Original", "x": RULES_LATENCY_MS, "y": RULES_COST_PER_1K,
         "color": C_RULES, "type": "orig", "align": "left", "ox": 18, "oy": 22},
    ]

    x_max = nice_upper_bound(max(p["x"] for p in pts), pad_frac=0.15)
    y_max = nice_upper_bound(max(p["y"] for p in pts), pad_frac=0.15)
    # A small negative margin keeps the (0, 0) static-rules point from
    # sitting exactly on top of the axis spines.
    x_pad, y_pad = x_max * 0.02, y_max * 0.02

    fig, ax = plt.subplots()
    add_header(fig, "Latency-cost profile", "Observed benchmark cost and latency")
    fig.subplots_adjust(top=0.85, left=0.08, right=0.95, bottom=0.1)
    style_grid(ax)

    for p in pts:
        marker = "o" if p["type"] == "orig" else "s"
        facecolor = p["color"] if p["type"] == "orig" else "white"
        ax.scatter(p["x"], p["y"], color=p["color"], marker=marker, facecolors=facecolor,
                    edgecolors=p["color"], s=200, linewidths=3, zorder=3)
        txt = f"{p['label']} ({p['cond']})\n{p['x']:.0f} ms / {format_cost(p['y'])} per 1k"
        ax.annotate(txt, (p["x"], p["y"]), xytext=(p["ox"], p["oy"]), textcoords="offset points",
                     color=C_TEXT, fontsize=14, fontweight="bold", ha=p["align"], va="center",
                     path_effects=TEXT_HALO)

    # Directional arrows, original -> OOD, for the two LLM-based systems.
    for orig_label, color in (("JEV", C_JEV), ("DeepSeek Flash", C_DEEPSEEK)):
        p_orig = next(p for p in pts if p["label"] == orig_label and p["cond"] == "Original")
        p_ood = next(p for p in pts if p["label"] == orig_label and p["cond"] == "OOD")
        ax.annotate("", xy=(p_ood["x"], p_ood["y"]), xytext=(p_orig["x"], p_orig["y"]),
                     arrowprops=dict(arrowstyle="->", color=C_AXIS, linewidth=2, shrinkA=15, shrinkB=15))

    ax.set_xlim(-x_pad, x_max)
    ax.set_ylim(-y_pad, y_max)
    ax.set_xlabel("Mean latency (ms)")
    ax.set_ylabel("Cost per 1,000 cases (USD)")
    ax.yaxis.set_major_formatter(FuncFormatter(lambda y, _pos: f"${y:.2f}"))
    add_condition_key(ax, loc="upper right")

    add_footer(fig)
    export_figure(fig, "latency-cost")


# ----------------------------------------------------------------------------
# FIGURE 6: Frozen policy transfer
# ----------------------------------------------------------------------------
def make_fig_frozen_policy() -> None:
    def get_orig(m):
        return find_row(table["fixedThreshold"], lambda x: m in x["model"] and x["split"] == "repo-disjoint",
                          context=f"model containing '{m}' on the repo-disjoint split in table.fixedThreshold")

    def get_frozen(prefix):
        return find_row(ood["frozenPolicies"], lambda f: f["policy"].startswith(prefix),
                          context=f"frozen policy starting with '{prefix}' in ood.frozenPolicies")

    models = [
        {"name": "Static rules", "color": C_RULES, "orig": get_orig("Static"), "ood": get_frozen("Static")},
        {"name": "DeepSeek Flash", "color": C_DEEPSEEK, "orig": get_orig("deepseek"), "ood": get_frozen("DeepSeek")},
        {"name": "JEV", "color": C_JEV, "orig": get_orig("Jev"), "ood": get_frozen("JEV")},
    ]

    metrics = [
        {"title": "Precision", "field": "precision", "fmt": lambda v: format_percent(v),
         "ax_fmt": PCT_FORMATTER, "pad_frac": 0.0, "cap_at_one": True},
        {"title": "Coverage", "field": "coverage", "fmt": lambda v: format_percent(v),
         "ax_fmt": PCT_FORMATTER, "pad_frac": 0.20, "cap_at_one": False},
        {"title": "Unsafe merges", "field": "unsafe", "fmt": lambda v: format_count(v),
         "ax_fmt": FuncFormatter(lambda x, _pos: format_count(x)), "pad_frac": 0.20, "cap_at_one": False},
    ]
    # Axis ceilings are computed from the data (with precision capped at its
    # natural 100% bound) rather than hardcoded, so a future data point
    # outside today's observed range is never silently clipped off-chart.
    for m in metrics:
        vals = [mod["orig"][m["field"]] for mod in models] + [mod["ood"][m["field"]] for mod in models]
        m["xmax"] = 1.0 if m["cap_at_one"] else nice_upper_bound(max(vals), pad_frac=m["pad_frac"])

    fig, axes = plt.subplots(1, 3, figsize=(16, 9))
    add_header(fig, "Frozen policy transfer: original vs OOD",
               "Threshold frozen on the original repo-disjoint development split, applied unchanged to OOD")
    fig.subplots_adjust(top=0.78, bottom=0.2, wspace=0.3, left=0.15, right=0.95)

    y_pos = np.arange(len(models))
    for i, (ax, m) in enumerate(zip(axes, metrics)):
        ax.set_title(m["title"], fontsize=18, fontweight="bold", pad=20)
        style_grid(ax, axis="x")

        for j, mod in enumerate(models):
            plot_dumbbell_row(ax, y_pos[j], mod["color"], mod["orig"][m["field"]], mod["ood"][m["field"]],
                               xlim=(0, m["xmax"]), value_fmt=m["fmt"])

        ax.set_xlim(0, m["xmax"])
        ax.xaxis.set_major_formatter(m["ax_fmt"])
        if i == 0:
            ax.set_yticks(y_pos)
            ax.set_yticklabels([mod["name"] for mod in models], fontsize=16, fontweight="bold")
        else:
            ax.set_yticks([])
        ax.set_ylim(min(y_pos) - 0.6, max(y_pos) + 0.6)
        ax.spines["left"].set_visible(i == 0)
        if i > 0:
            ax.tick_params(left=False)

    add_condition_key(fig.axes[-1], loc="lower right")

    add_footer(fig)
    export_figure(fig, "frozen-policy-comparison")


if __name__ == "__main__":
    make_fig_original_risk_coverage()
    make_fig_ood_risk_coverage()
    make_fig_auroc()
    make_fig_score_calibration()
    make_fig_latency_cost()
    make_fig_frozen_policy()
    print("Python figures generated successfully.")
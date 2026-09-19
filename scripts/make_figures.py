#!/usr/bin/env python3
"""
Figure generation for the JEV dependency-update benchmark.

Produces seven figures plus a contact sheet:
    1. auroc-comparison       — AUROC grouped bar, ID vs OOD
    2. risk-coverage          — precision/coverage, ID and OOD side-by-side
    3. frozen-policy-transfer — stacked bar: safe + unsafe auto-merges on OOD
    4. ecosystem-auroc        — JEV AUROC by ecosystem on OOD
    5. score-calibration      — calibration error deviation from ideal
    6. decision-agreement     — pairwise agreement heatmap
    7. latency-cost           — bar comparison of latency and cost

Design principles:
    - Tufte: maximize data-ink ratio, no chartjunk
    - Consistent semantic colors: JEV = blue, DeepSeek = orange, Static = slate
    - Filled bars = in-distribution, outlined = OOD
    - Direct labeling over legends where possible
    - Correct chart types: bars for categories, lines for continuous curves

Usage:
    python scripts/make_figures.py
"""

import json
import math
import os

import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patheffects as path_effects
from matplotlib.patches import Patch
from matplotlib.ticker import FuncFormatter

try:
    # adjustText provides robust label de-confliction; falls back to a
    # simple manual algorithm if the library isn't installed.
    from adjustText import adjust_text
    _HAS_ADJUST_TEXT = True
except ImportError:
    _HAS_ADJUST_TEXT = False

# ============================================================================
# CONFIGURATION
# ============================================================================

OUT_DIR = "analysis/figures"
os.makedirs(OUT_DIR, exist_ok=True)
DPI = 200

# Semantic palette — each model keeps one colour everywhere.
C_JEV      = "#0284c7"      # sky-600
C_DEEPSEEK = "#ea580c"      # orange-600
C_RULES    = "#64748b"      # slate-500
C_SAFE     = "#16a34a"      # green-600
C_UNSAFE   = "#dc2626"      # red-600
C_TEXT     = "#0f172a"       # slate-900
C_SUBTEXT  = "#475569"      # slate-600
C_AXIS     = "#94a3b8"      # slate-400
C_GRID     = "#f1f5f9"      # slate-100
C_GUIDE    = "#ef4444"      # red-500

FOOTER_TEXT = "S C A R I F   L A B S  ·  R E S E A R C H"
HALO = [path_effects.withStroke(linewidth=3, foreground="white")]

plt.rcParams.update({
    "font.family":        "sans-serif",
    "font.sans-serif":    ["Inter", "Helvetica Neue", "Arial", "DejaVu Sans"],
    "text.color":         C_TEXT,
    "axes.labelcolor":    C_TEXT,
    "axes.edgecolor":     C_AXIS,
    "axes.linewidth":     1.2,
    "axes.spines.top":    False,
    "axes.spines.right":  False,
    "xtick.color":        C_SUBTEXT,
    "ytick.color":        C_SUBTEXT,
    "xtick.major.size":   5,
    "ytick.major.size":   5,
    "xtick.major.width":  1.2,
    "ytick.major.width":  1.2,
    "xtick.labelsize":    12,
    "ytick.labelsize":    12,
    "axes.labelsize":     14,
    "axes.titlesize":     16,
    "axes.titleweight":   "bold",
    "grid.color":         C_GRID,
    "grid.linewidth":     1,
    "legend.fontsize":    12,
    "legend.frameon":     False,
    "figure.facecolor":   "#ffffff",
    "axes.facecolor":     "#ffffff",
    "savefig.bbox":       "tight",
    "savefig.pad_inches": 0.3,
})


# ============================================================================
# UTILITIES
# ============================================================================

def load_json(path):
    with open(path) as f:
        return json.load(f)


def fmt_pct(x, d=1):
    """0.504 → '50.4%'; 1.0 → '100%'."""
    val = round(x * 100, d)
    s = f"{val:.{d}f}"
    if d > 0:
        whole, frac = s.split(".")
        if all(c == "0" for c in frac):
            s = whole
    return f"{s}%"


def fmt_cost(x):
    if x == 0:
        return "\\$0"
    d = 4 if abs(x) < 0.01 else 3 if abs(x) < 1 else 2
    s = f"{x:.{d}f}".rstrip("0").rstrip(".")
    return f"\\${s}"


def fmt_count(x):
    return f"{int(round(x)):,}"


def add_header(fig, title, subtitle, *, title_y=0.97, subtitle_y=0.895):
    """Place title + subtitle with enough vertical gap to avoid overlap.

    Default gap = 0.075 normalized units ≈ 0.4" on a 5.5" figure, which
    comfortably separates the 20pt title (with line-height) from the 12pt
    subtitle. Pass lower `subtitle_y` for figures whose title wraps to two
    lines, or raise `title_y` if the figure has very little top headroom.
    """
    fig.text(0.03, title_y, title, fontsize=20, fontweight="bold",
             color=C_TEXT, ha="left", va="top")
    fig.text(0.03, subtitle_y, subtitle, fontsize=12, color=C_SUBTEXT,
             ha="left", va="top")


def add_footer(fig, *, y=0.025):
    """Footer text — placed low but above the figure's bottom edge."""
    fig.text(0.97, y, FOOTER_TEXT, fontsize=10, fontweight="bold",
             color=C_AXIS, ha="right", va="bottom")


def add_grid(ax, axis="both"):
    ax.grid(True, axis=axis, linestyle="-", color=C_GRID,
            linewidth=1, zorder=0)


def save_fig(fig, name):
    fig.savefig(os.path.join(OUT_DIR, f"{name}.png"), dpi=DPI)
    fig.savefig(os.path.join(OUT_DIR, f"{name}.svg"))
    plt.close(fig)
    print(f"  ✓ {name}")


def find_row(rows, pred, ctx=""):
    for r in rows:
        if pred(r):
            return r
    raise ValueError(f"No matching row: {ctx}")


PCT_FMT = FuncFormatter(lambda x, _: fmt_pct(x, 0))


# ============================================================================
# DATA
# ============================================================================

table     = load_json("report/table.json")
forensics = load_json("analysis/decision-forensics.json")
ood       = load_json("analysis/ood-validation.json")

ORIG_N = forensics.get("meta", {}).get("cases", 1102)
OOD_N  = ood.get("meta", {}).get("cases", 185)


# ============================================================================
# CLEANUP OLD FIGURE FILES
# ============================================================================

OLD_FILES = [
    "auc-comparison.svg", "auc-comparison.png",
    "original-risk-coverage.svg", "original-risk-coverage.png",
    "ood-risk-coverage.svg", "ood-risk-coverage.png",
    "frozen-policy-comparison.svg", "frozen-policy-comparison.png",
    "contact_sheet.png",
]


def cleanup():
    for f in OLD_FILES:
        path = os.path.join(OUT_DIR, f)
        if os.path.exists(path):
            os.remove(path)
            print(f"  Removed old: {f}")


# ============================================================================
# FIGURE 1 — AUROC GROUPED BAR
# ============================================================================

def make_auroc():
    """Grouped horizontal bars: ID vs OOD AUROC for every system."""
    models = [
        {"name": "Static rules",  "color": C_RULES,
         "id":  forensics["ranking"]["static_rule_binary"]["auroc"],
         "ood": ood["ranking"]["staticRule"]["auroc"]},
        {"name": "DeepSeek Flash", "color": C_DEEPSEEK,
         "id":  forensics["ranking"]["deepseek_autoMergeScore_gated"]["auroc"],
         "ood": ood["ranking"]["deepseek_gated"]["auroc"]},
        {"name": "JEV",            "color": C_JEV,
         "id":  forensics["ranking"]["jev_autoMergeScore"]["auroc"],
         "ood": ood["ranking"]["jev_pAutoMerge"]["auroc"],
         "ci":  (ood["bootstrap"]["jevAuroc"]["lo"],
                 ood["bootstrap"]["jevAuroc"]["hi"])},
    ]

    fig, ax = plt.subplots(figsize=(12, 5.5))
    add_header(
        fig,
        "Ranking quality degrades under distribution shift",
        f"AUROC · positive class = control (safe to merge) · "
        f"ID n\u2009=\u2009{fmt_count(ORIG_N)}, "
        f"OOD n\u2009=\u2009{fmt_count(OOD_N)}",
    )
    fig.subplots_adjust(top=0.80, left=0.17, right=0.92, bottom=0.14)

    y = np.arange(len(models))
    h = 0.30

    for i, m in enumerate(models):
        # ── ID bar (solid fill) ──────────────────────────────────────────
        ax.barh(y[i] + h / 2 + 0.03, m["id"], h,
                color=m["color"], alpha=0.85, zorder=2)
        # ── OOD bar (outline only) ──────────────────────────────────────
        ax.barh(y[i] - h / 2 - 0.03, m["ood"], h,
                facecolor="white", edgecolor=m["color"],
                linewidth=2.2, zorder=2)

        # Confidence-interval whisker (JEV only) — drawn UNDER the label
        # so the label never visually clashes with the whisker caps.
        if "ci" in m:
            lo, hi = m["ci"]
            ax.errorbar(
                m["ood"], y[i] - h / 2 - 0.03,
                xerr=[[m["ood"] - lo], [hi - m["ood"]]],
                fmt="none", ecolor=m["color"],
                elinewidth=2, capsize=5, zorder=2.5, alpha=0.7,
            )

        # Compute right edge of any CI whisker for label placement
        right_edge = m["ood"]
        if "ci" in m:
            right_edge = m["ci"][1]
        # Place value labels at the whisker's right edge + a small pad,
        # so they never sit on top of the whisker caps or bar outline.
        label_x = max(m["id"], right_edge) + 0.018
        ax.text(label_x, y[i] + h / 2 + 0.03,
                f'{m["id"]:.3f}', va="center", fontsize=12,
                fontweight="bold", color=m["color"], path_effects=HALO)
        ax.text(label_x, y[i] - h / 2 - 0.03,
                f'{m["ood"]:.3f}', va="center", fontsize=12,
                color=m["color"], path_effects=HALO)

    # Chance reference — label sits BELOW the line, near the bottom of the
    # plot, so it never overlaps the top bar or the plot's upper border.
    ax.axvline(0.5, color=C_AXIS, linestyle=":", linewidth=1.8, zorder=1)
    ax.text(0.5, -0.55, "chance", ha="center", va="bottom",
            fontsize=11, color=C_SUBTEXT, fontstyle="italic")

    ax.set_yticks(y)
    ax.set_yticklabels(
        [m["name"] for m in models], fontsize=14, fontweight="bold",
    )
    # Widen right margin slightly so the AUROC value labels always fit.
    ax.set_xlim(0.42, 0.96)
    ax.set_xlabel("AUROC")
    add_grid(ax, axis="x")

    ax.legend(
        handles=[
            Patch(facecolor=C_SUBTEXT, alpha=0.7,
                  label=f"In-distribution (n\u2009=\u2009{fmt_count(ORIG_N)})"),
            Patch(facecolor="white", edgecolor=C_SUBTEXT, linewidth=2,
                  label=f"OOD validation (n\u2009=\u2009{fmt_count(OOD_N)})"),
        ],
        loc="lower right", fontsize=11,
    )

    add_footer(fig)
    save_fig(fig, "auroc-comparison")


# ============================================================================
# FIGURE 2 — RISK-COVERAGE SIDE-BY-SIDE
# ============================================================================

def _rc_panel(ax, series, xlim, ylim, panel_title):
    """One precision-vs-coverage panel with step lines and direct labels.

    End-of-line labels are de-conflicted via `adjustText` when available
    so series whose final coverage values sit close together don't
    visually stack on top of each other. Falls back to a simple
    sort-and-stack algorithm if `adjustText` is not installed.
    """
    add_grid(ax)

    label_texts = []   # matplotlib Text objects for adjust_text
    label_targets = []  # (x, y) the labels would naturally sit at

    for s in series:
        pts = sorted(s["pts"], key=lambda p: p["coverage"])
        if not pts:
            continue
        cov  = [p["coverage"]  for p in pts]
        prec = [p["precision"] for p in pts]

        if s.get("continuous", True) and len(cov) > 1:
            ax.plot(cov, prec, color=s["color"], drawstyle="steps-post",
                    alpha=0.45, linewidth=2.5, zorder=2)
        ax.scatter(cov, prec, color=s["color"], s=30, zorder=3, alpha=0.8)

        # Direct end-of-line label — initial position at the natural
        # endpoint; adjust_text (or the manual fallback) will move it
        # to avoid overlap with sibling labels.
        x_pad = (xlim[1] - xlim[0]) * 0.015
        t = ax.text(cov[-1] + x_pad, prec[-1], s["label"],
                    color=s["color"], fontsize=11, fontweight="bold",
                    va="center", ha="left", path_effects=HALO, clip_on=False)
        label_texts.append(t)
        label_targets.append((cov[-1] + x_pad, prec[-1], s["color"]))

    # De-conflict labels
    if _HAS_ADJUST_TEXT and label_texts:
        # Pull labels back inside the panel if they wandered off, and
        # let adjust_text find non-overlapping positions.
        adjust_text(
            label_texts,
            ax=ax,
            only_move={"text": "y"},
            expand_text=(1.2, 1.4),
            avoid_self=True,
            autoalign="center",
        )
    else:
        # Manual fallback: sort endpoints by natural y (desc) and push
        # each label down (or up) until it clears the previous one.
        label_min_dy = (ylim[1] - ylim[0]) * 0.06
        placed_y = []
        # Order labels by natural y descending so they stack top-down
        order = sorted(
            range(len(label_targets)),
            key=lambda i: -label_targets[i][1],
        )
        for idx in order:
            x, y, _color = label_targets[idx]
            target_y = y
            for py in placed_y:
                if abs(target_y - py) < label_min_dy:
                    if target_y - label_min_dy >= ylim[0]:
                        target_y = py - label_min_dy
                    else:
                        target_y = py + label_min_dy
            # Second pass to handle cascade collisions
            for _ in range(5):
                collided = False
                for py in placed_y:
                    if abs(target_y - py) < label_min_dy:
                        target_y = py - label_min_dy if (
                            target_y - py <= 0 and target_y - label_min_dy >= ylim[0]
                        ) else py + label_min_dy
                        collided = True
                        break
                if not collided:
                    break
            placed_y.append(target_y)
            label_texts[idx].set_position((x, target_y))
            # Draw a thin leader line from the data point to the label
            # so the visual association is preserved when the label
            # is moved away from its natural position.
            if abs(target_y - y) > 1e-3:
                x_data = x - (xlim[1] - xlim[0]) * 0.015  # back to marker
                ax.plot([x_data, x],
                        [label_targets[idx][1], target_y],
                        color=_color, linewidth=0.8, alpha=0.6, zorder=2.5)

    # 99% precision target — label sits just BELOW the line so it never
    # overlaps the 100% grid line at the top of the panel.
    ax.axhline(0.99, color=C_GUIDE, linestyle="--", alpha=0.5,
               linewidth=1.5, zorder=1)
    ax.axhspan(0.99, ylim[1], color=C_GUIDE, alpha=0.04, zorder=0)
    ax.text(xlim[1] * 0.97, 0.985, "99% target", color=C_GUIDE,
            fontsize=10, ha="right", va="top", fontstyle="italic")

    ax.set_xlim(*xlim)
    ax.set_ylim(*ylim)
    ax.xaxis.set_major_formatter(PCT_FMT)
    ax.yaxis.set_major_formatter(PCT_FMT)
    ax.set_xlabel("Coverage")
    ax.set_title(panel_title, fontsize=14, fontweight="bold", pad=12)


def make_risk_coverage():
    """Two side-by-side precision-vs-coverage panels (ID and OOD)."""
    orig = [
        {"label": "JEV",      "color": C_JEV,
         "pts": forensics["jevRiskCoverageCurve"]},
        {"label": "DeepSeek", "color": C_DEEPSEEK,
         "pts": forensics["deepseekRiskCoverageCurve"]},
        {"label": "Static",   "color": C_RULES,
         "pts": forensics["staticRuleRiskCoverageCurve"],
         "continuous": False},
    ]
    ood_s = [
        {"label": "JEV",      "color": C_JEV,
         "pts": ood["curves"]["riskCoverage"]["jev"]},
        {"label": "DeepSeek", "color": C_DEEPSEEK,
         "pts": ood["curves"]["riskCoverage"]["deepseek"]},
        {"label": "Static",   "color": C_RULES,
         "pts": ood["curves"]["riskCoverage"]["rules"],
         "continuous": False},
    ]

    # Shared y range across both panels
    all_prec = (
        [p["precision"] for s in orig  for p in s["pts"]]
        + [p["precision"] for s in ood_s for p in s["pts"]]
    )
    ymin = max(0, min(all_prec) - 0.03)

    orig_xmax = max(p["coverage"] for s in orig  for p in s["pts"]) * 1.2
    ood_xmax  = max(p["coverage"] for s in ood_s for p in s["pts"]) * 1.2

    fig, (ax1, ax2) = plt.subplots(1, 2, sharey=True, figsize=(16, 6.5))
    add_header(
        fig,
        "Risk-coverage trade-off collapses on OOD",
        "Precision vs coverage at varying thresholds · retrospective / oracle selection",
    )
    fig.subplots_adjust(top=0.80, left=0.07, right=0.93,
                        bottom=0.14, wspace=0.06)

    _rc_panel(ax1, orig, xlim=(0, orig_xmax), ylim=(ymin, 1.015),
              panel_title=f"In-distribution (n\u2009=\u2009{fmt_count(ORIG_N)})")
    _rc_panel(ax2, ood_s, xlim=(0, ood_xmax), ylim=(ymin, 1.015),
              panel_title=f"OOD validation (n\u2009=\u2009{fmt_count(OOD_N)})")

    ax1.set_ylabel("Precision")
    ax2.tick_params(labelleft=False)

    add_footer(fig)
    save_fig(fig, "risk-coverage")


# ============================================================================
# FIGURE 3 — FROZEN POLICY TRANSFER
# ============================================================================

def make_frozen_policy():
    """Stacked bar: safe + unsafe auto-merges on OOD per system."""
    def orig_row(m):
        return find_row(
            table["fixedThreshold"],
            lambda x: m in x["model"] and x["split"] == "repo-disjoint",
            f"orig fixedThreshold: {m}",
        )

    def ood_row(prefix):
        return find_row(
            ood["frozenPolicies"],
            lambda f: (f["policy"].startswith(prefix)
                       and "repo-disjoint" in f.get("policy", "")),
            f"ood frozenPolicies: {prefix}",
        )

    systems = [
        {"name": "DeepSeek Flash", "color": C_DEEPSEEK,
         "orig": orig_row("deepseek"), "ood": ood_row("DeepSeek")},
        {"name": "JEV",            "color": C_JEV,
         "orig": orig_row("Jev"),      "ood": ood_row("JEV")},
        {"name": "Static rules",   "color": C_RULES,
         "orig": orig_row("Static"),   "ood": ood_row("Static")},
    ]
    # Worst (most unsafe) at top
    systems.sort(key=lambda s: s["ood"]["unsafe"])

    fig, ax = plt.subplots(figsize=(13, 5.5))
    add_header(
        fig,
        "Frozen policies: every system produced unsafe merges on OOD",
        "Threshold frozen from original benchmark (all had 100% precision in-distribution)",
    )
    fig.subplots_adjust(top=0.80, left=0.18, right=0.80, bottom=0.14)

    y = np.arange(len(systems))
    h = 0.55
    # Compute max bar width once so the external text always has a
    # consistent, comfortable padding regardless of how small a
    # particular bar is.
    max_auto = max(s["ood"]["autoMerged"] for s in systems)
    text_pad = max_auto * 0.025 + 1.5   # at least 1.5 cases, plus 2.5% of max

    for i, s in enumerate(systems):
        auto   = s["ood"]["autoMerged"]
        unsafe = s["ood"]["unsafe"]
        safe   = auto - unsafe
        prec   = s["ood"]["precision"]

        # Stacked horizontal bar: safe ■ + unsafe ■
        ax.barh(y[i], safe, h, color=C_SAFE, alpha=0.75, zorder=2,
                label="Safe" if i == 0 else "")
        ax.barh(y[i], unsafe, h, left=safe, color=C_UNSAFE, alpha=0.75,
                zorder=2, label="Unsafe" if i == 0 else "")

        # Labels after bar — use generous padding so the text never
        # collides with the right edge of the bar.
        ax.text(
            auto + text_pad, y[i],
            f"{fmt_pct(prec)} precision  ·  {unsafe} unsafe",
            va="center", fontsize=12, fontweight="bold", color=C_TEXT,
        )

        # Counts inside bar segments
        if safe > 3:
            ax.text(safe / 2, y[i], str(safe), ha="center", va="center",
                    fontsize=11, color="white", fontweight="bold")
        if unsafe > 3:
            ax.text(safe + unsafe / 2, y[i], str(unsafe), ha="center",
                    va="center", fontsize=11, color="white", fontweight="bold")

    ax.set_yticks(y)
    ax.set_yticklabels(
        [s["name"] for s in systems], fontsize=14, fontweight="bold",
    )
    ax.set_xlabel("Auto-merged cases (OOD)")
    # Right margin widened from 2.2× to 2.6× so the external label has
    # room to breathe even for the longest "X% precision  ·  N unsafe".
    ax.set_xlim(0, max_auto * 2.6)
    add_grid(ax, axis="x")

    ax.legend(
        handles=[
            Patch(facecolor=C_SAFE, alpha=0.75, label="Safe auto-merges"),
            Patch(facecolor=C_UNSAFE, alpha=0.75, label="Unsafe auto-merges"),
        ],
        loc="lower right", fontsize=11,
    )

    add_footer(fig)
    save_fig(fig, "frozen-policy-transfer")


# ============================================================================
# FIGURE 4 — ECOSYSTEM AUROC BREAKDOWN
# ============================================================================

def make_ecosystem_auroc():
    """Horizontal bars: JEV AUROC on OOD broken down by ecosystem."""
    eco_data = ood["stratification"]["ecosystem"]
    valid = [e for e in eco_data
             if e["jevAuroc"] is not None and e["n"] >= 8]
    valid.sort(key=lambda e: e["jevAuroc"])

    jev_id = forensics["ranking"]["jev_autoMergeScore"]["auroc"]

    fig, ax = plt.subplots(figsize=(12, 5))
    add_header(
        fig,
        "OOD signal concentrates in JavaScript — other ecosystems near or below chance",
        f"JEV AUROC by ecosystem on OOD data · "
        f"original benchmark (all Java/Maven) AUROC\u2009=\u2009{jev_id:.3f}",
        # Subtitle pulled down a hair more so the long title (which can
        # render close to the figure top) never visually overlaps the
        # subtitle line under any font-metric variation.
        subtitle_y=0.885,
    )
    fig.subplots_adjust(top=0.80, left=0.16, right=0.93, bottom=0.14)

    y_pos = np.arange(len(valid))
    h = 0.6

    for i, e in enumerate(valid):
        color = C_JEV if e["jevAuroc"] >= 0.5 else C_UNSAFE
        ax.barh(y_pos[i], e["jevAuroc"], h, color=color, alpha=0.8,
                zorder=2)
        # Label always placed a fixed 0.018 outside the bar's right edge,
        # which is enough for the longest expected "0.XXX   (n=NN)" even
        # when the bar itself is very short (e.g., Go at 0.100).
        ax.text(
            e["jevAuroc"] + 0.018, y_pos[i],
            f'{e["jevAuroc"]:.3f}   (n\u2009=\u2009{e["n"]})',
            va="center", fontsize=12, fontweight="bold",
            color=color, path_effects=HALO,
        )

    # Chance line — label sits below the line near the bottom of the chart,
    # so it doesn't clash with the top bar or the plot's upper border.
    ax.axvline(0.5, color=C_AXIS, linestyle=":", linewidth=1.8, zorder=1)
    ax.text(0.5, 3.5, "chance", ha="center", va="bottom",
            fontsize=11, color=C_SUBTEXT, fontstyle="italic")

    # ID reference
    ax.axvline(jev_id, color=C_JEV, linestyle="--", linewidth=1.5,
               alpha=0.5, zorder=1)
    ax.text(jev_id + 0.01, -0.49,
            f"ID benchmark: {jev_id:.3f}", fontsize=10,
            color=C_JEV, fontstyle="italic", va="bottom")

    labels = [e["value"].capitalize() for e in valid]
    ax.set_yticks(y_pos)
    ax.set_yticklabels(labels, fontsize=14, fontweight="bold")
    ax.set_xlim(0, jev_id + 0.08)
    ax.set_xlabel("AUROC")
    add_grid(ax, axis="x")

    # Excluded ecosystems note
    excluded = [e for e in eco_data if e["jevAuroc"] is None]
    if excluded:
        names = ", ".join(e["value"] for e in excluded)
        ax.text(0.85, 0.3, f"Excluded (one-class or too small): {names}",
                transform=ax.transAxes, fontsize=9, color=C_SUBTEXT,
                ha="right", va="bottom")

    add_footer(fig)
    save_fig(fig, "ecosystem-auroc")


# ============================================================================
# FIGURE 5 — SCORE CALIBRATION DEVIATION
# ============================================================================

def make_calibration():
    """Bar chart of calibration error per score bin, ID vs OOD."""
    orig_bins = forensics["calibrationBins"]
    ood_bins  = ood["calibration"]

    centers   = []
    dev_orig  = []
    dev_ood   = []
    n_ood_lst = []

    for ob, od in zip(orig_bins, ood_bins):
        c = (ob["lo"] + ob["hi"]) / 2
        centers.append(c)
        dev_orig.append(ob["controlRate"] - c if ob["n"] > 0 else None)
        dev_ood.append(od["controlRate"] - c  if od["n"] > 0 else None)
        n_ood_lst.append(od["n"])

    fig, ax = plt.subplots(figsize=(14, 6))
    add_header(
        fig,
        "Calibration collapses on OOD: high scores become unreliable",
        "Deviation from ideal · observed safe rate \u2212 predicted score · "
        "positive\u2009=\u2009conservative, negative\u2009=\u2009overconfident",
    )
    # top=0.78 reserves headroom for title + subtitle + an inline legend
    # placed just below the subtitle (see fig.legend below).
    fig.subplots_adjust(top=0.78, left=0.08, right=0.95, bottom=0.14)

    w = 0.035
    c_arr = np.array(centers)

    # Background safe / danger zones
    ax.axhspan(0, 1,  color=C_SAFE,   alpha=0.04, zorder=0)
    ax.axhspan(-1, 0, color=C_UNSAFE, alpha=0.04, zorder=0)
    ax.axhline(0, color=C_AXIS, linewidth=1.5, zorder=1)

    # ID bars (solid)
    for c, d in zip(c_arr, dev_orig):
        if d is not None:
            ax.bar(c - w * 0.6, d, w, color=C_JEV, alpha=0.7, zorder=2)

    # OOD bars (outlined)
    for c, d in zip(c_arr, dev_ood):
        if d is not None:
            ax.bar(c + w * 0.6, d, w, facecolor="white",
                   edgecolor=C_JEV, linewidth=1.8, zorder=2)

    # Axis limits
    all_devs = [d for d in dev_orig + dev_ood if d is not None]
    y_lo = min(all_devs) * 1.25
    y_hi = max(all_devs) * 1.25
    ax.set_ylim(y_lo, y_hi)
    ax.set_xlim(-0.02, 1.02)

    # Zone labels are folded into the y-axis label so they don't compete
    # with the ID bars at the low-score bins (which often sit in the
    # same upper-left or lower-left region as the zone labels).
    ax.set_ylabel(
        "Calibration error\n"
        "+ conservative (safe)  /  \u2212 overconfident (dangerous)",
        fontsize=12,
    )

    # Annotate the 0.85-bin OOD extreme.
    #   * The text box sits in the UPPER half (positive deviation zone,
    #     mostly empty for high-score bins), directly above the 85% bar.
    #   * A STRAIGHT VERTICAL arrow drops from the text down to the bar's
    #     tip. Because the arrow is at the 85% bin's x position only, it
    #     crosses no other bars on its way down.
    #   * No bbox is used — instead a white halo (path_effects) keeps the
    #     text readable on any background without an opaque rectangle
    #     that could obscure adjacent bars (e.g. the 95% OOD bar).
    idx_85 = 8  # 0.85 center
    if dev_ood[idx_85] is not None:
        obs = ood_bins[idx_85]["controlRate"]
        bar_x = c_arr[idx_85] + w * 0.6
        # Place text at 85% of the way up the positive y-range; if all
        # deviations are negative (no positive zone), place it just
        # above the y=0 axis line so the text sits in clear space.
        if y_hi > 0.02:
            text_y = y_hi * 0.85
        else:
            text_y = 0.05  # slightly above zero, in the empty headroom
        ax.annotate(
            f"Predicts 85% safe\nActual: {fmt_pct(obs)} safe",
            xy=(bar_x, dev_ood[idx_85]),
            xytext=(bar_x, text_y),
            fontsize=10, color=C_UNSAFE, fontweight="bold",
            arrowprops=dict(arrowstyle="->", color=C_UNSAFE, linewidth=1.5,
                            connectionstyle="arc3,rad=0"),
            ha="center", va="center",
            path_effects=HALO,
        )

    ax.set_xticks(c_arr)
    ax.set_xticklabels([fmt_pct(c, 0) for c in centers], fontsize=11)
    ax.set_xlabel("JEV p(AUTO_MERGE) score bin")
    ax.set_ylabel("Calibration error")
    add_grid(ax, axis="y")

    # Legend placed at the FIGURE level in the headroom between the
    # subtitle and the axes. This keeps it from overlapping the leftmost
    # ID bar (which sits at the 5% bin) and from competing with the
    # "Conservative / Overconfident" zone labels.
    fig.legend(
        handles=[
            Patch(facecolor=C_JEV, alpha=0.7,
                  label=f"In-distribution (n\u2009=\u2009{fmt_count(ORIG_N)})"),
            Patch(facecolor="white", edgecolor=C_JEV, linewidth=2,
                  label=f"OOD (n\u2009=\u2009{fmt_count(OOD_N)})"),
        ],
        loc="upper left",
        bbox_to_anchor=(0.08, 0.86),
        ncol=2, fontsize=11, frameon=False,
    )

    add_footer(fig)
    save_fig(fig, "score-calibration")


# ============================================================================
# FIGURE 6 — DECISION AGREEMENT HEATMAP
# ============================================================================

def make_decision_agreement():
    """Annotated heatmap of pairwise decision agreement rates."""
    counts = forensics["disagreements"]["counts"]
    n = ORIG_N

    systems = ["JEV", "DeepSeek\nFlash", "Static\nrules"]
    agree = np.array([
        [100.0,
         (n - counts["jev_vs_deepseek"]) / n * 100,
         (n - counts["jev_vs_rules"]) / n * 100],
        [(n - counts["jev_vs_deepseek"]) / n * 100,
         100.0,
         (n - counts["deepseek_vs_rules"]) / n * 100],
        [(n - counts["jev_vs_rules"]) / n * 100,
         (n - counts["deepseek_vs_rules"]) / n * 100,
         100.0],
    ])

    disagree = np.array([
        [0,                          counts["jev_vs_deepseek"],  counts["jev_vs_rules"]],
        [counts["jev_vs_deepseek"],  0,                         counts["deepseek_vs_rules"]],
        [counts["jev_vs_rules"],     counts["deepseek_vs_rules"], 0],
    ])

    fig, ax = plt.subplots(figsize=(8, 7))
    add_header(
        fig,
        "Systems make genuinely different decisions",
        f"Pairwise decision agreement on original benchmark "
        f"(n\u2009=\u2009{fmt_count(ORIG_N)})",
    )
    # bottom bumped from 0.10 → 0.20 to give xtick labels and the
    # "all three disagreed" note their own bands below the heatmap.
    fig.subplots_adjust(top=0.80, left=0.20, right=0.95, bottom=0.20)

    im = ax.imshow(agree, cmap="Blues", vmin=25, vmax=100, aspect="equal")

    for i in range(3):
        for j in range(3):
            if i == j:
                ax.text(j, i, "\u2014", ha="center", va="center",
                        fontsize=22, color="white", fontweight="bold")
            else:
                val = agree[i, j]
                txt_c = "white" if val > 60 else C_TEXT
                ax.text(j, i - 0.12, f"{val:.1f}%", ha="center",
                        va="center", fontsize=18, fontweight="bold",
                        color=txt_c)
                ax.text(j, i + 0.22,
                        f"{int(disagree[i, j])} disagree",
                        ha="center", va="center", fontsize=9,
                        color=txt_c, alpha=0.8)

    ax.set_xticks(range(3))
    ax.set_xticklabels(systems, fontsize=13, fontweight="bold")
    ax.set_yticks(range(3))
    ax.set_yticklabels(systems, fontsize=13, fontweight="bold")

    for spine in ax.spines.values():
        spine.set_visible(False)
    ax.tick_params(length=0)

    # All-three-disagree note placed as a figure-level text well BELOW
    # the xtick labels (no longer in axes coords), so it can't overlap
    # the "DeepSeek Flash" tick label even when that label wraps.
    all3 = counts["all_three_disagree"]
    fig.text(
        0.5, 0.07,
        f"All three disagreed on {all3} cases ({all3 / n * 100:.1f}%)",
        fontsize=11, color=C_SUBTEXT,
        ha="center", va="top",
    )

    # Footer pushed down (y=0.015) so it sits below the all-three-disagree
    # note rather than competing with the "Static rules" xtick label.
    add_footer(fig, y=0.015)
    save_fig(fig, "decision-agreement")


# ============================================================================
# FIGURE 7 — LATENCY & COST
# ============================================================================

def make_latency_cost():
    """Side-by-side bar charts: mean latency and cost per 1k decisions."""
    jev_op = ood["operational"]["jev"]
    ds_op  = ood["operational"]["deepseek"]

    systems   = ["Static rules", "JEV", "DeepSeek Flash"]
    colors    = [C_RULES, C_JEV, C_DEEPSEEK]
    latencies = [0, jev_op["latencyMeanMs"], ds_op["latencyMeanMs"]]
    p95s      = [0, jev_op["latencyP95Ms"],  ds_op["latencyP95Ms"]]
    costs     = [0, jev_op["costPer1kUsd"],  ds_op["costPer1kUsd"]]

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 4.5))
    add_header(
        fig,
        "Operational profile",
        f"Mean latency and cost per 1,000 decisions · "
        f"OOD run (n\u2009=\u2009{fmt_count(OOD_N)})",
    )
    # bottom bumped from 0.15 → 0.22 to give the x-axis labels room to
    # breathe below the footer text; top from 0.78 → 0.74 to keep the
    # header from running into the chart titles on this short figure.
    fig.subplots_adjust(top=0.74, left=0.14, right=0.95,
                        bottom=0.22, wspace=0.35)

    y = np.arange(len(systems))
    h = 0.55
    max_lat = max(latencies)
    max_cst = max(costs)

    # ── Latency panel ────────────────────────────────────────────────────
    for i in range(len(systems)):
        ax1.barh(y[i], latencies[i], h, color=colors[i],
                 alpha=0.8, zorder=2)
        lbl = f"{latencies[i]:,.0f} ms" if latencies[i] > 0 else "0 ms"
        if p95s[i] > 0:
            lbl += f"  (p95: {p95s[i]:,.0f})"
        # Padding proportional to the widest bar so labels never crowd
        # the bar end — uses ~3% of the longest bar as a buffer.
        lat_pad = max(max_lat * 0.025, 40)
        ax1.text(
            max(latencies[i] + lat_pad, lat_pad * 1.5), y[i], lbl,
            va="center", fontsize=11, fontweight="bold",
            color=colors[i], path_effects=HALO,
        )

    ax1.set_yticks(y)
    ax1.set_yticklabels(systems, fontsize=13, fontweight="bold")
    ax1.set_xlabel("Mean latency (ms)")
    # Widen xlim slightly so the longest data label always fits inside
    # the axes — avoids clipping the "(p95: ...)" tail.
    ax1.set_xlim(0, max_lat * 1.55)
    ax1.set_title("Latency", fontsize=14, fontweight="bold", pad=10)
    add_grid(ax1, axis="x")

    # ── Cost panel ───────────────────────────────────────────────────────
    for i in range(len(systems)):
        ax2.barh(y[i], costs[i], h, color=colors[i],
                 alpha=0.8, zorder=2)
        lbl = fmt_cost(costs[i]) if costs[i] > 0 else "\\$0"
        cost_pad = max(max_cst * 0.025, 0.012)
        ax2.text(
            max(costs[i] + cost_pad, cost_pad * 1.5), y[i], lbl,
            va="center", fontsize=11, fontweight="bold",
            color=colors[i], path_effects=HALO,
        )

    ax2.set_yticks(y)
    ax2.set_yticklabels(["" for _ in systems])
    ax2.set_xlabel("Cost per 1,000 cases (USD)")
    ax2.set_xlim(0, max_cst * 1.55)
    ax2.set_title("Cost", fontsize=14, fontweight="bold", pad=10)
    add_grid(ax2, axis="x")

    # Footer pushed down so it never sits next to the cost panel's
    # xlabel on this short figure.
    add_footer(fig, y=0.015)
    save_fig(fig, "latency-cost")


# ============================================================================
# CONTACT SHEET
# ============================================================================

def make_contact_sheet():
    """Tile all seven figure PNGs into a single overview image."""
    import matplotlib.image as mpimg

    names = [
        "auroc-comparison", "risk-coverage", "frozen-policy-transfer",
        "ecosystem-auroc", "score-calibration", "decision-agreement",
        "latency-cost",
    ]
    images = []
    for name in names:
        path = os.path.join(OUT_DIR, f"{name}.png")
        if os.path.exists(path):
            images.append(mpimg.imread(path))

    if not images:
        return

    cols = 3
    rows = math.ceil(len(images) / cols)
    fig, axes = plt.subplots(rows, cols, figsize=(30, rows * 7))
    axes_flat = np.asarray(axes).flatten()

    for i, img in enumerate(images):
        axes_flat[i].imshow(img)
        axes_flat[i].axis("off")
    for i in range(len(images), len(axes_flat)):
        axes_flat[i].axis("off")

    fig.suptitle("All Figures — Contact Sheet", fontsize=24,
                 fontweight="bold", y=0.98)
    fig.tight_layout(rect=[0, 0, 1, 0.96])
    fig.savefig(os.path.join(OUT_DIR, "contact_sheet.png"), dpi=120)
    plt.close(fig)
    print("  ✓ contact_sheet")


# ============================================================================
# MAIN
# ============================================================================

if __name__ == "__main__":
    print("Cleaning up old figures …")
    cleanup()
    print("Generating figures …")
    make_auroc()
    make_risk_coverage()
    make_frozen_policy()
    make_ecosystem_auroc()
    make_calibration()
    make_decision_agreement()
    make_latency_cost()
    make_contact_sheet()
    print("Done — all figures in", OUT_DIR)
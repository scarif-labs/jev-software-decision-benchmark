// Generate publication-quality SVG figures from canonical JSON results only.
// No model calls, no data changes. Output: analysis/figures/*.svg
import fs from 'node:fs';

const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const table = read('report/table.json');
const forensics = read('analysis/decision-forensics.json');
const ood = read('analysis/ood-validation.json');

const OUT = 'analysis/figures';
fs.mkdirSync(OUT, { recursive: true });

const C = { jev: '#1b6ca8', deepseek: '#c2620a', rules: '#3f7d52', orig: '#111827', ood: '#6b7280', grid: '#e5e7eb', axis: '#111827' };
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmtPct = v => `${Math.round(v * 100)}%`;
const fmtMoney = v => `$${v.toFixed(2)}`;

function doc(w, h, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="-apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif">` +
    `<rect width="${w}" height="${h}" fill="white"/>` + body + `</svg>\n`;
}
function frame(x, y, w, h) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${C.axis}" stroke-width="1"/>`;
}
function gridY(x, y, w, h, ymin, ymax, ticks, label) {
  let s = '';
  for (const t of ticks) {
    const yy = y + h - ((t - ymin) / (ymax - ymin)) * h;
    s += `<line x1="${x}" y1="${yy}" x2="${x + w}" y2="${yy}" stroke="${C.grid}"/>`;
    s += `<text x="${x - 10}" y="${yy + 4}" text-anchor="end" font-size="12" fill="#374151">${esc(label(t))}</text>`;
  }
  return s;
}
function gridX(x, y, w, h, xmin, xmax, ticks, label) {
  let s = '';
  for (const t of ticks) {
    const xx = x + ((t - xmin) / (xmax - xmin)) * w;
    s += `<line x1="${xx}" y1="${y}" x2="${xx}" y2="${y + h}" stroke="${C.grid}"/>`;
    s += `<text x="${xx}" y="${y + h + 18}" text-anchor="middle" font-size="12" fill="#374151">${esc(label(t))}</text>`;
  }
  return s;
}
function polyline(pts, x, y, w, h, xmin, xmax, ymin, ymax, color, dash = '') {
  const d = pts.map(([px, py]) => `${(x + ((px - xmin) / (xmax - xmin)) * w).toFixed(1)},${(y + h - ((py - ymin) / (ymax - ymin)) * h).toFixed(1)}`).join(' ');
  return `<polyline points="${d}" fill="none" stroke="${color}" stroke-width="2.2"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
}
function legend(x, y, items) {
  return items.map((it, i) => `<g><line x1="${x}" y1="${y + i * 18}" x2="${x + 22}" y2="${y + i * 18}" stroke="${it.color}" stroke-width="2.5"${it.dash ? ` stroke-dasharray="${it.dash}"` : ''}/><text x="${x + 30}" y="${y + 4 + i * 18}" font-size="12" fill="#111827">${esc(it.label)}</text></g>`).join('');
}
function title(t, sub) {
  return `<text x="60" y="30" font-size="17" font-weight="600" fill="#111827">${esc(t)}</text>` + (sub ? `<text x="60" y="50" font-size="12" fill="#6b7280">${esc(sub)}</text>` : '');
}

// ---- 1. original risk-coverage ----
{
  const series = [
    { label: 'JEV', color: C.jev, pts: forensics.jevRiskCoverageCurve },
    { label: 'DeepSeek Flash', color: C.deepseek, pts: forensics.deepseekRiskCoverageCurve },
    { label: 'Static rules', color: C.rules, pts: forensics.staticRuleRiskCoverageCurve },
  ];
  const xmin = 0, xmax = 0.22, ymin = 0.4, ymax = 1.02;
  const X = 70, Y = 70, W = 560, H = 320;
  let body = title('Original benchmark — risk–coverage (retrospective)', 'Precision vs coverage of the AUTO_MERGE policy; 1,102 cases');
  body += frame(X, Y, W, H);
  body += gridY(X, Y, W, H, ymin, ymax, [0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0], fmtPct);
  body += gridX(X, Y, W, H, xmin, xmax, [0, 0.05, 0.1, 0.15, 0.2], fmtPct);
  body += `<text x="${X + W / 2}" y="${Y + H + 44}" text-anchor="middle" font-size="12" fill="#374151">coverage</text>`;
  body += `<text x="18" y="${Y + H / 2}" text-anchor="middle" font-size="12" fill="#374151" transform="rotate(-90 18 ${Y + H / 2})">precision</text>`;
  for (const s of series) body += polyline(s.pts.map(p => [p.coverage, p.precision]).sort((a, b) => a[0] - b[0]), X, Y, W, H, xmin, xmax, ymin, ymax, s.color);
  body += legend(X + W + 20, Y + 10, series);
  fs.writeFileSync(`${OUT}/original-risk-coverage.svg`, doc(760, 440, body));
}

// ---- 2. OOD risk-coverage ----
{
  const rc = ood.curves.riskCoverage;
  const series = [
    { label: 'JEV', color: C.jev, pts: rc.jev },
    { label: 'DeepSeek Flash', color: C.deepseek, pts: rc.deepseek },
    { label: 'Static rules', color: C.rules, pts: rc.rules },
  ];
  const xmin = 0, xmax = 0.5, ymin = 0.4, ymax = 1.02;
  const X = 70, Y = 70, W = 560, H = 320;
  let body = title('OOD validation — risk–coverage (retrospective)', 'Precision vs coverage of the AUTO_MERGE policy; 185 independent cases');
  body += frame(X, Y, W, H);
  body += gridY(X, Y, W, H, ymin, ymax, [0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0], fmtPct);
  body += gridX(X, Y, W, H, xmin, xmax, [0, 0.1, 0.2, 0.3, 0.4, 0.5], fmtPct);
  body += `<text x="${X + W / 2}" y="${Y + H + 44}" text-anchor="middle" font-size="12" fill="#374151">coverage</text>`;
  body += `<text x="18" y="${Y + H / 2}" text-anchor="middle" font-size="12" fill="#374151" transform="rotate(-90 18 ${Y + H / 2})">precision</text>`;
  for (const s of series) body += polyline(s.pts.map(p => [p.coverage, p.precision]).sort((a, b) => a[0] - b[0]), X, Y, W, H, xmin, xmax, ymin, ymax, s.color);
  body += legend(X + W + 20, Y + 10, series);
  fs.writeFileSync(`${OUT}/ood-risk-coverage.svg`, doc(760, 440, body));
}

// ---- 3. AUROC comparison ----
{
  const cats = ['JEV', 'Static rules', 'DeepSeek Flash'];
  const origVals = [forensics.ranking.jev_autoMergeScore.auroc, forensics.ranking.static_rule_binary.auroc, forensics.ranking.deepseek_autoMergeScore_gated.auroc];
  const oodVals = [ood.ranking.jev_pAutoMerge.auroc, ood.ranking.staticRule.auroc, ood.ranking.deepseek_gated.auroc];
  const X = 80, Y = 70, W = 560, H = 320, ymin = 0, ymax = 1;
  const bw = 70, gap = 150;
  let body = title('Ranking quality — AUROC, original vs OOD', 'Positive class = control (safe to auto-merge); chance = 0.5');
  body += frame(X, Y, W, H);
  body += gridY(X, Y, W, H, ymin, ymax, [0, 0.2, 0.4, 0.5, 0.6, 0.8, 1.0], v => v.toFixed(1));
  body += `<line x1="${X}" y1="${Y + H - (0.5 / ymax) * H}" x2="${X + W}" y2="${Y + H - (0.5 / ymax) * H}" stroke="#9ca3af" stroke-dasharray="4 4"/>`;
  body += `<text x="${X + W - 4}" y="${Y + H - (0.5 / ymax) * H - 5}" text-anchor="end" font-size="11" fill="#6b7280">chance 0.5</text>`;
  cats.forEach((cat, i) => {
    const cx = X + 60 + i * gap;
    [origVals[i], oodVals[i]].forEach((v, j) => {
      const bh = (v / ymax) * H;
      body += `<rect x="${cx + j * (bw + 8)}" y="${Y + H - bh}" width="${bw}" height="${bh}" fill="${j === 0 ? C.orig : C.ood}"${j === 1 ? ' fill-opacity="0.55"' : ''}/>`;
      body += `<text x="${cx + j * (bw + 8) + bw / 2}" y="${Y + H - bh - 5}" text-anchor="middle" font-size="11" fill="#111827">${v.toFixed(3)}</text>`;
    });
    body += `<text x="${cx + bw + 4}" y="${Y + H + 18}" text-anchor="middle" font-size="12" fill="#111827">${esc(cat)}</text>`;
  });
  body += legend(X + W - 150, Y + 10, [{ label: 'original', color: C.orig }, { label: 'OOD', color: C.ood }]);
  fs.writeFileSync(`${OUT}/auc-comparison.svg`, doc(760, 440, body));
}

// ---- 4. score calibration ----
{
  const origBins = forensics.calibrationBins;
  const oodBins = ood.calibration;
  const X = 70, Y = 70, W = 560, H = 320, ymin = 0, ymax = 1;
  const centers = [0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95];
  let body = title('JEV score calibration — original vs OOD', 'Share of controls (safe) within each p(AUTO_MERGE) bin');
  body += frame(X, Y, W, H);
  body += gridY(X, Y, W, H, ymin, ymax, [0, 0.2, 0.4, 0.6, 0.8, 1.0], fmtPct);
  body += gridX(X, Y, W, H, 0, 1, centers, v => v.toFixed(1));
  body += `<text x="${X + W / 2}" y="${Y + H + 44}" text-anchor="middle" font-size="12" fill="#374151">JEV p(AUTO_MERGE) bin centre</text>`;
  const origPts = centers.map((c, i) => [c, origBins[i]?.controlRate ?? 0]);
  const oodPts = centers.map((c, i) => [c, oodBins[i]?.controlRate ?? 0]);
  body += polyline(origPts, X, Y, W, H, 0, 1, ymin, ymax, C.orig, '6 3');
  body += polyline(oodPts, X, Y, W, H, 0, 1, ymin, ymax, C.ood);
  for (const [c, v] of origPts) body += `<circle cx="${(X + c * W).toFixed(1)}" cy="${(Y + H - v * H).toFixed(1)}" r="3.2" fill="${C.orig}"/>`;
  for (const [c, v] of oodPts) body += `<circle cx="${(X + c * W).toFixed(1)}" cy="${(Y + H - v * H).toFixed(1)}" r="3.2" fill="${C.ood}"/>`;
  body += legend(X + W - 170, Y + 10, [{ label: 'original (1,102)', color: C.orig, dash: '6 3' }, { label: 'OOD (185)', color: C.ood }]);
  fs.writeFileSync(`${OUT}/score-calibration.svg`, doc(760, 440, body));
}

// ---- 5. latency vs cost ----
{
  const r = (m) => table.rows.find(x => x.model.includes(m) && x.targetPrecision === 0.99);
  const pts = [
    { label: 'JEV (orig)', x: r('Jev').meanLatencyMs, y: r('Jev').costUsdPer1k, color: C.jev, fill: C.jev },
    { label: 'DeepSeek (orig)', x: r('deepseek').meanLatencyMs, y: r('deepseek').costUsdPer1k, color: C.deepseek, fill: C.deepseek },
    { label: 'JEV (OOD)', x: ood.operational.jev.latencyMeanMs, y: ood.operational.jev.costPer1kUsd, color: C.jev, fill: 'white' },
    { label: 'DeepSeek (OOD)', x: ood.operational.deepseek.latencyMeanMs, y: ood.operational.deepseek.costPer1kUsd, color: C.deepseek, fill: 'white' },
    { label: 'Static rules', x: 0, y: 0, color: C.rules, fill: C.rules },
  ];
  const xmin = 0, xmax = 3000, ymin = 0, ymax = 0.75;
  const X = 80, Y = 70, W = 560, H = 320;
  let body = title('Latency vs cost per 1,000 decisions', 'Filled = original benchmark; open = OOD; static rule at origin');
  body += frame(X, Y, W, H);
  body += gridY(X, Y, W, H, ymin, ymax, [0, 0.15, 0.3, 0.45, 0.6, 0.75], fmtMoney);
  body += gridX(X, Y, W, H, xmin, xmax, [0, 600, 1200, 1800, 2400, 3000], v => `${v}`);
  body += `<text x="${X + W / 2}" y="${Y + H + 44}" text-anchor="middle" font-size="12" fill="#374151">mean latency (ms)</text>`;
  body += `<text x="20" y="${Y + H / 2}" text-anchor="middle" font-size="12" fill="#374151" transform="rotate(-90 20 ${Y + H / 2})">cost / 1k (USD)</text>`;
  for (const p of pts) {
    const px = X + (p.x / xmax) * W, py = Y + H - (p.y / ymax) * H;
    body += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="6" fill="${p.fill}" stroke="${p.color}" stroke-width="2.5"/>`;
    body += `<text x="${px + 10}" y="${py + 4}" font-size="11" fill="#111827">${esc(p.label)}</text>`;
  }
  fs.writeFileSync(`${OUT}/latency-cost.svg`, doc(760, 440, body));
}

// ---- 6. frozen-policy comparison (3 panels) ----
{
  const r = (m) => table.fixedThreshold.find(x => x.model.includes(m) && x.split === 'repo-disjoint');
  const fJev = ood.frozenPolicies.find(f => f.policy.startsWith('JEV — repo-disjoint'));
  const fDs = ood.frozenPolicies.find(f => f.policy.startsWith('DeepSeek'));
  const fRu = ood.frozenPolicies.find(f => f.policy.startsWith('Static'));
  const panels = [
    { title: 'precision', ymax: 1, orig: [r('Jev').precision, r('deepseek').precision, r('Static').precision], ood: [fJev.precision, fDs.precision, fRu.precision], fmt: fmtPct },
    { title: 'coverage', ymax: 0.5, orig: [r('Jev').coverage, r('deepseek').coverage, r('Static').coverage], ood: [fJev.coverage, fDs.coverage, fRu.coverage], fmt: fmtPct },
    { title: 'unsafe merges', ymax: 40, orig: [r('Jev').unsafe, r('deepseek').unsafe, r('Static').unsafe], ood: [fJev.unsafe, fDs.unsafe, fRu.unsafe], fmt: v => `${v}` },
  ];
  const cats = ['JEV', 'DeepSeek', 'Static'];
  let body = title('Frozen-policy transfer — original vs OOD', 'Threshold frozen on the original repo-disjoint development split, applied unchanged to OOD');
  const PW = 200, PH = 230, PY = 100;
  panels.forEach((p, pi) => {
    const PX = 70 + pi * 235;
    body += frame(PX, PY, PW, PH);
    body += `<text x="${PX + PW / 2}" y="${PY - 8}" text-anchor="middle" font-size="13" font-weight="600" fill="#111827">${esc(p.title)}</text>`;
    for (let i = 0; i <= 4; i++) { const yy = PY + PH - (i / 4) * PH; body += `<line x1="${PX}" y1="${yy}" x2="${PX + PW}" y2="${yy}" stroke="${C.grid}"/><text x="${PX - 6}" y="${yy + 4}" text-anchor="end" font-size="10" fill="#374151">${p.fmt((i / 4) * p.ymax)}</text>`; }
    cats.forEach((c, i) => {
      const cx = PX + 18 + i * 62;
      [p.orig[i], p.ood[i]].forEach((v, j) => {
        const bh = (v / p.ymax) * PH;
        body += `<rect x="${cx + j * 26}" y="${PY + PH - bh}" width="24" height="${bh}" fill="${j === 0 ? C.orig : C.ood}"${j === 1 ? ' fill-opacity="0.55"' : ''}/>`;
        body += `<text x="${cx + j * 26 + 12}" y="${PY + PH - bh - 4}" text-anchor="middle" font-size="9.5" fill="#111827">${p.title === 'unsafe merges' ? v : p.fmt(v)}</text>`;
      });
      body += `<text x="${cx + 25}" y="${PY + PH + 16}" text-anchor="middle" font-size="11" fill="#111827">${esc(c)}</text>`;
    });
  });
  body += legend(70, 380, [{ label: 'original frozen policy', color: C.orig }, { label: 'applied to OOD', color: C.ood }]);
  fs.writeFileSync(`${OUT}/frozen-policy-comparison.svg`, doc(820, 440, body));
}

console.log('wrote figures:', fs.readdirSync(OUT).join(', '));

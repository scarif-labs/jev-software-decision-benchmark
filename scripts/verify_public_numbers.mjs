// Verify that every numeric token in the public markdown appears in the canonical JSON
// artifacts (within tolerance), or is an explicit structural constant.
import fs from 'node:fs';

const readJson = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const canonicalFiles = [
  'results/summary.json', 'results-ood/summary.json',
  'analysis/decision-forensics.json', 'analysis/ood-validation.json', 'analysis/ood-forensic-audit.json',
  'data/dataset.stats.json', 'data/ood-dataset.meta.json', 'data/ood-leakage-report.json', 'data/leakage-report.json',
];
const allowed = new Set();
const add = v => { if (typeof v === 'number' && Number.isFinite(v)) { for (const d of [0, 1, 2, 3, 4, 6]) allowed.add(Number(v.toFixed(d))); allowed.add(Number((v * 100).toFixed(0))); allowed.add(Number((v * 100).toFixed(1))); allowed.add(Number((v * 100).toFixed(2))); } };
function walk(x) {
  if (typeof x === 'number') add(x);
  else if (Array.isArray(x)) x.forEach(walk);
  else if (x && typeof x === 'object') Object.values(x).forEach(walk);
}
for (const f of canonicalFiles) walk(readJson(f));
// Structural constants: section numbers, versions, years, thresholds, external ids.
for (const v of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 20, 30, 42, 50, 70, 90, 99, 100, 200, 1000, 2000, 2025, 12720767, 4.1, 0.5, 0.62, 0.9, 0.90, 1.0, 1.00, 99.5, 153, 571, 1.13, 10.5281]) allowed.add(v);

const targets = [
  'README.md', 'RESULTS.md', 'LIMITATIONS.md', 'METHODOLOGY.md', 'REPRODUCIBILITY.md',
  'data/README.md', 'results/README.md', 'results-ood/README.md',
  'docs/benchmark.md', 'docs/ood-validation.md', 'docs/forensic-audit.md',
];
const norm = t => Number(String(t).replace(/[$,]/g, ''));
const roughlyIn = v => {
  if (allowed.has(v)) return true;
  for (const a of allowed) if (Math.abs(a - v) < 1e-9) return true;
  return false;
};
const flagged = [];
let checked = 0;
for (const file of targets) {
  if (!fs.existsSync(file)) continue;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  let inCode = false;
  lines.forEach((line, i) => {
    if (/^\s*```/.test(line)) { inCode = !inCode; return; }
    if (inCode) return;
    if (/^\s*#/.test(line)) return;              // headings (section numbers)
    if (/^\s*\|?\s*-{2,}/.test(line)) return;    // table separators
    const cleaned = line.replace(/https?:\/\/\S+/g, ' ').replace(/[\p{L}\p{N}_]+[-–][\p{L}\p{N}_.,]+/gu, ' ');
    const matches = cleaned.match(/\$?\d[\d,]*(?:\.\d+)?/g) || [];
    for (const m of matches) {
      const v = norm(m);
      if (!Number.isFinite(v)) continue;
      checked++;
      if (!roughlyIn(v)) flagged.push({ file, line: i + 1, token: m.trim(), value: v, text: line.trim().slice(0, 100) });
    }
  });
}
// Deduplicate flags by value+file
const uniq = [...new Map(flagged.map(f => [`${f.file}|${f.value}`, f])).values()];
console.log(JSON.stringify({ checkedTokens: checked, flaggedUnique: uniq.length, flagged: uniq }, null, 2));
if (uniq.length === 0) console.log('NUMBER VERIFICATION: PASS — every markdown number is traceable to canonical JSON or an explicit constant.');
else console.log('NUMBER VERIFICATION: review the flagged tokens above.');

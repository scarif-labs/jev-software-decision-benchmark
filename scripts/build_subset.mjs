// Build a deterministic, stratified 200-case signal-detection subset from the
// existing 1,102-case dataset: 100 breaking + 100 controls. Selection is fully
// deterministic (no RNG) so every model sees exactly the same cases.
//
// Strata: repoDisjoint x timeOrder x packageFamily x updateType, allocated
// proportionally within each class using the largest-remainder method. Cases inside
// a stratum are ordered by id and taken from the front.
import fs from 'node:fs';
import path from 'node:path';

const IN = path.resolve(process.env.DATASET ?? 'data/dataset.jsonl');
const OUT = path.resolve(process.env.OUT ?? 'data/subset200.jsonl');
const META = path.resolve(process.env.META ?? 'data/subset200.meta.json');
const PER_CLASS = Number(process.env.PER_CLASS ?? 100);

const cases = fs.readFileSync(IN, 'utf8').split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l));

const strataKey = c =>
  [c.splits?.repoDisjoint, c.splits?.timeOrder, c.splits?.packageFamily, c.splits?.updateType].join('|');

function pickClass(list, target) {
  const groups = new Map();
  for (const c of list) {
    const k = strataKey(c);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(c);
  }
  for (const arr of groups.values()) arr.sort((a, b) => a.id.localeCompare(b.id));

  const N = list.length;
  const alloc = new Map();
  let assigned = 0;
  const remainders = [];
  for (const [key, arr] of groups) {
    const exact = (target * arr.length) / N;
    const base = Math.min(Math.floor(exact), arr.length);
    alloc.set(key, base);
    assigned += base;
    remainders.push([key, exact - Math.floor(exact)]);
  }
  // Largest remainder first; ties broken by stratum key for determinism.
  remainders.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  let leftover = target - assigned;
  for (const [key] of remainders) {
    if (leftover <= 0) break;
    if (alloc.get(key) < groups.get(key).length) {
      alloc.set(key, alloc.get(key) + 1);
      leftover--;
    }
  }

  const picked = [];
  for (const [key, arr] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    picked.push(...arr.slice(0, alloc.get(key)));
  }
  return picked;
}

const breaking = cases.filter(c => c.gold !== 'AUTO_MERGE');
const controls = cases.filter(c => c.gold === 'AUTO_MERGE');
const pickedBreaking = pickClass(breaking, PER_CLASS);
const pickedControls = pickClass(controls, PER_CLASS);
const subset = [...pickedBreaking, ...pickedControls];

// Deterministic order in the output file: by id.
subset.sort((a, b) => a.id.localeCompare(b.id));

fs.writeFileSync(OUT, subset.map(c => JSON.stringify(c)).join('\n') + '\n');

function distribution(list, field) {
  return list.reduce((acc, c) => {
    const v = field === 'gold' ? c.gold : String(c.splits?.[field] ?? 'unknown');
    acc[v] = (acc[v] ?? 0) + 1;
    return acc;
  }, {});
}
const fields = ['gold', 'repoDisjoint', 'timeOrder', 'packageFamily', 'updateType'];
const dist = {
  full: Object.fromEntries(fields.map(f => [f, distribution(cases, f)])),
  subset: Object.fromEntries(fields.map(f => [f, distribution(subset, f)])),
};

const meta = {
  createdAt: new Date().toISOString(),
  source: IN,
  perClass: PER_CLASS,
  total: subset.length,
  breaking: pickedBreaking.length,
  controls: pickedControls.length,
  method: 'deterministic proportional stratified sampling (largest remainder) over repoDisjoint x timeOrder x packageFamily x updateType, per class',
  ids: subset.map(c => c.id),
  distribution: dist,
};
fs.writeFileSync(META, JSON.stringify(meta, null, 2) + '\n');

console.log(JSON.stringify({ total: meta.total, breaking: meta.breaking, controls: meta.controls }, null, 2));
for (const f of fields) {
  console.log(`\n${f}:`);
  const keys = [...new Set([...Object.keys(dist.full[f]), ...Object.keys(dist.subset[f])])].sort();
  for (const k of keys) {
    const full = dist.full[f][k] ?? 0;
    const sub = dist.subset[f][k] ?? 0;
    console.log(`  ${k.padEnd(24)} full=${String(full).padStart(4)}  subset=${String(sub).padStart(4)}  (${((sub / subset.length) * 100).toFixed(1)}% vs ${((full / cases.length) * 100).toFixed(1)}%)`);
  }
}
console.error(`[subset] wrote ${subset.length} cases -> ${OUT}`);
console.error(`[subset] wrote ids -> ${META}`);

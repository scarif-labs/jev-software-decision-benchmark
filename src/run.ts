import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import type { DependencyCase, JudgeResult } from './types.js';
import { rulesBaseline } from './rules.js';
import { jevJudge } from './jev.js';
import { llmJudge, OPENROUTER_MODEL } from './llm.js';
import { mockJudge } from './mock.js';
import { coverageAtPrecision, evaluateAtThreshold, formatTable, selectSubset, summarize, type FixedThresholdResult, type Metrics } from './evaluate.js';

const DATASET = path.resolve(process.env.DATASET ?? 'data/dataset.jsonl');
const MOCK = process.env.MOCK === '1';
const OUTDIR = path.resolve(process.env.OUTDIR ?? (MOCK ? 'results-mock' : 'results'));
const REPORTDIR = path.resolve(process.env.REPORTDIR ?? (MOCK ? 'report-mock' : 'report'));
const LIMIT = process.env.LIMIT ? Number(process.env.LIMIT) : Infinity;
const TARGETS = (process.env.TARGETS ?? '0.99,0.995').split(',').map(Number);
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 3);

function loadEnv(file = '.env') {
  try {
    for (const line of fsSync.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* no .env */ }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

interface Judge {
  name: string;
  label: string;
  run: (c: DependencyCase) => Promise<JudgeResult>;
  enabled: boolean;
  mock?: boolean;
}

async function main() {
  loadEnv();
  const cases = (await fs.readFile(DATASET, 'utf8')).split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l) as DependencyCase).slice(0, LIMIT);
  const hasOpenRouter = Boolean(process.env.OPENROUTER_API_KEY);
  const hasTypeSafe = Boolean(process.env.TYPESAFE_API_KEY);
  const only = (process.env.JUDGES ?? '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  const want = (name: string) => only.length === 0 || only.includes(name);

  const judges: Judge[] = [
    { name: 'RULES', label: 'Static rules', run: async c => rulesBaseline(c), enabled: want('rules') },
    {
      name: 'OPENROUTER',
      label: MOCK ? `${OPENROUTER_MODEL} (MOCK)` : OPENROUTER_MODEL,
      run: MOCK ? mockJudge('OPENROUTER') : llmJudge,
      enabled: want('openrouter') && (hasOpenRouter || MOCK),
      mock: MOCK,
    },
    { name: 'JEV', label: MOCK ? 'Jev (MOCK)' : 'Jev 1.13', run: MOCK ? mockJudge('JEV') : jevJudge, enabled: want('jev') && (hasTypeSafe || MOCK), mock: MOCK },
  ];

  await fs.mkdir(OUTDIR, { recursive: true });
  await fs.mkdir(REPORTDIR, { recursive: true });

  console.log(`Dataset: ${DATASET}`);
  console.log(`Cases: ${cases.length} (breaking=${cases.filter(c => c.gold !== 'AUTO_MERGE').length}, control=${cases.filter(c => c.gold === 'AUTO_MERGE').length})`);
  console.log(`Mode: ${MOCK ? 'MOCK (synthetic, not a real result)' : 'LIVE'}`);
  if (!MOCK) {
    console.log(`OPENROUTER_API_KEY: ${hasOpenRouter ? 'set' : 'MISSING -> skipped'}`);
    console.log(`OPENROUTER_MODEL: ${OPENROUTER_MODEL}`);
    console.log(`TYPESAFE_API_KEY: ${hasTypeSafe ? 'set' : 'MISSING -> skipped'}`);
  }

  const rows: Metrics[] = [];
  const splitRows: Array<Record<string, unknown>> = [];
  const fixedRows: FixedThresholdResult[] = [];

  for (const judge of judges) {
    if (!judge.enabled) {
      console.log(`\n${judge.label}: skipped (no credentials)`);
      continue;
    }
    console.log(`\nRunning ${judge.label} on ${cases.length} cases...`);
    let done = 0;
    const results = await mapLimit(cases, CONCURRENCY, async c => {
      try {
        const r = await judge.run(c);
        return r;
      } catch (err) {
        return {
          status: 'error',
          decision: 'ERROR',
          probabilities: {},
          latencyMs: 0,
          error: String(err),
        } satisfies JudgeResult;
      } finally {
        if (++done % 50 === 0) process.stdout.write(`  ${done}/${cases.length}\n`);
      }
    });

    const errors = results.filter(r => r.error).length;
    await fs.writeFile(
      path.join(OUTDIR, `${judge.name}.jsonl`),
      results.map((r, i) => JSON.stringify({ id: cases[i].id, ...r })).join('\n') + '\n',
    );

    for (const target of TARGETS) {
      const point = coverageAtPrecision(cases, results, target);
      const row = summarize(judge.label, target, cases, results, point);
      rows.push(row);
    }

    // Split diagnostics at the 99% target.
    const splits: Array<[string, (c: DependencyCase) => boolean]> = [
      ['repo-disjoint test', c => c.splits?.repoDisjoint === 'test'],
      ['time-ordered holdout', c => c.splits?.timeOrder === 'holdout'],
      ['package-family stress', c => c.splits?.packageFamily === 'stress'],
      ['major', c => c.updateType === 'major'],
      ['minor', c => c.updateType === 'minor'],
      ['patch', c => c.updateType === 'patch'],
      ['direct', c => c.splits?.dependencyScope === 'direct'],
      ['transitive', c => c.splits?.dependencyScope === 'transitive'],
    ];
    for (const [name, pred] of splits) {
      const sub = selectSubset(cases, results, pred);
      if (sub.cases.length === 0) continue;
      const point = coverageAtPrecision(sub.cases, sub.results, 0.99);
      splitRows.push({ model: judge.label, split: name, n: sub.cases.length, coverage: point.coverage, precision: point.precision, unsafe: point.unsafe, autoMerged: point.autoMerged });
    }
    // Deployable evaluation: freeze a threshold on the development split, then apply
    // it once to the held-out split. Held-out labels are used only to score the
    // frozen policy, never to choose it.
    const calibrationSplits: Array<[string, (c: DependencyCase) => boolean, (c: DependencyCase) => boolean]> = [
      ['repo-disjoint', c => c.splits?.repoDisjoint === 'train', c => c.splits?.repoDisjoint === 'test'],
      ['time-ordered', c => c.splits?.timeOrder === 'train', c => c.splits?.timeOrder === 'holdout'],
    ];
    for (const [splitName, devPred, evalPred] of calibrationSplits) {
      const dev = selectSubset(cases, results, devPred);
      const ev = selectSubset(cases, results, evalPred);
      if (!dev.cases.length || !ev.cases.length) continue;
      for (const target of TARGETS) {
        const devPoint = coverageAtPrecision(dev.cases, dev.results, target);
        const held = evaluateAtThreshold(ev.cases, ev.results, devPoint.threshold);
        fixedRows.push({
          model: judge.label,
          split: splitName,
          targetPrecision: target,
          devThreshold: devPoint.threshold,
          devAutoMerges: devPoint.autoMerged,
          precision: held.precision,
          coverage: held.coverage,
          unsafe: held.unsafe,
          autoMerged: held.autoMerged,
          evaluable: held.evaluable,
          errors: held.errors,
        });
      }
    }
    console.log(`${judge.label}: done (${errors} errors)`);
  }

  const table = formatTable(rows);
  console.log('\n=== Oracle risk-coverage (retrospective: threshold selected on the same labels) ===');
  console.log(table);
  if (MOCK) console.log('\nWARNING: MOCK mode — numbers are synthetic and must not be reported.');

  console.log('\n=== Coverage at 99% precision by split ===');
  const splitHeader = ['model', 'split', 'n', 'coverage', 'precision', 'unsafe'];
  const splitLines = [splitHeader.join(' | '), splitHeader.map(() => '---').join(' | ')];
  for (const r of splitRows) {
    splitLines.push([r.model, r.split, r.n, `${((r.coverage as number) * 100).toFixed(1)}%`, `${((r.precision as number) * 100).toFixed(2)}%`, r.unsafe].join(' | '));
  }
  const splitTable = splitLines.join('\n');
  console.log(splitTable);

  const fixedHeader = ['model', 'split', 'target', 'frozen threshold', 'dev auto-merges', 'held-out precision', 'held-out coverage', 'unsafe merges', 'held-out evaluable', 'errors'];
  const fixedLines = [fixedHeader.join(' | '), fixedHeader.map(() => '---').join(' | ')];
  for (const r of fixedRows) {
    fixedLines.push([
      r.model,
      r.split,
      `${(r.targetPrecision * 100).toFixed(1)}%`,
      r.devThreshold.toFixed(4),
      String(r.devAutoMerges),
      `${(r.precision * 100).toFixed(2)}%`,
      `${(r.coverage * 100).toFixed(2)}%`,
      String(r.unsafe),
      String(r.evaluable),
      String(r.errors),
    ].join(' | '));
  }
  const fixedTable = fixedLines.join('\n');
  console.log('\n=== Fixed-threshold held-out (threshold frozen on development split) ===');
  console.log(fixedTable);

  const meta = {
    mode: MOCK ? 'mock' : 'live',
    dataset: DATASET,
    cases: cases.length,
    targets: TARGETS,
    generatedAt: new Date().toISOString(),
    openrouterModel: OPENROUTER_MODEL,
    typesafeModel: process.env.TYPESAFE_MODEL ?? 'jev-latest',
    missingCredentials: { openrouter: !hasOpenRouter, typesafe: !hasTypeSafe },
  };
  await fs.writeFile(path.join(REPORTDIR, 'table.json'), JSON.stringify({ meta, rows, splits: splitRows, fixedThreshold: fixedRows }, null, 2) + '\n');
  await fs.writeFile(path.join(REPORTDIR, 'table.md'), `# Results\n\n${JSON.stringify(meta, null, 2)}\n\n## Oracle risk-coverage (retrospective: threshold chosen on the same labels)\n\n${table}\n\n## Coverage at 99% precision by split\n\n${splitTable}\n\n## Fixed-threshold held-out (threshold frozen on the development split)\n\n${fixedTable}\n`);
  console.log(`\nWrote ${path.join(REPORTDIR, 'table.json')} and ${path.join(REPORTDIR, 'table.md')}`);
}

await main();

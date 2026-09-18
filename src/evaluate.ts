import type { DependencyCase, JudgeResult } from './types.js';

const SAFE: DependencyCase['gold'] = 'AUTO_MERGE';

export interface ThresholdPoint {
  threshold: number;
  autoMerged: number;
  coverage: number;
  precision: number;
  unsafe: number;
}

export interface Metrics extends ThresholdPoint {
  model: string;
  targetPrecision: number;
  n: number;
  evaluable: number;
  errors: number;
  reviewRecallOnBreaking: number;
  brier: number;
  ece: number;
  meanLatencyMs: number;
  p95LatencyMs: number;
  costUsdPer1k: number;
}

export const isSafe = (c: DependencyCase) => c.gold === SAFE;

/** A case is evaluable unless the adapter reported a hard error. Errors are never decisions. */
export const isEvaluable = (r: JudgeResult) => r.status !== 'error' && r.decision !== 'ERROR';

/**
 * The AUTO_MERGE score that the 99% / 99.5% precision threshold is applied to.
 *
 * The gate is structurally identical for every model: auto-merge a case iff
 * `decision === 'AUTO_MERGE'` AND `autoMergeScore >= threshold`. What differs is how
 * each adapter defines the score, and that difference is explicit here:
 *
 *  - JEV: `probabilities.AUTO_MERGE`, a calibrated probability over the Choice options.
 *  - OpenRouter / Nemotron: confidence in an AUTO_MERGE decision; `null` for every
 *    other decision. This is NOT a probability distribution and is never treated as one.
 *  - static rules: 1 for AUTO_MERGE, 0 otherwise.
 *
 * Because the threshold only ranks cases whose decision is AUTO_MERGE, the two models
 * are compared as selective predictors using their own stated certainty in the
 * AUTO_MERGE action. The scores are not claimed to share a calibration scale.
 */
export function autoMergeScore(r: JudgeResult): number | null {
  if (!isEvaluable(r)) return null;
  if (r.autoMergeScore !== undefined) return r.autoMergeScore;
  const p = r.probabilities.AUTO_MERGE;
  return typeof p === 'number' ? p : null;
}

/** Risk-coverage curve: for each auto-merge score threshold, precision and coverage. */
export function autoMergeCurve(cases: DependencyCase[], results: JudgeResult[]): ThresholdPoint[] {
  const evaluable = results.map((_, i) => i).filter(i => isEvaluable(results[i]));
  const n = evaluable.length;
  const candidates = evaluable
    .filter(i => results[i].decision === 'AUTO_MERGE')
    .map(i => ({ p: autoMergeScore(results[i]) ?? 0, safe: isSafe(cases[i]) }))
    .sort((a, b) => b.p - a.p);

  const thresholds = [...new Set(candidates.map(c => c.p)), 1.0000001].sort((a, b) => b - a);
  return thresholds.map(threshold => {
    const selected = candidates.filter(c => c.p >= threshold);
    const safe = selected.filter(c => c.safe).length;
    return {
      threshold,
      autoMerged: selected.length,
      coverage: n ? selected.length / n : 0,
      precision: selected.length ? safe / selected.length : 1,
      unsafe: selected.length - safe,
    };
  });
}

/** Highest coverage auto-merge policy whose precision is at least `target`. */
export function coverageAtPrecision(
  cases: DependencyCase[],
  results: JudgeResult[],
  target: number,
): ThresholdPoint {
  const feasible = autoMergeCurve(cases, results).filter(p => p.autoMerged > 0 && p.precision >= target);
  if (feasible.length === 0) {
    return { threshold: 1, autoMerged: 0, coverage: 0, precision: 1, unsafe: 0 };
  }
  return feasible.reduce((best, p) => (p.coverage > best.coverage ? p : best));
}

function evaluableIndexes(results: JudgeResult[]): number[] {
  return results.map((_, i) => i).filter(i => isEvaluable(results[i]));
}

/**
 * Apply a frozen threshold to a set of cases. Used for the deployable held-out
 * evaluation: the threshold is selected on the development split and applied once,
 * unchanged, to the held-out split.
 */
export function evaluateAtThreshold(
  cases: DependencyCase[],
  results: JudgeResult[],
  threshold: number,
): ThresholdPoint & { evaluable: number; errors: number } {
  const idx = evaluableIndexes(results);
  const n = idx.length;
  const selected = idx.filter(
    i => results[i].decision === 'AUTO_MERGE' && (autoMergeScore(results[i]) ?? Number.NEGATIVE_INFINITY) >= threshold,
  );
  const safe = selected.filter(i => isSafe(cases[i])).length;
  return {
    threshold,
    autoMerged: selected.length,
    coverage: n ? selected.length / n : 0,
    precision: selected.length ? safe / selected.length : 1,
    unsafe: selected.length - safe,
    evaluable: n,
    errors: cases.length - n,
  };
}

export interface FixedThresholdResult {
  model: string;
  split: string;
  targetPrecision: number;
  devThreshold: number;
  devAutoMerges: number;
  precision: number;
  coverage: number;
  unsafe: number;
  autoMerged: number;
  evaluable: number;
  errors: number;
}

/** Binary Brier score on the AUTO_MERGE score. Lower is better. */
export function brier(cases: DependencyCase[], results: JudgeResult[]): number {
  const idx = evaluableIndexes(results);
  if (!idx.length) return 0;
  return idx.reduce((s, i) => s + ((autoMergeScore(results[i]) ?? 0) - (isSafe(cases[i]) ? 1 : 0)) ** 2, 0) / idx.length;
}

/** Expected calibration error of the AUTO_MERGE score in equal-width bins. */
export function ece(cases: DependencyCase[], results: JudgeResult[], bins = 10): number {
  const idx = evaluableIndexes(results);
  if (!idx.length) return 0;
  let err = 0;
  for (let b = 0; b < bins; b++) {
    const lo = b / bins;
    const hi = (b + 1) / bins;
    const bucket = idx.filter(i => {
      const p = autoMergeScore(results[i]) ?? 0;
      return p >= lo && (b === bins - 1 ? p <= hi : p < hi);
    });
    if (!bucket.length) continue;
    const meanP = bucket.reduce((s, i) => s + (autoMergeScore(results[i]) ?? 0), 0) / bucket.length;
    const meanY = bucket.reduce((s, i) => s + (isSafe(cases[i]) ? 1 : 0), 0) / bucket.length;
    err += (bucket.length / idx.length) * Math.abs(meanP - meanY);
  }
  return err;
}

function percentile(values: number[], q: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil(q * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, rank))];
}

export function summarize(
  model: string,
  targetPrecision: number,
  cases: DependencyCase[],
  results: JudgeResult[],
  point: ThresholdPoint,
): Metrics {
  const idx = evaluableIndexes(results);
  const n = idx.length;
  const breaking = idx.filter(i => !isSafe(cases[i])).length;
  const reviewed = idx.filter(i => !isSafe(cases[i]) && results[i].decision !== 'AUTO_MERGE').length;
  const latencies = idx.map(i => results[i].latencyMs);
  const totalCost = idx.reduce((s, i) => s + (results[i].costUsd ?? 0), 0);
  return {
    model,
    targetPrecision,
    n: cases.length,
    evaluable: n,
    errors: cases.length - n,
    ...point,
    reviewRecallOnBreaking: breaking ? reviewed / breaking : 0,
    brier: brier(cases, results),
    ece: ece(cases, results),
    meanLatencyMs: latencies.reduce((s, x) => s + x, 0) / Math.max(1, latencies.length),
    p95LatencyMs: percentile(latencies, 0.95),
    costUsdPer1k: n ? (totalCost / n) * 1000 : 0,
  };
}

export function selectSubset(
  cases: DependencyCase[],
  results: JudgeResult[],
  predicate: (c: DependencyCase) => boolean,
): { cases: DependencyCase[]; results: JudgeResult[] } {
  const cs: DependencyCase[] = [];
  const rs: JudgeResult[] = [];
  cases.forEach((c, i) => {
    if (predicate(c)) {
      cs.push(c);
      rs.push(results[i]);
    }
  });
  return { cases: cs, results: rs };
}

export function formatTable(rows: Metrics[]): string {
  const header = [
    'model',
    'target precision',
    'achieved precision',
    'coverage',
    'unsafe merges',
    'review recall',
    'evaluable',
    'errors',
    'mean latency ms',
    'p95 latency ms',
    'cost / 1k USD',
  ];
  const lines = [header.join(' | '), header.map(() => '---').join(' | ')];
  for (const r of rows) {
    lines.push([
      r.model,
      `${(r.targetPrecision * 100).toFixed(1)}%`,
      `${(r.precision * 100).toFixed(2)}%`,
      `${(r.coverage * 100).toFixed(2)}%`,
      String(r.unsafe),
      `${(r.reviewRecallOnBreaking * 100).toFixed(1)}%`,
      String(r.evaluable),
      String(r.errors),
      r.meanLatencyMs.toFixed(0),
      r.p95LatencyMs.toFixed(0),
      r.costUsdPer1k.toFixed(4),
    ].join(' | '));
  }
  return lines.join('\n');
}

import type { CanonicalDecision, DependencyCase, JudgeResult } from './types.js';

const LABELS: CanonicalDecision[] = ['AUTO_MERGE', 'HOLD', 'REQUIRE_REVIEW'];

export function normalizeProbabilities(
  raw: Partial<Record<string, number>> | undefined,
  fallback: CanonicalDecision,
): Record<CanonicalDecision, number> {
  const p = {
    AUTO_MERGE: Number(raw?.AUTO_MERGE ?? 0),
    HOLD: Number(raw?.HOLD ?? 0),
    REQUIRE_REVIEW: Number(raw?.REQUIRE_REVIEW ?? 0),
  };
  const sum = p.AUTO_MERGE + p.HOLD + p.REQUIRE_REVIEW;
  if (!(sum > 0)) {
    return { AUTO_MERGE: fallback === 'AUTO_MERGE' ? 1 : 0, HOLD: fallback === 'HOLD' ? 1 : 0, REQUIRE_REVIEW: fallback === 'REQUIRE_REVIEW' ? 1 : 0 };
  }
  return { AUTO_MERGE: p.AUTO_MERGE / sum, HOLD: p.HOLD / sum, REQUIRE_REVIEW: p.REQUIRE_REVIEW / sum };
}

export function argmax(p: Record<CanonicalDecision, number>): CanonicalDecision {
  return LABELS.reduce((best, d) => (p[d] > p[best] ? d : best), LABELS[0]);
}

/**
 * Static Renovate-style policy baseline. Deliberately simple and auditable:
 * merge only non-major, non-security updates with green pre-merge checks.
 */
export function rulesBaseline(c: DependencyCase): JudgeResult {
  const started = performance.now();
  const checks = c.checks ?? '';
  const checksFail = /fail|cancel|error|pending|still running/i.test(checks);
  const checksGreen = /pass|success/i.test(checks) && !checksFail;
  const major = c.updateType?.toLowerCase() === 'major';

  let decision: CanonicalDecision;
  if (c.securityUpdate || major || checksFail) decision = 'REQUIRE_REVIEW';
  else if (checksGreen) decision = 'AUTO_MERGE';
  else decision = 'HOLD';

  return {
    decision,
    status: 'ok',
    probabilities: normalizeProbabilities(undefined, decision),
    autoMergeScore: decision === 'AUTO_MERGE' ? 1 : 0,
    latencyMs: performance.now() - started,
    costUsd: 0,
  };
}

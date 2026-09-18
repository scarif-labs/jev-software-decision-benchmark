import type { CanonicalDecision, DependencyCase, JudgeResult } from './types.js';
import { normalizeProbabilities } from './rules.js';

/**
 * Deterministic stand-in for a model, used ONLY to smoke-test the harness when no
 * API key is present (MOCK=1). It reads pre-merge fields only, but its "probabilities"
 * are synthetic and must never be reported as a benchmark result.
 */
export function mockJudge(name: string) {
  return async (c: DependencyCase): Promise<JudgeResult> => {
    const started = performance.now();
    let score = 0.5;
    if (c.updateType === 'major') score -= 0.3;
    if (c.updateType === 'patch') score += 0.2;
    if (c.updateType === 'minor') score += 0.1;
    if (c.securityUpdate) score -= 0.2;
    if (/pass|success/i.test(c.checks ?? '')) score += 0.15;
    if (/fail|error/i.test(c.checks ?? '')) score -= 0.3;
    if (/break|remov|deprecat|migrat/i.test(c.changelog ?? '')) score -= 0.2;
    // Deterministic jitter from the case id (harness smoke test only).
    let h = 0;
    for (const ch of c.id) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0;
    score += ((h >>> 0) % 1000) / 1000 * 0.1 - 0.05;
    score = Math.max(0.01, Math.min(0.99, score));

    const decision: CanonicalDecision = score >= 0.6 ? 'AUTO_MERGE' : score >= 0.4 ? 'HOLD' : 'REQUIRE_REVIEW';
    return {
      decision,
      status: 'ok',
      probabilities: normalizeProbabilities(
        { AUTO_MERGE: score, HOLD: (1 - score) * 0.5, REQUIRE_REVIEW: (1 - score) * 0.5 },
        decision,
      ),
      autoMergeScore: decision === 'AUTO_MERGE' ? score : null,
      latencyMs: performance.now() - started,
      usage: { inputTokens: 400, outputTokens: 30 },
      costUsd: name === 'JEV' ? 400 * 42e-9 : 400 * 0.15e-6 + 30 * 0.6e-6,
      raw: { mock: true },
    };
  };
}

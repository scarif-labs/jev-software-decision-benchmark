export type GoldLabel = 'AUTO_MERGE' | 'HOLD' | 'REQUIRE_REVIEW';
/** Labels the evaluator reasons about. HUMAN_REVIEW is treated as "not auto-merge". */
export type CanonicalDecision = 'AUTO_MERGE' | 'HOLD' | 'REQUIRE_REVIEW';
export type Decision = CanonicalDecision | 'HUMAN_REVIEW' | 'ERROR';

export interface Outcome {
  merged: boolean;
  mergedAt?: string | null;
  createdAt?: string | null;
  /** Pre-merge CI state of the head commit. Allowed as model input via `checks`. */
  checkState?: string;
  ciPassedBeforeMerge?: boolean;
  headSha?: string | null;
  baseRef?: string | null;
  labels?: string[];
  /** Ground-truth-only fields. Never sent to a model. */
  failureCategory?: string | null;
  reverted?: boolean;
  versionState?: string;
  appliedAtHead?: string;
  appliedVersion?: string | null;
  revertCommits?: string[];
}

export interface Splits {
  repoDisjoint: 'train' | 'test';
  timeOrder: 'train' | 'holdout' | 'unknown';
  packageFamily: 'stress' | 'rest';
  updateType: string;
  dependencyScope: 'direct' | 'transitive' | 'unknown';
}

export interface DependencyCase {
  id: string;
  dataset: 'breaking' | 'control' | string;
  repo: string;
  ecosystem: string;
  packageManager?: string;
  dependency?: string;
  previousVersion?: string;
  newVersion?: string;
  updateType?: string;
  scope?: string;
  dependencySection?: string;
  directDependency?: boolean;
  securityUpdate?: boolean;
  title?: string;
  body?: string;
  manifestDiff?: string;
  changelog?: string;
  checks?: string;
  source: string;
  gold: GoldLabel;
  verificationTier?: string;
  outcome?: Outcome;
  splits?: Splits;
}

export interface JudgeResult {
  decision: Decision;
  status?: 'ok' | 'error';
  probabilities: Partial<Record<Decision, number>>;
  /**
   * Adapter-defined score for the AUTO_MERGE action, consumed by src/evaluate.ts.
   * JEV: probability of the AUTO_MERGE choice. OpenRouter: confidence in an
   * AUTO_MERGE decision, or null for any other decision.
   */
  autoMergeScore?: number | null;
  latencyMs: number;
  usage?: { inputTokens: number; outputTokens: number };
  costUsd?: number;
  risk?: string;
  confidence?: number;
  raw?: unknown;
  error?: string;
}

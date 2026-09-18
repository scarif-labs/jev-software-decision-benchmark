import { choice, TypeSafeClient, type EntryType } from '@typesafe-ai/sdk';
import { CRITERIA, decisionState, instruction } from './prompt.js';
import type { CanonicalDecision, DependencyCase, JudgeResult } from './types.js';
import { normalizeProbabilities } from './rules.js';

// Jev 1.13 pricing: $42 per billion input tokens, output tokens are free.
const USD_PER_INPUT_TOKEN = Number(process.env.JEV_USD_PER_BTOK ?? 42) / 1e9;

let client: TypeSafeClient | undefined;
function getClient(): TypeSafeClient {
  if (!client) client = new TypeSafeClient();
  return client;
}

export async function jevJudge(c: DependencyCase): Promise<JudgeResult> {
  const started = performance.now();
  const response = await getClient().systemOne({
    state: decisionState(c) as EntryType,
    questions: {
      decision: choice(instruction, CRITERIA),
    },
  });

  const answer = response.answers.decision;
  const decision = (answer.choice ?? 'REQUIRE_REVIEW') as CanonicalDecision;
  const probabilities = normalizeProbabilities(answer.probabilities as unknown as Partial<Record<string, number>>, decision);
  const inputTokens = response.usage?.input_tokens ?? 0;
  const outputTokens = response.usage?.output_tokens ?? 0;

  return {
    decision,
    status: 'ok',
    probabilities,
    autoMergeScore: probabilities.AUTO_MERGE,
    latencyMs: performance.now() - started,
    usage: { inputTokens, outputTokens },
    costUsd: inputTokens * USD_PER_INPUT_TOKEN,
    raw: answer,
  };
}

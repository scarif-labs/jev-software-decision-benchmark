import OpenAI from 'openai';
import { instruction } from './prompt.js';
import { decisionStateJson } from './prompt.js';
import type { CanonicalDecision, DependencyCase, JudgeResult } from './types.js';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
export const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL ?? '~deepseek/deepseek-flash-latest';

// The :free model costs nothing. Kept configurable so a paid variant can be costed.
const USD_PER_INPUT_TOKEN = Number(process.env.OPENROUTER_USD_PER_MTOK_IN ?? 0) / 1e6;
const USD_PER_OUTPUT_TOKEN = Number(process.env.OPENROUTER_USD_PER_MTOK_OUT ?? 0) / 1e6;

const MAX_ATTEMPTS = Number(process.env.OPENROUTER_MAX_ATTEMPTS ?? 3);
const BASE_BACKOFF_MS = Number(process.env.OPENROUTER_BACKOFF_MS ?? 2000);

const DECISION_ENUM = ['AUTO_MERGE', 'HOLD', 'HUMAN_REVIEW'] as const;
const RISK_ENUM = ['LOW', 'MEDIUM', 'HIGH'] as const;

let client: OpenAI | undefined;
function getClient(): OpenAI {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set');
  if (!client) {
    client = new OpenAI({
      apiKey,
      baseURL: OPENROUTER_BASE_URL,
      defaultHeaders: {
        'HTTP-Referer': process.env.OPENROUTER_REFERER ?? 'https://localhost',
        'X-Title': process.env.OPENROUTER_TITLE ?? 'jev-dependency-benchmark',
      },
    });
  }
  return client;
}

const jsonSchema = {
  name: 'dependency_decision',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      decision: { type: 'string', enum: [...DECISION_ENUM] },
      risk: { type: 'string', enum: [...RISK_ENUM] },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
    },
    required: ['decision', 'risk', 'confidence'],
  },
} as const;

/**
 * The decision task is identical to the JEV one and the state is byte-identical;
 * only the label spelling differs (HUMAN_REVIEW vs the JEV adapter's REQUIRE_REVIEW)
 * because that is the schema requested for this baseline.
 */
const llmInstruction = `${instruction}

Respond with JSON matching the required schema:
- decision: AUTO_MERGE, HOLD, or HUMAN_REVIEW. HUMAN_REVIEW is the human-review action referred to above as REQUIRE_REVIEW.
- risk: LOW, MEDIUM, or HIGH, your assessment of the update's breaking/behavioural risk.
- confidence: your confidence in the decision, from 0 to 1.`;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Only transient HTTP failures and malformed/missing-choice responses are retried. */
function isRetryable(err: unknown): boolean {
  const status = (err as { status?: number } | undefined)?.status;
  if (status === 429) return true;
  if (typeof status === 'number' && status >= 500) return true;
  if (err instanceof OpenAI.APIConnectionError) return true;
  const msg = String((err as Error)?.message ?? '');
  return /no choices|missing choices|non-JSON|schema violation|ECONNRESET|ETIMEDOUT|fetch failed|socket hang up/i.test(msg);
}

export async function llmJudge(c: DependencyCase): Promise<JudgeResult> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await callOnce(c);
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err) || attempt === MAX_ATTEMPTS) break;
      const delay = BASE_BACKOFF_MS * 2 ** (attempt - 1) + Math.floor(Math.random() * 250);
      console.error(
        `[openrouter] attempt ${attempt}/${MAX_ATTEMPTS} failed for ${c.id}: ${String((err as Error).message).slice(0, 140)}; retrying in ${delay}ms`,
      );
      await sleep(delay);
    }
  }
  throw lastErr;
}

async function callOnce(c: DependencyCase): Promise<JudgeResult> {
  const started = performance.now();
  const request = {
    model: OPENROUTER_MODEL,
    temperature: 0,
    messages: [
      { role: 'system', content: llmInstruction },
      { role: 'user', content: decisionStateJson(c) },
    ],
    response_format: { type: 'json_schema', json_schema: jsonSchema },
    // OpenRouter unified reasoning control. DeepSeek Flash enables reasoning by
    // default and it dominates output tokens; this benchmark tests decision quality,
    // not chain-of-thought generation.
    reasoning: { enabled: false },
  };
  const response = await getClient().chat.completions.create(request as never);

  // A 200 response can still omit `choices` (e.g. an upstream provider error payload).
  // Capture the raw body and treat it as transient, never as a decision.
  const choices = (response as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    let raw: string;
    try {
      raw = JSON.stringify(response);
    } catch {
      raw = String(response);
    }
    throw new Error(`OpenRouter response has no choices. Raw body: ${raw.slice(0, 2000)}`);
  }

  const content = (choices[0] as { message?: { content?: string } })?.message?.content ?? '';
  let parsed: { decision?: unknown; risk?: unknown; confidence?: unknown };
  try {
    parsed = JSON.parse(content) as typeof parsed;
  } catch (err) {
    throw new Error(`OpenRouter returned non-JSON content: ${String(err)} :: ${content.slice(0, 200)}`);
  }

  const problems: string[] = [];
  if (!DECISION_ENUM.includes(parsed.decision as (typeof DECISION_ENUM)[number])) {
    problems.push(`decision=${JSON.stringify(parsed.decision)}`);
  }
  if (!RISK_ENUM.includes(parsed.risk as (typeof RISK_ENUM)[number])) {
    problems.push(`risk=${JSON.stringify(parsed.risk)}`);
  }
  const confidence = Number(parsed.confidence);
  if (!(confidence >= 0 && confidence <= 1)) {
    problems.push(`confidence=${JSON.stringify(parsed.confidence)}`);
  }
  if (problems.length) {
    throw new Error(`OpenRouter schema violation: ${problems.join(', ')} :: ${content.slice(0, 200)}`);
  }

  const decision = parsed.decision as string;
  const inputTokens = response.usage?.prompt_tokens ?? 0;
  const outputTokens = response.usage?.completion_tokens ?? 0;
  // OpenRouter reports the authoritative charge on usage.cost (the resolved model's
  // price can differ from the alias listing). Fall back to configured pricing.
  const providerCost = (response.usage as { cost?: number } | undefined)?.cost;

  // Explicit mapping contract (documented in src/evaluate.ts): this adapter does NOT
  // emit a probability distribution. Its AUTO_MERGE score is the model's confidence in
  // an AUTO_MERGE decision, and is null for every other decision. `probabilities` is
  // intentionally empty so nothing downstream can mistake confidence for a distribution.
  const autoMergeScore = decision === 'AUTO_MERGE' ? confidence : null;

  return {
    status: 'ok',
    decision: decision as JudgeResult['decision'],
    probabilities: {},
    autoMergeScore,
    latencyMs: performance.now() - started,
    usage: { inputTokens, outputTokens },
    costUsd: typeof providerCost === 'number' ? providerCost : inputTokens * USD_PER_INPUT_TOKEN + outputTokens * USD_PER_OUTPUT_TOKEN,
    risk: parsed.risk as string,
    confidence,
    raw: {
      ...parsed,
      model: response.model,
      reasoning: (choices[0] as { message?: { reasoning?: string } })?.message?.reasoning,
    },
  };
}

// Keep the label set in sync with the JEV canonical decisions for readability.
export type OpenRouterDecision = CanonicalDecision | 'HUMAN_REVIEW';

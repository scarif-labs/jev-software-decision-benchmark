// Projected token/cost estimate from the exact state projection, without calling any API.
import fs from 'node:fs';
import { decisionState } from '../src/prompt.js';
import type { DependencyCase } from '../src/types.js';

const cases = fs.readFileSync('data/dataset.jsonl', 'utf8').split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l) as DependencyCase);
const lens = cases.map(c => JSON.stringify(decisionState(c)).length).sort((a, b) => a - b);
const avgChars = lens.reduce((s, x) => s + x, 0) / lens.length;
const p95Chars = lens[Math.floor(lens.length * 0.95)];
const avgTokens = avgChars / 4;
const p95Tokens = p95Chars / 4;
const OUTPUT_TOKENS = 30;

const jev = avgTokens * 1000 * (42 / 1e9);
const openai = avgTokens * 1000 * (0.15 / 1e6) + OUTPUT_TOKENS * 1000 * (0.6 / 1e6);

console.log(JSON.stringify({
  cases: cases.length,
  avgStateChars: Math.round(avgChars),
  p95StateChars: p95Chars,
  avgInputTokensApprox: Math.round(avgTokens),
  p95InputTokensApprox: Math.round(p95Tokens),
  projectedJevCostPer1kUsd: Number(jev.toFixed(4)),
  projectedOpenAICostPer1kUsd: Number(openai.toFixed(4)),
}, null, 2));

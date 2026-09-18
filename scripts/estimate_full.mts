// Estimate the full-dataset DeepSeek cost using the observed 200-case run rates and
// the actual state sizes of the full vs subset datasets. No API calls.
import fs from 'node:fs';
import { decisionState } from '../src/prompt.js';
import type { DependencyCase } from '../src/types.js';

const read = (f: string) => fs.readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l) as DependencyCase);
const full = read('data/dataset.jsonl');
const sub = read('data/subset200.jsonl');
const chars = (list: DependencyCase[]) => list.map(c => JSON.stringify(decisionState(c)).length);
const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

const fullChars = avg(chars(full));
const subChars = avg(chars(sub));
const sizeRatio = fullChars / subChars;

// Observed from the 200-case run (provider-reported cost).
const obsCases = 200;
const obsInTok = 525184;
const obsOutTok = 5905;
const obsCost = 0.1352;

const perCaseIn = obsInTok / obsCases;
const perCaseOut = obsOutTok / obsCases;
const estIn = perCaseIn * sizeRatio * full.length;
const estOut = perCaseOut * sizeRatio * full.length;
const blendedCostPerTok = obsCost / (obsInTok + obsOutTok);
const linearCost = (obsCost / obsCases) * full.length;
const tokenScaledCost = (estIn + estOut) * blendedCostPerTok;
// Conservative upper bound at the resolved model's list pricing ($0.30 / $1.20 per Mtok).
const listPriceCost = (estIn * 0.3) / 1e6 + (estOut * 1.2) / 1e6;

console.log(JSON.stringify({
  fullCases: full.length,
  subsetCases: sub.length,
  avgStateCharsFull: Math.round(fullChars),
  avgStateCharsSubset: Math.round(subChars),
  sizeRatioFullOverSubset: Number(sizeRatio.toFixed(3)),
  observed200: { inputTokens: obsInTok, outputTokens: obsOutTok, costUsd: obsCost },
  estimatedFull: {
    cases: full.length,
    inputTokens: Math.round(estIn),
    outputTokens: Math.round(estOut),
    linearCostUsd: Number(linearCost.toFixed(4)),
    tokenScaledCostUsd: Number(tokenScaledCost.toFixed(4)),
    listPriceUpperBoundUsd: Number(listPriceCost.toFixed(4)),
  },
}, null, 2));

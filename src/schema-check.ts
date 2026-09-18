import fs from 'node:fs';
import type { DependencyCase } from './types.js';
import { CRITERIA, decisionState } from './prompt.js';
import { auditCase } from './audit.js';

const keys = Object.keys(CRITERIA).sort().join(',');
if (keys !== 'AUTO_MERGE,HOLD,REQUIRE_REVIEW') throw new Error(`Bad choice criteria: ${keys}`);

const dataset = process.env.DATASET ?? 'data/dataset.jsonl';
if (fs.existsSync(dataset)) {
  const cases = fs.readFileSync(dataset, 'utf8').split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l) as DependencyCase);
  const bad = cases.map(auditCase).filter(a => a.extraTopLevel.length || a.reattachedKeys.length || a.tokenHits.length);
  if (bad.length) {
    console.error(`Leakage audit failed on ${bad.length} cases`);
    console.error(JSON.stringify(bad.slice(0, 3), null, 2));
    process.exit(1);
  }
  const sample = decisionState(cases[0]);
  console.log('Decision schema OK');
  console.log('State top-level fields:', Object.keys(sample).join(', '));
  console.log(`Leakage audit passed on ${cases.length} cases`);
} else {
  console.log('Decision schema OK (no dataset found, skipped leakage audit)');
}

// Step 4: leakage audit. Verifies that the exact object sent to a model contains no
// post-merge / gold-derived information, and flags any field that separates the two
// classes perfectly (which would make the benchmark trivial or circular).
//
// Run: npm run audit
import fs from 'node:fs';
import path from 'node:path';
import type { DependencyCase } from './types.js';
import { decisionState } from './prompt.js';

export const STATE_TOP_LEVEL = ['project', 'update', 'pullRequest', 'dependencyReleaseNotes', 'preMergeChecks'];

const FORBIDDEN_KEYS = [
  'gold', 'outcome', 'dataset', 'source', 'verificationTier', 'failureCategory',
  'breakingCommit', 'reverted', 'versionState', 'appliedAtHead', 'appliedVersion',
  'merged', 'mergedAt', 'ciPassedBeforeMerge', 'revertCommits', 'splits', 'checkState',
];

// Tokens that only exist in outcome metadata. `breaking`/`control` are deliberately
// excluded because release notes legitimately say "breaking change".
const FORBIDDEN_TOKENS = [
  'COMPILATION_FAILURE', 'TEST_FAILURE', 'ENFORCER_FAILURE', 'DEPENDENCY_LOCK_FAILURE',
  'WERROR_FAILURE', 'DEPENDENCY_RESOLUTION_FAILURE', 'bump-', 'ctrl-',
];

type Leaf = [path: string, value: string | null];

function flatten(obj: unknown, prefix = '', out: Leaf[] = []): Leaf[] {
  if (obj === null || typeof obj !== 'object') {
    out.push([prefix, obj === null || obj === undefined ? null : String(obj)]);
    return out;
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) flatten(v, p, out);
    else if (Array.isArray(v)) out.push([p, JSON.stringify(v)]);
    else out.push([p, v === null || v === undefined ? null : String(v)]);
  }
  return out;
}

export interface CaseAudit {
  id: string;
  topLevel: string[];
  extraTopLevel: string[];
  reattachedKeys: string[];
  tokenHits: string[];
}

export function auditCase(c: DependencyCase): CaseAudit {
  const state = decisionState(c) as unknown as Record<string, unknown>;
  const json = JSON.stringify(state);
  const topLevel = Object.keys(state);
  const allLeaves = flatten(state);
  return {
    id: c.id,
    topLevel,
    extraTopLevel: topLevel.filter(k => !STATE_TOP_LEVEL.includes(k)),
    reattachedKeys: allLeaves.map(l => l[0]).flatMap(p => {
      const last = p.split('.').pop() ?? '';
      return FORBIDDEN_KEYS.includes(last) ? [p] : [];
    }),
    tokenHits: FORBIDDEN_TOKENS.filter(t => json.includes(t)),
  };
}

export function runAudit(cases: DependencyCase[]) {
  const perCase = cases.map(auditCase);

  // Field-level per-class separation on the flattened state object.
  const paths = new Map<string, Map<string, { breaking: number; control: number }>>();
  for (const c of cases) {
    const safe = c.gold === 'AUTO_MERGE';
    for (const [p, v] of flatten(decisionState(c) as unknown as Record<string, unknown>)) {
      const key = `${p}=${v ?? '<absent>'}`;
      if (!paths.has(p)) paths.set(p, new Map());
      const m = paths.get(p)!;
      if (!m.has(key)) m.set(key, { breaking: 0, control: 0 });
      const e = m.get(key)!;
      if (safe) e.control++;
      else e.breaking++;
    }
  }

  const separationFindings: Array<Record<string, unknown>> = [];
  for (const [p, values] of paths) {
    for (const [key, count] of values) {
      const total = count.breaking + count.control;
      if (total < 15) continue;
      const purity = Math.max(count.breaking, count.control) / total;
      if (purity === 1) {
        separationFindings.push({ field: p, value: key, total, breaking: count.breaking, control: count.control, purity });
      }
    }
  }
  separationFindings.sort((a, b) => (b.total as number) - (a.total as number));

  const leakageFailures = perCase.filter(c => c.extraTopLevel.length || c.reattachedKeys.length || c.tokenHits.length);

  const report = {
    cases: cases.length,
    stateTopLevel: STATE_TOP_LEVEL,
    forbiddenKeyViolations: leakageFailures.map(c => ({ id: c.id, extraTopLevel: c.extraTopLevel, reattachedKeys: c.reattachedKeys })),
    forbiddenTokenViolations: perCase.filter(c => c.tokenHits.length).map(c => ({ id: c.id, tokenHits: c.tokenHits })),
    perfectSeparators: separationFindings.slice(0, 50),
    perfectSeparatorCount: separationFindings.length,
    verdict: leakageFailures.length === 0 ? 'PASS: no outcome-derived field reaches the model' : 'FAIL',
  };
  return report;
}

function main() {
  const file = path.resolve(process.env.DATASET ?? 'data/dataset.jsonl');
  const cases = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l) as DependencyCase);
  const report = runAudit(cases);
  fs.mkdirSync('data', { recursive: true });
  fs.writeFileSync('data/leakage-report.json', JSON.stringify(report, null, 2) + '\n');

  console.log(`leakage audit: ${report.verdict}`);
  console.log(`cases audited: ${report.cases}`);
  console.log(`top-level state fields: ${report.stateTopLevel.join(', ')}`);
  console.log(`forbidden-key violations: ${report.forbiddenKeyViolations.length}`);
  console.log(`forbidden-token violations: ${report.forbiddenTokenViolations.length}`);
  console.log(`perfect class separators in model input: ${report.perfectSeparatorCount}`);
  for (const s of report.perfectSeparators.slice(0, 20)) {
    console.log(`  [SEPARATOR] ${s.field} = ${String(s.value).slice(0, 80)}  (breaking=${s.breaking}, control=${s.control})`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();

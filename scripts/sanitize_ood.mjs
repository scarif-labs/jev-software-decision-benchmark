// Sanitize the OOD dataset against outcome leakage.
//
// The revert-seed approach can resolve to the revert PR itself (not the original bump PR),
// which can put revert-oriented outcome wording in the model-visible title/body and the
// revert diff in the manifest. This script:
//   - drops controls that are revert PRs,
//   - rewrites leaky breaking cases to a synthesized pre-merge bump title, removes the
//     revert body, and re-inverts the manifest diff when it came from a revert PR,
//   - records what changed.
import fs from 'node:fs';

const FILE = process.env.IN ?? 'data/ood-dataset.jsonl';
const OUT = process.env.OUT ?? FILE;
const cases = fs.readFileSync(FILE, 'utf8').split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l));

const TITLE_LEAK = /revert|brok|fail|regress|downgrad|rollback|roll back|deploy(ment)? (error|fail)/i;
const BODY_REVERT = /this reverts|reverts commit|\brevert(ed)?\b[^.]*\b(bump|update|pr|merge)\b/i;

function invertPatch(patch) {
  if (!patch) return patch;
  return patch
    .split('\n')
    .filter(l => !l.startsWith('@@'))
    .map(l => (l.startsWith('+++') || l.startsWith('---') ? l : l.startsWith('+') ? '-' + l.slice(1) : l.startsWith('-') ? '+' + l.slice(1) : l))
    .join('\n');
}
function synthTitle(c) {
  const dep = c.dependency ?? 'dependency';
  return c.previousVersion && c.previousVersion !== c.newVersion
    ? `build(deps): bump ${dep} from ${c.previousVersion} to ${c.newVersion}`
    : `build(deps): update ${dep} to ${c.newVersion}`;
}

const kept = [];
const dropped = [];
const sanitized = [];
for (const c of cases) {
  const title = c.title ?? '';
  const body = c.body ?? '';
  const leaky = TITLE_LEAK.test(title) || BODY_REVERT.test(body);
  if (!leaky) { kept.push(c); continue; }

  if (c.gold === 'AUTO_MERGE') {
    dropped.push({ id: c.id, repo: c.repo, title });
    continue;
  }
  const wasResolved = Boolean(c.verification?.originalPrResolved);
  c.title = synthTitle(c);
  delete c.body;
  // A resolved-but-leaky case came from a revert PR, so its stored manifest diff is the
  // revert (new->old); invert it back to the original bump (old->new).
  if (wasResolved) c.manifestDiff = invertPatch(c.manifestDiff);
  c.verification = { ...(c.verification ?? {}), originalPrResolved: false, sanitized: 'leaky title/body replaced with synthesized pre-merge state' };
  sanitized.push({ id: c.id, oldTitle: title, newTitle: c.title, invertedDiff: wasResolved });
  kept.push(c);
}

fs.writeFileSync(OUT, kept.map(c => JSON.stringify(c)).join('\n') + '\n');
console.log(JSON.stringify({
  input: cases.length,
  kept: kept.length,
  droppedControls: dropped.length,
  sanitizedBreaking: sanitized.length,
  droppedIds: dropped.map(d => d.id),
  sanitizedIds: sanitized.map(s => s.id),
  keptBreaking: kept.filter(c => c.gold !== 'AUTO_MERGE').length,
  keptControl: kept.filter(c => c.gold === 'AUTO_MERGE').length,
}, null, 2));

// Post-verify controls: confirm the bump was actually applied on the PR head commit.
// The version string is taken from the diff itself (the added line), which is the
// literal value that landed, rather than the display version from the PR title.
// Only controls where the added value is definitively absent from the head manifest
// are dropped; cases that cannot be read are kept and marked `unknown`.
import path from 'node:path';
import { gh, mapLimit, readJsonl, writeJsonl } from './lib/gh.mjs';

const FILE = path.resolve(process.env.IN ?? 'data/control.cases.jsonl');
const OUT = path.resolve(process.env.OUT ?? FILE);
const DROPPED = path.resolve(process.env.DROPPED ?? 'data/control.dropped.jsonl');
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 8);

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function manifestPath(c) {
  return (c.manifestDiff ?? '').match(/^--- (.+)$/m)?.[1]?.trim();
}

function addedVersion(diff) {
  if (!diff) return undefined;
  const plus = diff.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++'));
  const patterns = [
    /<version>([^<]+)<\/version>/,
    /["']?version["']?\s*[:=]\s*["']?([0-9][^"'<\s,)]*)/i,
    /([0-9]+\.[0-9]+(?:\.[0-9]+)?(?:[.\-][A-Za-z0-9_.]+)*)/,
  ];
  for (const line of plus) {
    for (const re of patterns) {
      const m = line.match(re);
      if (m) return m[1].trim();
    }
  }
  return undefined;
}

const controls = await readJsonl(FILE);
let done = 0;
const results = await mapLimit(controls, CONCURRENCY, async c => {
  const p = manifestPath(c);
  const applied = addedVersion(c.manifestDiff);
  const candidates = [applied, c.newVersion].filter(Boolean).map(v => String(v).replace(/^v/, ''));
  if (!p || candidates.length === 0 || !c.outcome?.headSha) {
    c.outcome = { ...c.outcome, appliedAtHead: 'unknown', appliedVersion: applied ?? null };
    return c;
  }
  try {
    const res = await gh(`/repos/${c.repo}/contents/${p}?ref=${c.outcome.headSha}`);
    if (!res?.content) throw new Error('no content');
    const text = Buffer.from(res.content, 'base64').toString('utf8');
    const present = candidates.some(v => new RegExp(`(^|[^\\w.])${escapeRe(v)}([^\\w.]|$)`).test(text));
    c.outcome = { ...c.outcome, appliedAtHead: present ? 'yes' : 'no', appliedVersion: applied ?? null };
    return c;
  } catch {
    c.outcome = { ...c.outcome, appliedAtHead: 'unknown', appliedVersion: applied ?? null };
    return c;
  } finally {
    if (++done % 100 === 0) console.error(`[verify] ${done}/${controls.length}`);
  }
});

const kept = results.filter(c => c?.outcome?.appliedAtHead !== 'no');
const dropped = results.filter(c => c?.outcome?.appliedAtHead === 'no');
await writeJsonl(OUT, kept);
await writeJsonl(DROPPED, dropped.map(c => ({ id: c.id, repo: c.repo, title: c.title, dependency: c.dependency, newVersion: c.newVersion, applied: c.outcome?.appliedVersion, manifest: manifestPath(c) })));
console.error(`[verify] kept ${kept.length}/${controls.length}, dropped ${dropped.length}`);

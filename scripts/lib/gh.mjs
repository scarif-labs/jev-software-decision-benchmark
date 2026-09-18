// Minimal cached GitHub REST/GraphQL client built on fetch.
// Auth: GITHUB_TOKEN env or `gh auth token`.
import fs from 'node:fs/promises';
import path from 'node:path';
import { execSync } from 'node:child_process';

const TOKEN = process.env.GITHUB_TOKEN || execSync('gh auth token', { encoding: 'utf8' }).trim();
const CACHE_DIR = path.resolve(process.env.GH_CACHE ?? 'data/raw/github');
const API = 'https://api.github.com';

let cacheReady = false;
async function ensureCache() {
  if (!cacheReady) {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    cacheReady = true;
  }
}

function cacheKey(url) {
  const b = Buffer.from(url).toString('base64url');
  return b.slice(0, 160) + '-' + b.length + '.json';
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function request(url, init = {}) {
  for (let attempt = 0; attempt < 7; attempt++) {
    let res;
    try {
      res = await fetch(url.startsWith('http') ? url : API + url, {
        ...init,
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'jev-dependency-benchmark',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(init.headers ?? {}),
        },
      });
    } catch (err) {
      const wait = Math.min(120000, 2 ** attempt * 3000);
      console.error(`[gh] network error on ${url} (${String(err).slice(0, 80)}) - retrying in ${Math.round(wait / 1000)}s`);
      await sleep(wait);
      continue;
    }
    if (res.status === 403 || res.status === 429) {
      const remaining = res.headers.get('x-ratelimit-remaining');
      const reset = Number(res.headers.get('x-ratelimit-reset')) * 1000;
      const retryAfter = Number(res.headers.get('retry-after')) * 1000;
      let wait = retryAfter || Math.min(120000, 2 ** attempt * 3000);
      if (remaining === '0' && reset) wait = Math.max(wait, reset - Date.now() + 1000);
      console.error(`[gh] ${res.status} on ${url} – waiting ${Math.round(wait / 1000)}s (attempt ${attempt + 1})`);
      await sleep(wait);
      continue;
    }
    if (res.status >= 500) {
      const wait = Math.min(60000, 2 ** attempt * 2000);
      console.error(`[gh] ${res.status} on ${url} – retrying in ${Math.round(wait / 1000)}s`);
      await sleep(wait);
      continue;
    }
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GitHub ${res.status} ${url}: ${(await res.text()).slice(0, 300)}`);
    return res.json();
  }
  throw new Error(`GitHub rate-limit retries exhausted: ${url}`);
}

/** Cached REST GET. Returns parsed JSON or null for 404. */
export async function gh(url, { cache = true } = {}) {
  const full = url.startsWith('http') ? url : API + url;
  await ensureCache();
  const file = path.join(CACHE_DIR, cacheKey(full));
  if (cache) {
    try {
      return JSON.parse(await fs.readFile(file, 'utf8'));
    } catch { /* miss */ }
  }
  const json = await request(full);
  if (cache) await fs.writeFile(file, JSON.stringify(json));
  return json;
}

/** Cached GraphQL POST (cache keyed by query+vars hash). */
export async function gql(query, variables = {}) {
  await ensureCache();
  const digest = Buffer.from(JSON.stringify({ query, variables })).toString('base64url');
  const file = path.join(CACHE_DIR, 'gql-' + digest.slice(0, 160) + '-' + digest.length + '.json');
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch { /* miss */ }
  const json = await request(API + '/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (json?.errors) throw new Error('GraphQL: ' + JSON.stringify(json.errors).slice(0, 500));
  await fs.writeFile(file, JSON.stringify(json));
  return json;
}

/** Run fn over items with bounded concurrency, preserving order. */
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export async function readJsonl(file) {
  const txt = await fs.readFile(file, 'utf8');
  return txt.split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l));
}

export async function writeJsonl(file, rows) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, rows.map(r => JSON.stringify(r)).join('\n') + '\n');
}

export function ghTokenPresent() {
  return Boolean(TOKEN);
}

#!/usr/bin/env node
/**
 * Validates changed plugin folders on submission PRs
 * (see .github/workflows/validate.yml).
 *
 * Mirrors the submission worker's rules — a green check here means the
 * worker's acceptance criteria were honored, so manual review can focus on
 * content. No dependencies — plain Node (>=18).
 *
 * Usage: node scripts/validate-submission.mjs <pluginId> [<pluginId> …]
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const MAX_FILES = 80;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;

const DENYLIST_EXT = new Set([
  '.exe', '.dll', '.com', '.scr', '.msi', '.bat', '.cmd', '.ps1', '.sh', '.vbs', '.jar',
]);
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.svg', '.webp', '.gif', '.ico']);

const ID_RE = /^[a-z0-9][a-z0-9_-]{1,38}$/;
const SEMVER_RE = /^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/;
const TAB_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;
const RESERVED_IDS = new Set(['index', 'schema', 'plugins', '.github']);

const unsafePath = (p) =>
  p.length === 0 ||
  p.startsWith('/') ||
  p.includes('\\') ||
  p.includes(':') ||
  p.split('/').some((seg) => seg === '..' || seg === '.');

const problems = [];
const fail = (id, msg) => problems.push(`${id}: ${msg}`);

const ext = (p) => {
  const i = p.lastIndexOf('.');
  return i === -1 ? '' : p.slice(i).toLowerCase();
};

function walk(dir, base = dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, base, out);
    else out.push(p);
  }
  return out;
}

const readJsonSafe = (file) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};

const ids = process.argv.slice(2);
if (ids.length === 0) {
  console.log('validate: no plugin folders changed — nothing to do.');
  process.exit(0);
}

for (const id of ids) {
  const dir = join('plugins', id);

  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    fail(id, 'folder missing — deletions happen by closing/cleaning up, not via PR');
    continue;
  }
  if (!ID_RE.test(id)) fail(id, 'folder name must match ^[a-z0-9][a-z0-9_-]{1,38}$');
  if (RESERVED_IDS.has(id)) fail(id, 'folder name is reserved');

  // ---- Manifest ----
  const manifest = readJsonSafe(join(dir, 'plugin.json'));
  if (!manifest) {
    fail(id, 'plugin.json missing or invalid JSON');
    continue;
  }
  if (manifest.id !== id) fail(id, `plugin.json id "${manifest.id}" must match the folder name "${id}"`);
  if (typeof manifest.name !== 'string' || !manifest.name.trim() || manifest.name.length > 64) {
    fail(id, 'name must be 1-64 characters');
  }
  if (typeof manifest.version !== 'string' || !SEMVER_RE.test(manifest.version)) {
    fail(id, 'version must be semver (e.g. 1.0.0)');
  }
  if (manifest.description !== undefined && String(manifest.description).length > 300) {
    fail(id, 'description must be at most 300 characters');
  }
  for (const field of ['icon', 'logo']) {
    const v = manifest[field];
    if (v === undefined || v === '') continue;
    const p = String(v);
    if (unsafePath(p)) fail(id, `${field} path unsafe`);
    else if (!IMAGE_EXT.has(ext(p))) fail(id, `${field} must be an image (${[...IMAGE_EXT].join(' ')})`);
    else if (!existsSync(join(dir, p))) fail(id, `${field} file "${p}" missing`);
  }
  if (manifest.tabs !== undefined) {
    if (!Array.isArray(manifest.tabs)) {
      fail(id, 'tabs must be an array');
    } else {
      manifest.tabs.forEach((t, i) => {
        if (typeof t?.id !== 'string' || !TAB_ID_RE.test(t.id)) fail(id, `tabs[${i}].id invalid`);
        if (typeof t?.entry !== 'string' || unsafePath(t.entry) || !/\.(html?)$/.test(t.entry)) {
          fail(id, `tabs[${i}].entry must be a safe relative HTML path`);
        } else if (!existsSync(join(dir, t.entry))) {
          fail(id, `tabs[${i}].entry "${t.entry}" missing`);
        }
      });
    }
  }

  // ---- meta.json (written by the submission worker — the audit trail) ----
  const metaPath = join(dir, 'meta.json');
  if (!existsSync(metaPath)) {
    fail(id, 'meta.json missing — plugin submissions must come through the RelateCore worker');
  } else {
    const meta = readJsonSafe(metaPath);
    if (!meta || typeof meta.clerkUserId !== 'string' || !meta.clerkUserId.startsWith('user_')) {
      fail(id, 'meta.json: clerkUserId missing/invalid');
    }
  }

  // ---- Files ----
  const files = walk(dir);
  if (files.length > MAX_FILES) fail(id, `too many files (${files.length} > ${MAX_FILES})`);
  let total = 0;
  for (const f of files) {
    const rel = relative(dir, f).replace(/\\/g, '/');
    const size = statSync(f).size;
    total += size;
    if (unsafePath(rel)) {
      fail(id, `unsafe path in folder: ${rel}`);
      continue;
    }
    if (DENYLIST_EXT.has(ext(rel))) fail(id, `blocked file type: ${rel}`);
    if (size > MAX_FILE_BYTES) fail(id, `file too large (max 5 MB): ${rel}`);
  }
  if (total > MAX_TOTAL_BYTES) {
    fail(id, `uncompressed size ${(total / 1024 / 1024).toFixed(1)} MB exceeds 20 MB`);
  }

  // ---- Community reviews (optional) ----
  const reviewDir = join(dir, 'reviews');
  if (existsSync(reviewDir)) {
    for (const f of readdirSync(reviewDir)) {
      if (!f.endsWith('.json')) continue;
      const r = readJsonSafe(join(reviewDir, f));
      if (!r) {
        fail(id, `reviews/${f}: invalid JSON`);
        continue;
      }
      if (!Number.isInteger(r.rating) || r.rating < 1 || r.rating > 5) {
        fail(id, `reviews/${f}: rating must be an integer 1-5`);
      }
      if (typeof r.body !== 'string' || r.body.length > 2000) {
        fail(id, `reviews/${f}: body must be at most 2000 characters`);
      }
      const base = f.slice(0, -'.json'.length);
      if (!/^[a-zA-Z0-9_-]+$/.test(base)) {
        fail(id, `reviews/${f}: filename must be the reviewer id`);
      }
    }
  }
}

if (problems.length > 0) {
  console.error(`\n✖ ${problems.length} problem(s) found:\n`);
  for (const p of problems) console.error('  • ' + p);
  console.error('\nFix these (or mirror them locally — same rules as the submission worker).');
  process.exit(1);
}

console.log(`✔ ${ids.length} plugin folder(s) validated — all worker rules honored.`);

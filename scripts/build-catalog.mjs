#!/usr/bin/env node
/**
 * Rebuilds index.json from the plugins/ folders.
 *
 * Runs in CI (catalog.yml) on every merge to main. The RelateCore app reads
 * this file through the jsDelivr CDN — so ONLY merged plugins become visible
 * in the marketplace. Do not edit index.json by hand.
 *
 * No dependencies — plain Node (>=18).
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();

const readJson = (file) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};

const isoDate = (value, fallback) =>
  typeof value === 'string' && value.length >= 10 ? value.slice(0, 10) : fallback;

const pluginsRoot = join(ROOT, 'plugins');
const ids = existsSync(pluginsRoot)
  ? readdirSync(pluginsRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort()
  : [];

const entries = [];

for (const id of ids) {
  const dir = join(pluginsRoot, id);
  const manifest = readJson(join(dir, 'plugin.json'));
  if (!manifest) {
    console.warn(`catalog: skipping ${id} — no/invalid plugin.json`);
    continue;
  }
  const meta = readJson(join(dir, 'meta.json')) ?? {};

  // Aggregate community reviews (plugins/<id>/reviews/<userId>.json).
  const ratings = [];
  const reviewDir = join(dir, 'reviews');
  if (existsSync(reviewDir)) {
    for (const f of readdirSync(reviewDir)) {
      if (!f.endsWith('.json')) continue;
      const r = readJson(join(reviewDir, f));
      if (r && Number.isInteger(r.rating) && r.rating >= 1 && r.rating <= 5) {
        ratings.push(r.rating);
      }
    }
  }
  const ratingCount = ratings.length;
  const rating = ratingCount
    ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratingCount) * 10) / 10
    : 0;

  // Listing page design (worker-written meta.json "page" object) overrides
  // the bare manifest for everything presentation-related.
  const page = meta.page ?? {};
  const links = page.links ?? {};

  // Icon: the page icon wins; otherwise the manifest logo/icon. Both are
  // stored relative to the plugin folder and need the repo path prefix.
  const prefixed = (p) => (p.startsWith('plugins/') ? p : `plugins/${id}/${p}`);
  const pageIcon = typeof page.icon === 'string' && page.icon ? prefixed(page.icon) : undefined;
  const manifestIcon =
    typeof manifest.logo === 'string' && manifest.logo ? prefixed(manifest.logo)
    : typeof manifest.icon === 'string' && manifest.icon ? prefixed(manifest.icon)
    : undefined;
  const icon = pageIcon ?? manifestIcon;

  // Screenshot paths: current workers store them relative to the plugin
  // folder; early submissions already carry the full repo path. Accept both.
  const screenshots = Array.isArray(page.screenshots)
    ? page.screenshots.map((s) => (typeof s === 'string' && s ? prefixed(s) : undefined))
        .filter((s) => typeof s === 'string')
    : undefined;

  entries.push({
    slug: typeof manifest.id === 'string' && manifest.id ? manifest.id : id,
    name: typeof page.name === 'string' ? page.name
      : typeof manifest.name === 'string' ? manifest.name : id,
    author: meta.author ?? manifest.author ?? 'unknown',
    description:
      typeof page.shortDescription === 'string' && page.shortDescription
        ? page.shortDescription
        : typeof manifest.description === 'string'
          ? manifest.description
          : '',
    version: typeof manifest.version === 'string' ? manifest.version : '0.0.0',
    ...(icon ? { icon } : {}),
    downloads: Number(meta.downloads ?? 0),
    rating,
    ratingCount,
    tags: Array.isArray(meta.tags) ? meta.tags.map(String) : [],
    updatedAt: isoDate(
      meta.submittedAt,
      statSync(join(dir, 'plugin.json')).mtime.toISOString().slice(0, 10),
    ),
    ...(typeof page.tagline === 'string' && page.tagline ? { tagline: page.tagline } : {}),
    ...(typeof page.description === 'string' && page.description
      ? { longDescription: page.description }
      : {}),
    ...(typeof page.accentColor === 'string' && page.accentColor
      ? { accentColor: page.accentColor }
      : {}),
    ...(typeof links.homepage === 'string' && links.homepage ? { homepage: links.homepage } : {}),
    ...(typeof links.repository === 'string' && links.repository
      ? { repository: links.repository }
      : {}),
    ...(screenshots && screenshots.length ? { screenshots } : {}),
  });
}

writeFileSync(join(ROOT, 'index.json'), JSON.stringify(entries, null, 2) + '\n');
console.log(`catalog: wrote ${entries.length} listing(s) to index.json`);

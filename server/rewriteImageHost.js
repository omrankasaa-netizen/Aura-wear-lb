// One-time, boot-safe image-host migration (AURA).
//
// Uploaded image URLs are persisted ABSOLUTE in entity JSON docs (Product,
// ProductImage, CmsSection, Category, MediaAsset, SiteSetting, …). Early
// uploads were stored with the bucket's raw r2.dev public host:
//
//   https://pub-ab3852beb0cd42559c87746c47032c7a.r2.dev/products/...
//
// The custom domain (R2_PUBLIC_BASE_URL, e.g. https://image.aura-lb.shop) now
// fronts the SAME bucket, so every stored URL can be fixed with a pure prefix
// swap — object keys are identical on both hosts.
//
// Runs on every boot, AFTER initSchema. It is idempotent (a no-op once no doc
// contains the legacy prefix) and skips silently when R2_PUBLIC_BASE_URL is
// unset or already equal to the legacy host, so local dev without R2 config
// is unaffected.

import { db, ENTITIES } from './db.js';

// Legacy public host(s) that may appear in stored image URLs. The r2.dev host
// is bucket-specific and public (not a secret).
const LEGACY_HOSTS = [
  'https://pub-ab3852beb0cd42559c87746c47032c7a.r2.dev',
];

function trimSlashes(s) {
  return String(s || '').replace(/\/+$/, '');
}

export function rewriteImageHostUrls(env = process.env) {
  const target = trimSlashes(env.R2_PUBLIC_BASE_URL);
  if (!target) return { changed: 0, skipped: 'R2_PUBLIC_BASE_URL unset' };

  const hosts = LEGACY_HOSTS.filter((h) => h !== target);
  if (hosts.length === 0) return { changed: 0, skipped: 'nothing to rewrite' };

  let total = 0;
  for (const entity of ENTITIES) {
    const table = `e_${entity}`;
    let perTable = 0;
    for (const legacy of hosts) {
      // SQLite replace() is a literal string replace over the whole JSON doc,
      // so it covers image_url, variants/image_variants maps, gallery_json,
      // CMS tile bodies, and any future image-bearing field without an
      // explicit column list.
      const stmt = db.prepare(
        `UPDATE ${table} SET doc = REPLACE(doc, ?, ?) WHERE doc LIKE ?`,
      );
      const info = stmt.run(legacy, target, `%${legacy}%`);
      perTable += info.changes;
    }
    if (perTable > 0) {
      console.log(`[imageHost] ${entity}: rewrote ${perTable} row(s) -> ${target}`);
      total += perTable;
    }
  }

  if (total > 0) {
    console.log(`[imageHost] migration complete: ${total} row(s) now use ${target}`);
  }
  return { changed: total };
}

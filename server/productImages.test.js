import { test } from 'node:test';
import assert from 'node:assert/strict';
import { imagesToDelete } from '../src/lib/productImages.js';

// Simulates the admin ProductForm save. The editor grid is the source of truth:
// whatever image ids it still keeps must survive, and every other DB row for the
// product must be deleted — otherwise a removed photo reappears on reload.

test('deleting an image from a product persists (its row is removed on save)', () => {
  // DB has three saved images for the product.
  const dbImages = [{ id: 'img1' }, { id: 'img2' }, { id: 'img3' }];
  // Admin removed img2 in the grid; img1 and img3 are kept.
  const keptIds = new Set(['img1', 'img3']);
  assert.deepEqual(imagesToDelete(dbImages, keptIds), ['img2']);
});

test('keeping all images deletes nothing', () => {
  const dbImages = [{ id: 'img1' }, { id: 'img2' }];
  assert.deepEqual(imagesToDelete(dbImages, new Set(['img1', 'img2'])), []);
});

test('removing every image deletes them all', () => {
  const dbImages = [{ id: 'img1' }, { id: 'img2' }];
  assert.deepEqual(imagesToDelete(dbImages, new Set()), ['img1', 'img2']);
});

test('newly created images (not yet in DB) are never deleted', () => {
  // After save, freshly created rows are in both the DB read and the kept set.
  const dbImages = [{ id: 'old1' }, { id: 'new1' }];
  const keptIds = new Set(['new1']); // old1 was removed by the admin
  assert.deepEqual(imagesToDelete(dbImages, keptIds), ['old1']);
});

test('accepts a plain array of kept ids as well as a Set', () => {
  const dbImages = [{ id: 'a' }, { id: 'b' }];
  assert.deepEqual(imagesToDelete(dbImages, ['a']), ['b']);
});

test('handles empty / missing inputs safely', () => {
  assert.deepEqual(imagesToDelete([], new Set(['a'])), []);
  assert.deepEqual(imagesToDelete(undefined, undefined), []);
  assert.deepEqual(imagesToDelete([{ id: null }, { id: 'x' }], new Set()), ['x']);
});

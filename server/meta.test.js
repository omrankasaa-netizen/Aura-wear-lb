import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeSku, absoluteUrl, buildFeedRow, buildFeedCsv, FEED_COLUMNS,
  buildPurchasePayload,
} from './meta.js';

test('normalizeSku uppercases and trims', () => {
  assert.equal(normalizeSku('  aura-sj '), 'AURA-SJ');
  assert.equal(normalizeSku('Aura-Bj'), 'AURA-BJ');
  assert.equal(normalizeSku(''), '');
  assert.equal(normalizeSku(null), '');
  assert.equal(normalizeSku(undefined), '');
});

test('absoluteUrl leaves absolute urls, prefixes relative paths', () => {
  assert.equal(absoluteUrl('https://cdn.x/y.jpg', 'https://aura-lb.shop'), 'https://cdn.x/y.jpg');
  assert.equal(absoluteUrl('/uploads/a.webp', 'https://aura-lb.shop'), 'https://aura-lb.shop/uploads/a.webp');
  assert.equal(absoluteUrl('brand/x.png', 'https://aura-lb.shop'), 'https://aura-lb.shop/brand/x.png');
  assert.equal(absoluteUrl('', 'https://aura-lb.shop'), '');
});

const BASE = 'https://aura-lb.shop';

test('buildFeedRow maps a plain in-stock product', () => {
  const row = buildFeedRow({
    sku: 'aura-ls', slug: 'linen-shirt', name: 'Linen Shirt',
    description: 'Breathable linen', price_usd: 25, compare_at_price_usd: null,
    gender: 'Men', age_group: 'Adult', sizes: '', colors: '',
  }, { base: BASE, imageUrl: `${BASE}/img/ls.jpg`, inStock: true });

  assert.equal(row.id, 'AURA-LS'); // normalized to match pixel content_ids
  assert.equal(row.title, 'Linen Shirt');
  assert.equal(row.availability, 'in stock');
  assert.equal(row.condition, 'new');
  assert.equal(row.price, '25.00 USD');
  assert.equal(row.sale_price, ''); // no compare-at → no sale price
  assert.equal(row.link, `${BASE}/product/linen-shirt`);
  assert.equal(row.image_link, `${BASE}/img/ls.jpg`);
  assert.equal(row.brand, 'AURA');
  assert.equal(row.gender, 'male');
  assert.equal(row.age_group, 'adult');
});

test('buildFeedRow computes sale_price when compare_at is higher', () => {
  const row = buildFeedRow(
    { sku: 'AURA-BJ', slug: 'baggy-jeans', name: 'Baggy Jeans', price_usd: 30, compare_at_price_usd: 45 },
    { base: BASE, inStock: false },
  );
  assert.equal(row.price, '45.00 USD');       // original
  assert.equal(row.sale_price, '30.00 USD');  // discounted
  assert.equal(row.availability, 'out of stock');
});

test('buildFeedRow falls back to a brand image when none supplied', () => {
  const row = buildFeedRow({ sku: 'X', slug: 'x', name: 'X', price_usd: 10 }, { base: BASE });
  assert.equal(row.image_link, `${BASE}/brand/aura-icon-512.png`);
});

test('buildFeedRow only emits size/color when unambiguous (single value)', () => {
  const multi = buildFeedRow({ sku: 'A', slug: 'a', name: 'A', price_usd: 10, sizes: 'S|M|L', colors: 'Red|Blue' }, { base: BASE });
  assert.equal(multi.size, '');
  assert.equal(multi.color, '');
  const single = buildFeedRow({ sku: 'B', slug: 'b', name: 'B', price_usd: 10, sizes: 'M', colors: 'Grey' }, { base: BASE });
  assert.equal(single.size, 'M');
  assert.equal(single.color, 'Grey');
});

test('buildFeedCsv emits header + CSV-escaped rows', () => {
  const csv = buildFeedCsv([
    buildFeedRow({ sku: 'A', slug: 'a', name: 'Comma, name', description: 'has "quotes"', price_usd: 10 }, { base: BASE }),
  ]);
  const lines = csv.trim().split('\n');
  assert.equal(lines[0], FEED_COLUMNS.join(','));
  assert.ok(lines[1].includes('"Comma, name"'));
  assert.ok(lines[1].includes('"has ""quotes"""'));
});

test('buildPurchasePayload hashes PII and builds contents/value', () => {
  const order = {
    id: 'ord-1', order_number: 'AURA-00042', grand_total_usd: 55,
    customer_email: ' Test@Example.com ', customer_phone: '+961 71 66 29 06',
  };
  const items = [
    { sku: 'aura-ls', quantity: 2, unit_price_usd: 25 },
    { sku: 'aura-bj', quantity: 1, unit_price_usd: 5 },
  ];
  const payload = buildPurchasePayload(order, items, { eventId: 'evt-123', now: 1700000000 });
  const ev = payload.data[0];

  assert.equal(ev.event_name, 'Purchase');
  assert.equal(ev.event_id, 'evt-123'); // shared with browser for dedup
  assert.equal(ev.action_source, 'website');
  assert.equal(ev.custom_data.currency, 'USD');
  assert.equal(ev.custom_data.value, 55);
  assert.equal(ev.custom_data.order_id, 'AURA-00042');
  assert.deepEqual(ev.custom_data.content_ids, ['AURA-LS', 'AURA-BJ']);
  assert.equal(ev.custom_data.num_items, 3);
  // PII must be sha256-hashed (64 hex chars), never plaintext.
  assert.match(ev.user_data.em[0], /^[a-f0-9]{64}$/);
  assert.match(ev.user_data.ph[0], /^[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(ev.user_data).includes('example.com'));
});

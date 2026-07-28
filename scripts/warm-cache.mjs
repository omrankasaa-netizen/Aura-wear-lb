#!/usr/bin/env node

const DEFAULT_BASE_URL = 'https://aura-lb.shop';
const baseUrl = (process.argv[2] || process.env.AURA_WARM_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');

const headers = {
  'User-Agent': 'aura-cache-warmer/1.0',
  Accept: 'application/json,text/html,*/*',
};

async function hit(path) {
  const url = `${baseUrl}${path}`;
  try {
    const res = await fetch(url, { headers, redirect: 'follow' });
    const cache = res.headers.get('cf-cache-status') || '-';
    const ok = res.ok;
    console.log(`${res.status} ${cache} ${url}`);
    return { ok, status: res.status, url };
  } catch (error) {
    console.log(`ERR - ${url}`);
    return { ok: false, status: 0, url, error };
  }
}

function qp(obj) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null) sp.set(k, String(v));
  }
  return `?${sp.toString()}`;
}

async function main() {
  const targets = [
    `/api/entities/CmsSection${qp({ limit: 50 })}`,
    `/api/entities/SiteSetting${qp({ limit: 100 })}`,
    `/api/entities/Category${qp({ limit: 20 })}`,
  ];

  const basics = [];
  for (const path of targets) basics.push(await hit(path));

  const featuredUrl = `/api/entities/Product${qp({ q: JSON.stringify({ status: 'Active', is_featured: true }), sort: '-created_date', limit: 10 })}`;
  let productsRes = await fetch(`${baseUrl}${featuredUrl}`, { headers, redirect: 'follow' });
  console.log(`${productsRes.status} ${productsRes.headers.get('cf-cache-status') || '-'} ${baseUrl}${featuredUrl}`);

  let products = [];
  if (productsRes.ok) {
    try { products = await productsRes.json(); } catch { products = []; }
  }
  if (!Array.isArray(products) || products.length === 0) {
    const fallbackUrl = `/api/entities/Product${qp({ q: JSON.stringify({ status: 'Active' }), sort: '-created_date', limit: 10 })}`;
    productsRes = await fetch(`${baseUrl}${fallbackUrl}`, { headers, redirect: 'follow' });
    console.log(`${productsRes.status} ${productsRes.headers.get('cf-cache-status') || '-'} ${baseUrl}${fallbackUrl}`);
    if (productsRes.ok) {
      try { products = await productsRes.json(); } catch { products = []; }
    }
  }

  const productList = Array.isArray(products) ? products.slice(0, 10) : [];
  const productHits = [];
  for (const product of productList) {
    const slug = product?.slug;
    const id = product?.id;
    if (!slug || !id) continue;
    productHits.push(await hit(`/product/${encodeURIComponent(slug)}`));
    productHits.push(await hit(`/api/entities/Product${qp({ q: JSON.stringify({ slug }), limit: 1 })}`));
    productHits.push(await hit(`/api/entities/ProductImage${qp({ q: JSON.stringify({ product_id: id }), sort: 'sort_order', limit: 20 })}`));
    productHits.push(await hit(`/api/entities/ProductVariant${qp({ q: JSON.stringify({ product_id: id }), sort: 'size', limit: 50 })}`));
  }

  const all = [...basics, ...productHits];
  const success = all.filter((r) => r.ok).length;
  console.log(`\nSuccess: ${success}/${all.length}`);
}

main().catch((error) => {
  console.error(error?.message || String(error));
  process.exitCode = 1;
});


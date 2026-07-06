# Meta (Facebook) Tracking — AURA

Production Meta tracking for AURA: a consent-gated **browser Pixel**, a
**server-side Conversions API (CAPI)** Purchase, and a **catalog data feed** for
Meta Commerce Manager.

Everything is **env-driven** and **degrades to a silent no-op** when the env
vars are unset — the storefront runs and builds with zero Meta config. No
secrets live in the repo; the CAPI token is supplied only via Railway env vars.

---

## 1. Environment variables

| Variable | Where | Secret | Purpose |
|---|---|---|---|
| `VITE_META_PIXEL_ID` | Frontend (build-time) | No | Browser Pixel ID. Inlined by Vite at build. Pixel stays off until unset OR the shopper accepts the consent banner. |
| `AURA_META_PIXEL_ID` | Backend | No | Same Pixel/Dataset ID, used by the Conversions API. |
| `AURA_META_CAPI_ACCESS_TOKEN` | Backend | **Yes** | Conversions API access token. Backend only, never exposed to the browser. |
| `AURA_META_TEST_EVENT_CODE` | Backend | No | Optional. Routes CAPI events to the **Test Events** tab in Events Manager. Remove for production. |
| `AURA_PUBLIC_BASE_URL` | Backend | No | Optional. Public origin for feed links + CAPI event URLs. Defaults to `https://aura-lb.shop`. |

> `VITE_*` variables are baked into the client bundle **at build time**. After
> setting `VITE_META_PIXEL_ID` you must rebuild/redeploy the frontend for it to
> take effect. Backend vars (`AURA_META_*`) are read at runtime.

### Railway setup

In Railway → your service → **Variables**, add:

```
VITE_META_PIXEL_ID=<your_pixel_id>
AURA_META_PIXEL_ID=<your_pixel_id>
AURA_META_CAPI_ACCESS_TOKEN=<your_capi_access_token>   # keep secret
# Optional:
AURA_META_TEST_EVENT_CODE=<TESTxxxx>
AURA_PUBLIC_BASE_URL=https://aura-lb.shop
```

Then trigger a redeploy so the frontend build picks up `VITE_META_PIXEL_ID`.

---

## 2. What gets tracked

### Browser Pixel (`src/lib/meta.js`, mounted via `src/components/MetaPixel.jsx`)

Consent-gated: the pixel loads with consent **revoked** by default and only
starts sending once the shopper accepts the bilingual (EN/AR) consent banner.
The choice is stored in `localStorage` (`aura-meta-consent`).

| Event | Fires when | Key params |
|---|---|---|
| `PageView` | Every SPA route change (after consent) | — |
| `ViewContent` | Product page loads | `content_ids`, `value`, `currency` |
| `AddToCart` | Any add-to-cart (product page, quick-add, cart drawer) | `content_ids`, `contents`, `value`, `currency` |
| `InitiateCheckout` | Checkout page opens with items | `content_ids`, `contents`, `num_items`, `value` |
| `Purchase` | Order placed successfully | `content_ids`, `contents`, `value`, `currency`, shared `eventID` |

`Search`, `AddToWishlist`, `Lead`, and `Contact` are intentionally **not**
wired — there is no dedicated search results / wishlist-analytics surface that
warrants them today. They can be added later using `trackEvent()`.

### Server-side Conversions API (`server/meta.js` + `metaTrackPurchase` function)

On a successful order the browser fires `Purchase` **and** calls the backend
function `metaTrackPurchase`, which sends an authoritative server-side Purchase:

- **Idempotent** — sends at most once per order (guarded by a
  `meta_capi_purchase_sent` flag on the order record).
- **Deduplicated** — reuses the same `event_id` as the browser Purchase, so Meta
  collapses the browser + server events into one.
- **Hashed PII** — customer email + phone are SHA-256 hashed (normalized) before
  sending, per Meta requirements. Plaintext PII is never transmitted.
- **Safe** — a silent no-op when `AURA_META_PIXEL_ID` /
  `AURA_META_CAPI_ACCESS_TOKEN` are unset; failures never block checkout.

### SKU normalization

Meta catalog matching is **case-sensitive**. All `content_ids` (browser + CAPI)
and all feed `id`s pass through the same normalization — **uppercase + trim** —
so they always match. See `normalizeSku()` in both `src/lib/meta.js` and
`server/meta.js` (covered by `server/meta.test.js`).

---

## 3. Catalog feed

**URL:** `GET /meta-feed.csv` (e.g. `https://aura-lb.shop/meta-feed.csv`)

Public, no secrets, always available. One row per **Active** product. Columns:

```
id, title, description, availability, condition, price, sale_price,
link, image_link, brand, gender, age_group, size, color
```

- `id` = normalized product SKU (matches the pixel/CAPI `content_ids`).
- `price` / `sale_price` — when a product has a higher `compare_at_price_usd`,
  `price` is the original and `sale_price` is the current selling price;
  otherwise only `price` is set. All in **USD**.
- `availability` — `in stock` when the product (or the sum of its variants) has
  positive stock, else `out of stock`.
- `image_link` — first product image (absolute URL); falls back to the AURA
  brand image so every row is valid.
- `gender` / `age_group` — mapped to Meta's vocabulary (`Men` → `male`,
  `Adult` → `adult`).
- `size` / `color` — emitted only when a product has a single unambiguous value.

---

## 4. Meta Commerce Manager — data feed steps

1. Go to **Commerce Manager → Catalogs → (your catalog) → Data sources**.
2. Choose **Add items → Use a URL / Scheduled feed**.
3. Enter the feed URL: `https://aura-lb.shop/meta-feed.csv`.
4. Set a schedule (e.g. **Daily**). Currency is **USD**.
5. Map columns — the header names already match Meta's expected fields, so the
   auto-mapping should require no manual changes.
6. Upload/fetch and confirm items import without errors.

### Connect the Pixel + Catalog for dynamic ads

1. **Events Manager → your Pixel** — verify events are received. Use the
   **Test Events** tab with `AURA_META_TEST_EVENT_CODE` set to confirm both the
   browser and server (CAPI) Purchase arrive and are **deduplicated** by
   `event_id`.
2. **Catalog → Settings → Connected sources** — connect the Pixel so catalog
   items match against `content_ids`.
3. Because feed `id`s and pixel `content_ids` share the same normalized SKU,
   product matching for dynamic/retargeting ads works out of the box.

---

## 5. Local verification

```bash
npm test          # unit tests for SKU normalization, feed rows, CAPI payload
npm run build     # production build (works with or without Meta env vars)
npm run serve     # build + start server, then:
curl -s localhost:4000/meta-feed.csv | head   # inspect the feed
```

Without `VITE_META_PIXEL_ID` no pixel loads and no consent banner appears — the
site behaves exactly as before.

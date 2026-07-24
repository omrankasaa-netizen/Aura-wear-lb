# Analytics tracking standard (GA4 + UTM + Meta/TikTok)

This app runs three independent measurement layers behind one consent gate:

1. **GA4** (`VITE_GA4_MEASUREMENT_ID`)
2. **Meta** Pixel + CAPI (see `docs/META_TRACKING.md`)
3. **TikTok** Pixel + Events API (see `docs/TIKTOK_TRACKING.md`)

If a provider is not configured, its tracking is a safe no-op.

## Required frontend env

| Variable | Purpose |
|---|---|
| `VITE_GA4_MEASUREMENT_ID` | GA4 Measurement ID (`G-...`) |
| `VITE_META_PIXEL_ID` | Meta browser pixel |
| `VITE_TIKTOK_PIXEL_ID` | TikTok browser pixel |

## Canonical ecommerce events

| Journey step | GA4 | Meta Pixel | TikTok Pixel | Server API |
|---|---|---|---|---|
| Page view | `page_view` | `PageView` | `ttq.page()` | — |
| Product detail | `view_item` | `ViewContent` | `ViewContent` | — |
| Add to cart | `add_to_cart` | `AddToCart` | `AddToCart` | — |
| Begin checkout | `begin_checkout` | `InitiateCheckout` | `InitiateCheckout` | — |
| Purchase | `purchase` | `Purchase` | `CompletePayment` | Meta CAPI + TikTok Events API |

Purchase payloads include transaction/order id, value, currency, and item-level identifiers.

## UTM capture + normalization

UTMs are captured from landing URLs and persisted through `safeStorage` (with in-memory fallback when storage is blocked):

- `utm_source`
- `utm_medium`
- `utm_campaign`
- `utm_content`
- `utm_term`

Normalization is strict and consistent:

- `trim()`
- lowercase
- stored as a single normalized snapshot when any UTM parameter is present

Checkout writes the normalized UTM snapshot into the created `Order` document (`utm_*` + `utm_captured_at`) so attribution context is available in order data and server-side workflows.

## Meta/TikTok dedup for purchase

Purchase events are sent from both browser pixel and server API for Meta and TikTok.

- Client generates one `event_id` per provider.
- The same `event_id` is sent in browser + server calls.
- Server functions are idempotent per order (`*_purchase_sent` flags), preventing duplicate sends across retries.

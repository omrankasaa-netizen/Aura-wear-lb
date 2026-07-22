# TikTok Tracking for AURA

TikTok twin of the Meta setup (`docs/META_TRACKING.md`): browser Pixel +
server-side Events API + product catalog feed. Everything is env-driven and
consent-gated; with no env vars set, nothing loads and nothing is sent.

## What fires where

| Event | Where | Trigger |
|---|---|---|
| Page view | Browser (`ttq.page()`) | Initial load + every SPA route change, only after consent |
| `ViewContent` | Browser (`ttq.track`) | Product page view |
| `AddToCart` | Browser (`ttq.track`) | Any add-to-cart (grid quick-add + PDP) |
| `InitiateCheckout` | Browser (`ttq.track`) | Checkout page load with items |
| `CompletePayment` | **Server only** (Events API) | Order placed — from trusted DB order data, idempotent (`tiktok_purchase_sent` flag on the order) |

`content_id` is the normalized product SKU everywhere, matching the catalog
feed `sku_id` and the Meta Pixel/CAPI ids, so TikTok can match events to
catalog items.

CompletePayment is deliberately NOT fired from the browser — the server event
is the single source of truth (no dedup needed).

## Consent

The TikTok pixel shares the existing consent banner (the same one the Meta
Pixel uses; one accept covers both). The `ttq` script is only injected when
`VITE_TIKTOK_PIXEL_ID` is set, and no `ttq` call happens until the shopper
accepts. Declines leave TikTok fully silent.

## Environment variables

| Variable | Where | What |
|---|---|---|
| `VITE_TIKTOK_PIXEL_ID` | Railway → Variables (build-time) | Public pixel id, exposed to the browser |
| `AURA_TIKTOK_PIXEL_ID` | Railway → Variables | Same pixel id, backend Events API `event_source_id` |
| `AURA_TIKTOK_ACCESS_TOKEN` | Railway → Variables | **SECRET** Events API access token (backend only) |
| `AURA_TIKTOK_TEST_EVENT_CODE` | Railway → Variables (optional) | Routes Events API events to the Test Events tab while testing |

Get the pixel id and access token in **TikTok Ads Manager → Assets → Events →
Web Events → (your pixel)**: the id is on the pixel overview; the token is
under **Settings → Events API → Generate Access Token**. The test event code is
shown in the pixel's **Test Events** tab.

Note: `VITE_*` values are inlined at build time, so after setting
`VITE_TIKTOK_PIXEL_ID` you must trigger a redeploy for the pixel to appear.

## Catalog feed

`https://aura-lb.shop/tiktok-feed.csv` — always on, no secrets needed. Add it
in TikTok Ads Manager → Assets → Catalogs → Add Products → Data Feed Schedule.
The feed uses the normalized SKU as `sku_id`, USD prices, and maps categories
to Google Product Taxonomy for TikTok's category requirement.

## Verifying after setup

1. Set `AURA_TIKTOK_TEST_EVENT_CODE` to the code shown in the pixel's **Test
   Events** tab and redeploy.
2. Place a small test order (or invoke the function from the admin console):
   the `CompletePayment` event should appear in Test Events within a minute.
3. Server logs show `[tiktokEvents] sent { event: 'CompletePayment', ... }` on
   success; on a bad token it logs the TikTok error code/message (never the
   token or PII).
4. Browser events: install the **TikTok Pixel Helper** Chrome extension and
   browse the shop after accepting the consent banner — you should see
   ViewContent / AddToCart / InitiateCheckout fire.
5. When satisfied, **remove `AURA_TIKTOK_TEST_EVENT_CODE`** so events flow
   into normal reporting.

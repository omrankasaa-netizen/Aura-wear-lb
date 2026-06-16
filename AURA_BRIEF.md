# AURA — Storefront Redesign Brief
### Production-ready implementation spec for `Aura-wear-lb`, built on the existing MiniYo commerce foundation

**Prepared:** for a developer / AI coding agent to implement directly.
**Scope rule:** Reuse the existing backend, commerce engine, auth, admin linkage, and data model **as-is**. Rebuild only the customer-facing storefront UI/UX layer. Do not rebuild database models. Touch the backend only where storefront compatibility requires it (e.g., new `SiteSetting` keys, exposing existing fields).

---

## 0. Brand snapshot (the source of truth)

| Attribute | Value |
|---|---|
| Brand name | **AURA** (wordmark "AURA" + spaced "APPAREL" beneath) |
| Handle | `aura.wear.leb` |
| Category | Adult men's apparel |
| Market | Lebanon (delivery nationwide) |
| WhatsApp | **+961 71 66 29 06** (`wa.me/96171662906`) — *different from MiniYo* |
| Instagram | https://www.instagram.com/aura.wear.leb/ |
| Tagline | "LEVEL UP YOUR AURA" |
| Current sales channel | Instagram / DM / WhatsApp |
| Logo | Black angular twin-peak ("M") mark; pure black-on-white; minimal, sharp |
| Real product mix | Oversized & regular crew tees, varsity/jersey "22"/"9" tees, striped knit polos, baggy/relaxed jeans, matching sets/tracksuits, tank tops |
| Visual world | Warm beige/cream walls, rattan disc, black clothing rack, single casual male model; earthy neutral, IG-native |
| Promo language | "Discount 40/50%", limited quantity, drop-driven |

**Positioning guardrail:** AURA must NOT read as "MiniYo in different colors." MiniYo = soft, warm, child/family, rounded. AURA = sharp, masculine, confident, fashion/drop-driven, editorial.

---

## 1. Brand UI Direction

**Mood:** Confident, casual, clean, trend-aware menswear — affordable-premium, not luxury-formal, not playful. Lebanese Instagram-native street-casual commerce, elevated.

**Visual principles**
- **Editorial over cute.** Big imagery, generous negative space, disciplined grids, sharp type hierarchy.
- **Restraint.** Mostly monochrome + warm neutrals; color comes from the product photography, not the chrome.
- **Squared, not bubbly.** Small radii (4–8px), crisp 1px borders, flat surfaces. No pastel, no soft nursery shapes, no toy-like cards.
- **Motion is subtle.** Fast fades, slight image scale on hover (desktop), no bouncy/springy animation.
- **Mobile is the hero.** Most traffic is IG → mobile. Every primary action must be thumb-reachable.

---

## 2. Design System

### 2.1 Color tokens (light default; dark-capable)
Map these to the existing CSS-variable system in `src/index.css` (HSL triplets) so Tailwind's `--primary` etc. drive the whole app.

| Token | Hex | Role |
|---|---|---|
| `--background` | `#FAF8F4` warm off-white/stone | page base |
| `--foreground` | `#0E0E0E` near-black | primary text |
| `--primary` | `#111111` black | primary buttons, logo, key CTAs |
| `--primary-foreground` | `#FFFFFF` | text on primary |
| `--secondary` | `#E9E3DA` warm beige | secondary surfaces, chips |
| `--accent-olive` | `#5A5E45` muted olive | sparing accent (tags, links hover) |
| `--accent-navy` | `#1F2A37` deep navy | alt accent for badges/sets |
| `--charcoal` | `#26262A` | dark sections, footer |
| `--stone` | `#D8D2C7` | borders, dividers, skeletons |
| `--muted-foreground` | `#6B6A66` | secondary text |
| `--sale` | `#B23A2E` controlled brick-red | sale price, low-stock |
| `--success` | `#3B6E4D` | in-stock, order success |

**Dark mode** (optional, ship light first): background `#0E0E0E`, surfaces `#1A1A1C`, foreground `#F5F3EF`, primary inverts to off-white.

### 2.2 Typography
- **Display / headings:** **Clash Display** (600/700), uppercase for hero & section eyebrows, tight letter-spacing (-0.01em). Self-host via Fontshare (free) — `@font-face` or the Fontshare CSS API; no Google Fonts.
- **Body / UI:** **Satoshi** (400/500/700), also from Fontshare. Self-hosted woff2 in `/public/fonts` for performance and offline build.
- **Numerals/price:** Satoshi tabular figures.
- Wire both into `tailwind.config.js` `fontFamily` (`display: ['Clash Display', ...]`, `sans: ['Satoshi', ...]`) and import in `src/index.css`.
- Scale (mobile → desktop): hero 32→56px, H2 22→32px, card title 14→15px, body 14→16px, micro 11→12px uppercase tracked.

### 2.3 Spacing & grid
- 4px base; section vertical rhythm 48/64/80px.
- Container max 1280px; gutters 16px mobile / 24px desktop.
- Product grid: **2 cols mobile, 3 tablet, 4 desktop** (MiniYo uses softer/larger cards — AURA is denser, scroll-optimized).

### 2.4 Components (full kit, distinct from MiniYo)
- **Buttons:** primary (solid black, 2px radius, uppercase 12px tracked), secondary (1px black outline), ghost, and **WhatsApp button** (dark with WA glyph, never neon-green-loud). Sizes: sm/md/lg + full-width mobile.
- **Chips/pills:** filter chips (square-ish), size pills (`S M L XL` square outline, selected = solid black), color swatches (round, 1px ring, selected ring offset).
- **Badges:** `NEW`, `LIMITED`, `BEST SELLER`, `-40%` sale, `LOW STOCK`, `SOLD OUT`. Badge logic placeholders defined in §11.
- **Cards:** product card (§6), category tile, editorial/look card, offer banner card.
- **Banners:** top utility bar (auto-rotating messages), hero, promo strip, flash-sale countdown banner.
- **Drawers:** mini-cart, mobile filters, size-help, mobile nav. Right-side slide, dim overlay.
- **Modals/overlays:** quick-view, image zoom/gallery expand, size guide.
- **Tabs / accordions:** PDP detail accordions, account sections.
- **Breadcrumbs:** Home / Collection / Product (desktop; collapsed on mobile).
- **Form controls:** large inputs (52px mobile height), floating/over-label style, clear focus ring (`--primary`), inline validation.
- **Trust badges:** delivery-Lebanon, COD-friendly, secure checkout, WhatsApp support — line-icon style, monochrome.
- **Empty states:** wishlist, cart, no-results, account — each with an illustration-free, type-led layout + CTA.
- **Skeletons/loaders:** stone shimmer; splash uses the AURA mark centered.

### 2.5 Imagery rules
- Product card image ratio **4:5** (portrait, fashion standard; MiniYo uses squarer). Hover swaps to 2nd image on desktop.
- Hero **16:9 desktop / 4:5 mobile**, full-bleed, dark text-scrim option.
- Editorial/look blocks: mixed 4:5 + 1:1 mosaic.
- Respect AURA's real media (beige room, rack, flat-lays) — elevate via consistent cropping, rhythm, and generous padding.

### 2.6 Icon style
Single line-icon set (e.g., Lucide, already in repo), 1.5px stroke, monochrome. No filled/cute icons.

---

## 3. Sitemap

```
Home
Shop (all)
 ├ New Arrivals
 ├ Best Sellers
 ├ T-Shirts
 ├ Polos
 ├ Jeans
 ├ Matching Sets
 └ Offers
Product Detail (PDP)
About AURA
Track Order
Wishlist
Cart  →  Checkout  →  Order Confirmation
Account
 ├ Dashboard
 ├ Orders
 ├ Addresses
 ├ Wishlist
 ├ Profile / Login & password
 └ Preferences (placeholder)
Contact / WhatsApp help
Legal (Privacy, Terms, Returns, Shipping)
Auth: Login / Register / OTP verify / Reset
Admin (existing — link only, low-prominence)
```

Categories map to the existing `Category` entity; nav order is config-driven (see §15).

---

## 4. Page-by-page storefront structure

### 4.1 Home — see §5 (dedicated breakdown).
### 4.2 Collection / Listing — see §6.
### 4.3 Product Detail — see §7.
### 4.4 Cart & Checkout — see §8.
### 4.5 Account — see §9.

### 4.6 About AURA
Editorial single column: brand statement ("Level up your aura"), values (fit, quality, accessible price), founder/local Lebanon note, IG embed strip, WhatsApp CTA.

### 4.7 Track Order
Order-number + email/phone lookup → status timeline (Placed → Confirmed → Shipped → Delivered) using existing `Order` status. WhatsApp "ask about my order" CTA.

### 4.8 Contact / WhatsApp help
WhatsApp primary CTA (+961 71 66 29 06), IG link, delivery/returns quick answers, hours.

---

## 5. Homepage section breakdown (in order)

1. **Top utility bar** — auto-rotating: "Delivery all over Lebanon 🇱🇧" · "Cash on Delivery available" · "DM/WhatsApp support". Config-driven messages.
2. **Header** — logo (centered or left), search, wishlist, account, cart; sticky-on-scroll; mobile hamburger → full nav drawer with featured collections.
3. **Hero** — campaign headline (e.g., "LEVEL UP YOUR AURA"), subheadline, primary CTA "Shop New Arrivals", secondary "Explore Offers", full-bleed image slot (admin-controlled via CMS hero).
4. **Quick category tiles** — Tees · Polos · Jeans · Sets · Offers (image tiles, square, label overlay).
5. **New Arrivals strip** — horizontal scroll, "drop" framing, `NEW` badges.
6. **Best Sellers strip** — horizontal scroll, `BEST SELLER` badges.
7. **Shop the Look / Build Your Fit** — 1–2 editorial looks; each look lists its component products with quick-add (NEW vs MiniYo).
8. **Featured Offer / Limited Drop** — bold promo block with optional countdown + "-40%" style badge.
9. **Style-led discovery** — "Everyday Essentials" / "Weekend Fit" / "Clean Basics" curated rails.
10. **Trust strip** — Delivery Lebanon · COD · Secure checkout · WhatsApp support.
11. **Instagram / social proof** — grid of IG-style tiles linking to `aura.wear.leb`.
12. **Footer** — see §10.

**Homepage tone:** short, confident, menswear voice. No SaaS/AI clichés, no emotional/childish copy.

---

## 6. Collection / Listing page behavior

- **Filters:** category, **size** (S–XXL), **color** swatches, **fit** (Oversized/Relaxed/Regular/Slim), price, on-sale toggle. Desktop = left rail; mobile = **sticky "Filter" button → bottom/side drawer** with apply/clear.
- **Sort:** New, Price ↑/↓, Best Selling, Discount.
- **Cards:** §6.1, with badges, wishlist heart, **quick-view** + **quick-add** placeholders, desktop **hover second image**, per-card **WhatsApp inquiry** icon.
- **Density:** 2/3/4 columns; infinite scroll or "Load more".
- Reviews/ratings placeholder on card (stars, hidden until data exists).

### 6.1 Product card (more mature than MiniYo)
- 4:5 image, squared corners, hover swap image (desktop).
- Title (medium), price with **sale handling** (was/now, `--sale` color).
- Optional **color swatches** row, **fit tag** (e.g., "Oversized").
- Wishlist heart top-right; badges top-left.
- Optional "Model wears size M" microcopy slot.
- Large tap targets; whole card tappable to PDP; quick-add as secondary.

---

## 7. Product detail page (PDP)

- **Gallery:** large, swipeable mobile; thumbnail rail + zoom/expand desktop.
- **Buy box:** title, price (+sale), color selector (swatches), **size selector with fit guidance** + **"Size help" drawer**, stock/low-stock status, quantity.
- **CTAs:** `Add to Cart`, `Buy Now`, **`Ask on WhatsApp` (size/stock)**, wishlist.
- **Mobile sticky purchase bar** (price + Add to Cart) on scroll.
- **Reassurance near CTA:** delivery Lebanon, COD, returns/help.
- **Accordions:** Description · Fit · Fabric & Care · Delivery · Returns · Payment.
- **Modules:** "Complete the Look", "Styled With", Related products, Reviews placeholder.
- Must beat MiniYo on **fit confidence + styling inspiration + urgency**.

---

## 8. Cart & Checkout flow

**Flow:** browse → filter → PDP → add → **mini-cart drawer** → cart review → checkout → confirmation. Plus WhatsApp inquiry from PDP and cart; guest checkout default; login optional, never forced pre-purchase.

### 8.1 Cart (upgraded vs MiniYo)
- Right-side **mini-cart drawer** with product thumb, **size/color summary**, inline qty edit, line totals.
- **Promo code** field, **estimated shipping** placeholder, **COD/payment trust** text.
- **WhatsApp help** CTA, **add-on recommendation** strip.
- Persistent / saved cart (localStorage + restore).

### 8.2 Checkout (tuned for Lebanon)
- **One-page accordion**: Contact → Delivery (Lebanon address UX: governorate/area → ties to existing `ShippingZone`) → Payment → Review.
- **Guest by default**; "have an account? log in" optional.
- Minimal fields, large inputs, **sticky "Place Order" CTA** on mobile.
- **Payment selector:** COD (default, active), **Whish** (placeholder), Card (placeholder), future local methods — designed for local trust.
- Order summary always visible/expandable. Secure-checkout + support messaging.
- Reuse existing order-creation, shipping-zone, gift-option, and confirmation-email logic; only restyle and reorder fields.

---

## 9. Account area (brand portal feel)
Reuse existing auth/customer model. Redesign UI: clean dashboard (recent order + quick links), Orders (history + track), Addresses (Lebanon-friendly), Wishlist, Profile (name/email/phone), Login & password management (uses the real OTP/reset flow already built), Preferences placeholder.

---

## 10. Footer (stronger, brand-clean)
Columns: **Help** (FAQ, Delivery, Returns, Payment, Track Order) · **Shop** (collections) · **AURA** (About, Contact) · **Connect** (WhatsApp, Instagram, newsletter signup placeholder). Bottom row: logo, copyright, legal links, and a **low-prominence admin access link** for staff.

---

## 11. New features beyond MiniYo (designed-in, some activated later)
1. Shop the Look / style bundles  2. Fit-based browsing cues  3. Stronger wishlist visibility  4. **Recently viewed** rail  5. Style-quiz/preference onboarding (placeholder)  6. **Size-help drawer**  7. New-drop/urgency block (+countdown)  8. Richer promo-banner system  9. Outfit-completion recommendations  10. UGC/social-ready section  11. Search with trend/category suggestions  12. Better empty states (wishlist/cart/no-results/account)  13. Saved/persistent cart  14. Sticky mobile bottom action bar  15. Announcement / flash-sale / low-stock components.

---

## 12. Mobile behavior rules
- Mobile-first build. Thumb-friendly ≥44px targets. Sticky add-to-cart (PDP) and sticky place-order (checkout). Sticky filter button on collections. Bottom nav optional (Home/Shop/Wishlist/Cart/Account). No tiny text (min 14px body), no cramped filters (drawer not inline). Fast image loading (lazy + skeletons).

---

## 13. Microcopy direction (samples)
- Hero: "LEVEL UP YOUR AURA." / "Clean fits. Limited drops. Delivered across Lebanon."
- Category tiles: "Tees", "Polos", "Jeans", "Sets", "Offers".
- Empty cart: "Your bag's empty. Time to build the fit." → "Shop New Arrivals".
- Low stock: "Almost gone." · Sold out: "Sold out — DM to restock."
- Trust: "Cash on delivery." · "Delivered all over Lebanon." · "Questions? Tap to WhatsApp."
- PDP fit: "Oversized fit. Model is 1.80m wearing M."
Voice: short, confident, stylish, direct. Never cheesy, corporate, or childish.

---

## 14. Component list (build checklist)
TopUtilityBar · Header (+ sticky) · SearchOverlay · MobileNavDrawer · MiniCartDrawer · Hero · CategoryTiles · ProductRail · ProductCard · CollectionFilters (+ MobileFilterDrawer) · SizePill · ColorSwatch · Badge · ShopTheLook · OfferBanner (+ CountdownBanner) · TrustStrip · InstagramGrid · Footer · PDPGallery · BuyBox · SizeHelpDrawer · StickyMobileCTA · Accordion · QuickViewModal · ImageZoom · CartLineItem · PromoCodeField · CheckoutAccordion · PaymentSelector · OrderSummary · AccountLayout · OrderHistoryItem · AddressForm · WishlistGrid · EmptyState · Skeletons · WhatsAppButton · SplashLogo.

---

## 15. Admin-controlled content → storefront mapping
All driven by existing entities (no new models). Where AURA needs a value MiniYo lacked, add a **`SiteSetting` key** (data, not schema change).

| Storefront element | Source (existing entity / setting) |
|---|---|
| Store name, social, WhatsApp | `SiteSetting`: `store_name`, `whatsapp_number`, `instagram_url`, `facebook_url` |
| Top-bar messages | `SiteSetting`: `announcement_messages` (new key, JSON array) |
| Hero (image, headline, CTAs) | existing CMS hero / `CmsSection` |
| Category tiles & nav order | `Category` (+ `display_order`) |
| New Arrivals / Best Sellers rails | `Product` flags (`is_new`, `is_best_seller`) / sort by date/sales |
| Offers / discounts / badges | `Product.compare_at_price_usd`, `Discount`/`PromoCode`, `is_limited`/`low_stock` |
| Shop-the-Look | `CmsSection` (look = title + product IDs) |
| Shipping by area | `ShippingZone` |
| Free-shipping threshold | `SiteSetting.free_shipping_threshold` |
| Trust strip copy | `SiteSetting` keys (delivery/COD/returns text) |
| Product fit/color/size | `Product` fields + `Variant` |
| Reviews | `Review` (already in model) |

**New `SiteSetting` keys to seed:** `announcement_messages`, `trust_delivery_text`, `trust_cod_text`, `trust_returns_text`, `whatsapp_help_text`, `brand_tagline`. (Plus repurpose existing logo/theme keys.)

---

## 16. Exact MiniYo → AURA storefront differences

| Dimension | MiniYo | AURA |
|---|---|---|
| Audience | Babies/kids, parents | Adult men |
| Personality | Soft, warm, family | Sharp, masculine, confident, drop-driven |
| Palette | Sage-teal, pastel, warm | Black / off-white / beige / charcoal / olive / navy |
| Shapes | Rounded, bubbly | Squared, crisp 1px borders, small radii |
| Type | Friendly | Modern grotesque, uppercase, tight tracking |
| Product card | Squarer, cute, soft | 4:5 editorial, hover 2nd image, fit tag, denser grid |
| Homepage | Story/emotional | Editorial + drops + shop-the-look + offers |
| PDP | Standard | Fit guidance, size-help drawer, sticky CTA, complete-the-look, WhatsApp ask |
| Filters | Basic | Size/color/fit, sticky mobile drawer |
| Commerce extras | — | Recently viewed, drops/urgency, bundles, persistent cart, richer promos |
| WhatsApp | Floating only | Floating + per-product + cart inquiry, AURA number +961 71 66 29 06 |
| Logo/brand | MiniYo bunny | AURA twin-peak mark, premium treatment in header/favicon/splash/empty states |
| Backend | (shared) | **Identical — unchanged** |

---

## 17. Recommended default launch placeholders (empty catalog)
Catalog ships **empty** (per decision) — set up structure only:
- **Categories (no products):** New Arrivals, Best Sellers, T-Shirts, Polos, Jeans, Matching Sets, Offers — with `display_order`.
- **CMS hero:** placeholder headline "LEVEL UP YOUR AURA", neutral beige background slot, CTA → Shop.
- **Top-bar messages:** delivery / COD / WhatsApp (above).
- **Trust strip & footer copy:** seeded from new `SiteSetting` keys.
- **Shipping zones:** reuse/adjust existing Lebanon zones (rename/verify governorates).
- **Empty states:** all wired with brand copy + CTA so the store looks intentional pre-catalog.
- **WhatsApp/IG:** AURA values seeded.
- Logo: AURA mark in header, favicon, splash, empty states.

---

### Build constraints (reminder)
- Backend, commerce engine, auth, **admin panel**, data model: **reuse, do not rebuild.**
- **Admin panel stays functionally identical** to MiniYo — same screens and behavior for: free-shipping threshold, **membership tiers & perks** (Bronze/Silver/Gold credits + discounts), product cards / catalog management, **inventory** (stock, low-stock, variants), categories, discounts/promo codes, orders, shipping zones, CMS, emails, settings. Only the admin's **branding** changes (logo, name "AURA", colors/title/favicon) — no feature removed, renamed, or restructured.
- Backend edits allowed **only** for storefront compatibility (new `SiteSetting` keys, exposing existing fields).
- Never remove existing functionality — only extend or correct it.
- Mobile-first, conversion-first, brand-distinct from MiniYo.

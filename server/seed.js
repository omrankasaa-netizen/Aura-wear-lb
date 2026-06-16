import crypto from 'node:crypto';
import {
  createRecord, queryRecords, countRecords, kvGet, kvSet, bulkCreate,
} from './db.js';
import { registerUser, findUserByEmail } from './auth.js';
import { DEFAULT_SHIPPING_ZONES } from './functions.js';

const SEED_VERSION = '2';

// Deterministic id from a string so products can reference categories by slug.
function idFromSlug(prefix, slug) {
  const h = crypto.createHash('sha1').update(`${prefix}:${slug}`).digest('hex').slice(0, 24);
  return `${prefix}-${h}`;
}

function slugify(s) {
  return String(s || '').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function seedAdmin() {
  const email = 'admin@aura.store';
  if (!findUserByEmail(email)) {
    registerUser({
      email,
      password: 'AuraSuper2026!',
      full_name: 'AURA Super Admin',
      role: 'super_admin',
    });
  }
}

function seedMembershipSettings() {
  if (queryRecords('MembershipSettings', { limit: 1 }).length > 0) return;
  createRecord('MembershipSettings', {
    bronze_credits: 2, bronze_discount_pct: 5,
    silver_threshold_usd: 100, silver_credits: 4, silver_discount_pct: 10,
    gold_threshold_usd: 250, gold_credits: 6, gold_discount_pct: 15,
    credit_expiry_days: 0,
  });
}

function seedSiteSettings() {
  const existing = queryRecords('SiteSetting', {});
  const have = new Set(existing.map((s) => s.setting_key));
  const defaults = {
    store_name: 'AURA',
    currency: 'USD',
    free_shipping_threshold: '50',
    payment_cod_enabled: 'true',
    payment_whish_enabled: 'false',
    payment_card_enabled: 'false',
    default_language: 'en',
    whatsapp_number: '+961 71 66 29 06',
    instagram_url: 'https://www.instagram.com/aura.wear.leb/',
    facebook_url: '',
    // AURA storefront content keys
    brand_tagline: 'LEVEL UP YOUR AURA',
    announcement_messages: JSON.stringify([
      'Delivery all over Lebanon 🇱🇧',
      'Cash on delivery available',
      'Questions? DM us on WhatsApp',
    ]),
    trust_delivery_text: 'Delivered all over Lebanon',
    trust_cod_text: 'Cash on delivery',
    trust_returns_text: 'Easy returns & exchanges',
    whatsapp_help_text: 'Questions? Tap to WhatsApp',
  };
  for (const [k, v] of Object.entries(defaults)) {
    if (!have.has(k)) createRecord('SiteSetting', { setting_key: k, setting_value: v });
  }
}

function seedShippingZones() {
  if (queryRecords('ShippingZone', { limit: 1 }).length > 0) return;
  bulkCreate('ShippingZone', DEFAULT_SHIPPING_ZONES);
}

// AURA ships with an EMPTY catalog — categories only, zero products.
// The 7 menswear collections, ordered via sort_order.
const AURA_CATEGORIES = [
  { name: 'New Arrivals', name_ar: 'الوصولات الجديدة' },
  { name: 'Best Sellers', name_ar: 'الأكثر مبيعاً' },
  { name: 'T-Shirts', name_ar: 'تيشيرتات' },
  { name: 'Polos', name_ar: 'بولو' },
  { name: 'Jeans', name_ar: 'جينز' },
  { name: 'Matching Sets', name_ar: 'أطقم' },
  { name: 'Offers', name_ar: 'عروض' },
];

function seedCatalog() {
  if (countRecords('Category') > 0 || countRecords('Product') > 0) return;

  const categories = AURA_CATEGORIES.map((c, i) => {
    const slug = slugify(c.name);
    return {
      id: idFromSlug('cat', slug),
      slug,
      name: c.name,
      name_ar: c.name_ar || c.name,
      parent_id: null,
      is_active: true,
      sort_order: i,
      display_order: i,
    };
  });

  bulkCreate('Category', categories);
  console.log(`[seed] catalog: ${categories.length} categories, 0 products (empty catalog)`);
}

export function runSeed() {
  if (kvGet('seed_version') === SEED_VERSION) {
    // Still ensure admin/settings idempotently in case of partial state.
    seedAdmin();
    seedMembershipSettings();
    seedSiteSettings();
    seedShippingZones();
    return;
  }
  seedAdmin();
  seedMembershipSettings();
  seedSiteSettings();
  seedShippingZones();
  seedCatalog();
  kvSet('seed_version', SEED_VERSION);
  console.log('[seed] complete');
}

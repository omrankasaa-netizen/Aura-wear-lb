import crypto from 'node:crypto';
import {
  createRecord, queryRecords, countRecords, kvGet, kvSet, bulkCreate, updateRecord,
} from './db.js';
import { registerUser, findUserByEmail } from './auth.js';
import { DEFAULT_SHIPPING_ZONES } from './functions.js';
import { seedStoreContent } from './seedContent.js';

const SEED_VERSION = '3';

// Deterministic id from a string so products can reference categories by slug.
function idFromSlug(prefix, slug) {
  const h = crypto.createHash('sha1').update(`${prefix}:${slug}`).digest('hex').slice(0, 24);
  return `${prefix}-${h}`;
}

function slugify(s) {
  return String(s || '').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Super-admin bootstrap. The password comes from the environment:
// AURA_ADMIN_PASSWORD (preferred) or MINIYO_ADMIN_PASSWORD (legacy fallback).
// In production we never seed with a hardcoded password — if no env password
// is set, log a loud warning and skip creating the account. Outside production
// a clearly-labelled dev-only default keeps local setup zero-config.
function seedAdmin() {
  const email = 'admin@aura.store';
  if (findUserByEmail(email)) return;
  let password = process.env.AURA_ADMIN_PASSWORD || process.env.MINIYO_ADMIN_PASSWORD;
  if (!password) {
    if (process.env.NODE_ENV === 'production') {
      console.warn('[seed] WARNING: AURA_ADMIN_PASSWORD is not set — skipping super-admin seeding. '
        + 'Set AURA_ADMIN_PASSWORD (or MINIYO_ADMIN_PASSWORD) to bootstrap admin@aura.store.');
      return;
    }
    password = 'aura-dev-only-change-me';
    console.warn('[seed] WARNING: seeding admin@aura.store with the dev-only default password '
      + '(NODE_ENV is not production). Set AURA_ADMIN_PASSWORD to override.');
  }
  registerUser({
    email,
    password,
    full_name: 'AURA Super Admin',
    role: 'super_admin',
  });
}

// Promote the owner + any AURA_SUPER_ADMIN_EMAILS to super_admin. Idempotent
// and promote-only: it never demotes an existing user, and creates a stub
// account (random password — owner uses "forgot password") if one is missing.
const OWNER_SUPER_ADMIN = 'omraniik@gmail.com';
function seedSuperAdmins() {
  const fromEnv = String(process.env.AURA_SUPER_ADMIN_EMAILS || '')
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const emails = [...new Set([OWNER_SUPER_ADMIN.toLowerCase(), ...fromEnv])];
  for (const email of emails) {
    const existing = findUserByEmail(email);
    if (!existing) {
      registerUser({
        email,
        password: crypto.randomUUID(),
        full_name: email.split('@')[0],
        role: 'super_admin',
      });
      console.log(`[seed] created super_admin ${email}`);
    } else if (existing.role !== 'super_admin') {
      updateRecord('User', existing.id, { role: 'super_admin' });
      console.log(`[seed] promoted ${email} to super_admin`);
    }
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

// AURA ships with a full menswear catalog (categories + 16 products with variants).
// === AURA categories (with hero/tile imagery) ===
const AURA_CATEGORIES = [
  { name: "New Arrivals", name_ar: "الوصولات الجديدة", image_url: "/brand/cat-new.jpg" },
  { name: "Best Sellers", name_ar: "الأكثر مبيعاً", image_url: "/brand/cat-best.jpg" },
  { name: "T-Shirts", name_ar: "تيشيرتات", image_url: "/brand/cat-tshirts.jpg" },
  { name: "Polos", name_ar: "بولو", image_url: "/brand/cat-polos.jpg" },
  { name: "Jeans", name_ar: "جينز", image_url: "/brand/cat-jeans.jpg" },
  { name: "Shirts", name_ar: "قمصان", image_url: "/brand/cat-shirts.jpg" },
  { name: "Joggers", name_ar: "جوغرز", image_url: "/brand/cat-joggers.jpg" },
  { name: "Pants", name_ar: "بناطيل", image_url: "/brand/cat-pants.jpg" },
  { name: "Matching Sets", name_ar: "أطقم", image_url: null },
  { name: "Offers", name_ar: "عروض", image_url: null },
];

// === AURA seed products (16) ===
const AURA_PRODUCTS = [
  {
    id: "prod-767883b571ad2841745ab6e2",
    slug: "straight-fit-jeans",
    name: "Straight-Fit Jeans",
    name_ar: "جينز بقصّة مستقيمة",
    short_description: "Clean straight-leg denim that works from Hamra to the office.",
    short_description_ar: "جينز بقصّة مستقيمة نظيفة يناسب كل يوم.",
    description: "A timeless straight fit in soft grey denim — structured but never stiff. Pairs with a basic tee for day or a polo for something sharper. Built to be your everyday pair.",
    description_ar: "قصّة مستقيمة كلاسيكية بلون رمادي ناعم — متينة وغير قاسية. تنسّق مع تيشيرت بسيط نهاراً أو بولو لإطلالة أنيق. رفيقك اليومي.",
    category_id: "cat-dbe971ff2ff9cab9c8172ce9",
    gender: 'Men',
    age_group: 'Adult',
    price_usd: 30.0,
    compare_at_price_usd: null,
    cost_usd: 11.0,
    sku: "AURA-SJ",
    tags: "jeans",
    is_new: false,
    is_featured: false,
    status: 'Active',
    has_variants: true,
    sizes: "30|31|32|34|36|38",
    colors: "Grey",
    stock_quantity: 0,
    reorder_level: 3,
  },
  {
    id: "prod-2857eb2e0ed9cc5750c10cb7",
    slug: "baggy-jeans",
    name: "Baggy Jeans",
    name_ar: "جينز واسع",
    short_description: "Relaxed baggy denim for an easy, modern streetwear look.",
    short_description_ar: "جينز واسع ومريح لإطلالة ستريت ويرعصرية.",
    description: "Roomy through the leg with a confident drop — the baggy fit Beirut's been asking for. Available in olive and blue, both made to move. Style with an oversized tee and clean sneakers.",
    description_ar: "واسع عند الساق بقصّة جريئة — الموديل الذي تنتظره بيروت. متوفّر بالزيتي والأزرق، الاثنان مصمّمان للحركة. نسّقه مع تيشيرت أوفرسايز وسنيكرز نظيفة.",
    category_id: "cat-dbe971ff2ff9cab9c8172ce9",
    gender: 'Men',
    age_group: 'Adult',
    price_usd: 35.0,
    compare_at_price_usd: null,
    cost_usd: 11.0,
    sku: "AURA-BJ",
    tags: "jeans",
    is_new: true,
    is_featured: true,
    status: 'Active',
    has_variants: true,
    sizes: "30|31|32|34|36|38",
    colors: "Olive|Blue",
    stock_quantity: 0,
    reorder_level: 3,
  },
  {
    id: "prod-102cbe217f8d32be76c477f9",
    slug: "linen-shirt",
    name: "Linen Shirt",
    name_ar: "قميص كتّان",
    short_description: "Breathable linen shirt made for Lebanese summers.",
    short_description_ar: "قميص كتّان يتنفّس، مصمّم لصيف لبنان.",
    description: "Lightweight linen that keeps you cool from the coast to the mountains. Wear it open over a tank or buttoned for dinner. Effortless, every time.",
    description_ar: "كتّان خفيف يبقيك منعشاً من الساحل إلى الجبل. البسه مفتوحاً فوق تانك توب أو مزرّراً للعشاء. أناقة بلا جهد.",
    category_id: "cat-acd7f57e329385e85511d1e0",
    gender: 'Men',
    age_group: 'Adult',
    price_usd: 25.0,
    compare_at_price_usd: null,
    cost_usd: 5.5,
    sku: "AURA-LS",
    tags: "shirts",
    is_new: true,
    is_featured: false,
    status: 'Active',
    has_variants: true,
    sizes: "S|M|L|XL|XXL",
    colors: "",
    stock_quantity: 0,
    reorder_level: 3,
  },
  {
    id: "prod-7de243ccf43da34762d14d7c",
    slug: "sport-jogger",
    name: "Sport Jogger",
    name_ar: "جوغر رياضي",
    short_description: "Soft sport joggers for the gym, the street, or the couch.",
    short_description_ar: "جوغر رياضي ناعم للنادي والشارع والبيت.",
    description: "Tapered jogger with a comfortable elastic waist and a clean athletic line. Green or grey, both wear-everywhere easy. Your go-to for moving fast.",
    description_ar: "جوغر بقصّة ضيّقة عند الأسفل وخصر مطّاطي مريح وخط رياضي نظيف. أخضر أو رمادي، الاثنان عمليّان لكل مكان.",
    category_id: "cat-269839744ef8695bf9063411",
    gender: 'Men',
    age_group: 'Adult',
    price_usd: 30.0,
    compare_at_price_usd: null,
    cost_usd: 8.0,
    sku: "AURA-SPJ",
    tags: "joggers",
    is_new: false,
    is_featured: false,
    status: 'Active',
    has_variants: true,
    sizes: "S|M|L|XL",
    colors: "Green|Grey",
    stock_quantity: 0,
    reorder_level: 3,
  },
  {
    id: "prod-f27bc90f990d8be6d7eaabc5",
    slug: "streetwear-tee",
    name: "Streetwear Tee",
    name_ar: "تيشيرت ستريت وير",
    short_description: "Heavyweight streetwear tee with a clean, boxy cut.",
    short_description_ar: "تيشيرت ستريت ويربقماش ثقيل وقصّة مربّعة نظيفة.",
    description: "Premium cotton with a structured drop that holds its shape wash after wash. Dark blue, white, or black — the foundation of any fit. Layer it or wear it solo.",
    description_ar: "قطن فاخر بقصّة تحافظ على شكلها بعد كل غسلة. أزرق غامق، أبيض أو أسود — أساس أي إطلالة.",
    category_id: "cat-73ca55db60379c3ae4dcf133",
    gender: 'Men',
    age_group: 'Adult',
    price_usd: 25.0,
    compare_at_price_usd: null,
    cost_usd: 6.0,
    sku: "AURA-ST",
    tags: "t-shirts",
    is_new: false,
    is_featured: true,
    status: 'Active',
    has_variants: true,
    sizes: "S|M|L|XL",
    colors: "Dark Blue|White|Black",
    stock_quantity: 0,
    reorder_level: 3,
  },
  {
    id: "prod-bfb4e1c34ac0bdfcf5ae0b10",
    slug: "striped-polo",
    name: "Striped Polo",
    name_ar: "بولو مخطّط",
    short_description: "Knit striped polo that levels up the everyday.",
    short_description_ar: "بولو مخطّط محبوك يرفع مستوى إطلالتك اليومية.",
    description: "A refined striped knit with a structured collar — smart enough for dinner, easy enough for daytime. Brown or navy stripes. The detail that makes the difference.",
    description_ar: "بولو محبوك مخطّط بياقة مرتّبة — أنيق للعشاء وعملي نهاراً. خطوط بنّية أو كحلية. التفصيل الذي يصنع الفرق.",
    category_id: "cat-eb24af0b61f14c3d3cc5aa9d",
    gender: 'Men',
    age_group: 'Adult',
    price_usd: 25.0,
    compare_at_price_usd: null,
    cost_usd: 6.5,
    sku: "AURA-SP",
    tags: "polos",
    is_new: true,
    is_featured: true,
    status: 'Active',
    has_variants: true,
    sizes: "S|M|L|XL|XXL",
    colors: "Brown Stripes|Navy Stipes",
    stock_quantity: 0,
    reorder_level: 3,
  },
  {
    id: "prod-59e683cd46cf3a53ea92fec0",
    slug: "linen-trousers",
    name: "Linen Trousers",
    name_ar: "بنطلون كتّان",
    short_description: "Relaxed linen trousers, cool and quietly elegant.",
    short_description_ar: "بنطلون كتّان مريح، منعش وأنيق بهدوء.",
    description: "Lightweight linen with a clean drape that breathes through the heat. Navy or beige, both dress up or down with ease. Summer, handled.",
    description_ar: "كتّان خفيف بانسدال نظيف يتنفّس في الحرّ. كحلي أو بيج، الاثنان يناسبان الإطلالات الرسمية والكاجوال.",
    category_id: "cat-e7b719aef9c3533b22a4770d",
    gender: 'Men',
    age_group: 'Adult',
    price_usd: 25.0,
    compare_at_price_usd: null,
    cost_usd: 9.5,
    sku: "AURA-LT",
    tags: "pants",
    is_new: false,
    is_featured: false,
    status: 'Active',
    has_variants: true,
    sizes: "S|M|L|XL|XXL",
    colors: "Navy|Beige",
    stock_quantity: 0,
    reorder_level: 3,
  },
  {
    id: "prod-0971409c9015e309523d0854",
    slug: "tank-top",
    name: "Tank Top",
    name_ar: "تانك توب",
    short_description: "Clean cotton tank for layering or summer days.",
    short_description_ar: "تانك توب قطني نظيف للتلبيس أو لأيام الصيف.",
    description: "A soft, fitted tank that works under an open shirt or on its own when it's hot. The simple piece every wardrobe needs.",
    description_ar: "تانك ناعم بقصّة مضبوطة، يُلبس تحت قميص مفتوح أو لوحده في الحرّ. القطعة البسيطة التي يحتاجها كل خزانة.",
    category_id: "cat-73ca55db60379c3ae4dcf133",
    gender: 'Men',
    age_group: 'Adult',
    price_usd: 12.0,
    compare_at_price_usd: null,
    cost_usd: null,
    sku: "AURA-TT",
    tags: "t-shirts",
    is_new: false,
    is_featured: false,
    status: 'Active',
    has_variants: true,
    sizes: "S|M|L|XL",
    colors: "",
    stock_quantity: 0,
    reorder_level: 3,
  },
  {
    id: "prod-2e6fad22ca5374ab20193bf6",
    slug: "classic-black-trousers",
    name: "Classic Black Trousers",
    name_ar: "بنطلون أسود كلاسيكي",
    short_description: "Sharp black trousers that go anywhere.",
    short_description_ar: "بنطلون أسود كلاسيكي يناسب كل مناسبة.",
    description: "A clean tailored line in essential black — from the office to a night out. The one pair that never lets you down.",
    description_ar: "خط مفصّل نظيف بالأسود الأساسي — من المكتب إلى السهرة. القطعة التي لا تخذلك أبداً.",
    category_id: "cat-e7b719aef9c3533b22a4770d",
    gender: 'Men',
    age_group: 'Adult',
    price_usd: 30.0,
    compare_at_price_usd: null,
    cost_usd: 10.0,
    sku: "AURA-CBT",
    tags: "pants",
    is_new: false,
    is_featured: false,
    status: 'Active',
    has_variants: true,
    sizes: "S|M|L|XL",
    colors: "Black",
    stock_quantity: 0,
    reorder_level: 3,
  },
  {
    id: "prod-dafb58c15542171a7b4dd15f",
    slug: "basic-tee",
    name: "Basic Tee",
    name_ar: "تيشيرت أساسي",
    short_description: "The essential cotton tee — soft, durable, everyday.",
    short_description_ar: "التيشيرت القطني الأساسي — ناعم، متين، لكل يوم.",
    description: "Mid-weight cotton with a clean regular fit that just works. The building block of every outfit, priced to stock up.",
    description_ar: "قطن متوسط الوزن بقصّة ريغولر نظيفة. أساس كل إطلالة، بسعر يشجّع على التخزين.",
    category_id: "cat-73ca55db60379c3ae4dcf133",
    gender: 'Men',
    age_group: 'Adult',
    price_usd: 15.0,
    compare_at_price_usd: null,
    cost_usd: 6.0,
    sku: "AURA-BT",
    tags: "t-shirts",
    is_new: false,
    is_featured: false,
    status: 'Active',
    has_variants: true,
    sizes: "S|M|L|XL|XXL",
    colors: "",
    stock_quantity: 0,
    reorder_level: 3,
  },
  {
    id: "prod-43dae520820af0b5398e119f",
    slug: "oversized-tee-09",
    name: "Oversized Tee 09",
    name_ar: "تيشيرت أوفرسايز 09",
    short_description: "Oversized tee with a bold drop-shoulder cut.",
    short_description_ar: "تيشيرت أوفرسايز بقصّة كتف منسدلة جريئة.",
    description: "Heavyweight cotton with an intentional oversized fit — relaxed, confident, street-ready. Brown-grey or cherry. Wear loose, look sharp.",
    description_ar: "قطن ثقيل بقصّة أوفرسايز مقصودة — مريح وواثق وجاهز للشارع. بنّي-رمادي أو كرزي.",
    category_id: "cat-73ca55db60379c3ae4dcf133",
    gender: 'Men',
    age_group: 'Adult',
    price_usd: 35.0,
    compare_at_price_usd: null,
    cost_usd: 13.0,
    sku: "AURA-OT9",
    tags: "t-shirts",
    is_new: true,
    is_featured: true,
    status: 'Active',
    has_variants: true,
    sizes: "S|M|L|XL",
    colors: "Brown Grey|Cherry",
    stock_quantity: 0,
    reorder_level: 3,
  },
  {
    id: "prod-ade3adee7fb1374f25454150",
    slug: "streetwear-jogger",
    name: "Streetwear Jogger",
    name_ar: "جوغر ستريت وير",
    short_description: "Streetwear jogger in four clean colorways.",
    short_description_ar: "جوغر ستريت ويربأربعة ألوان نظيفة.",
    description: "Tapered, soft, and built for the everyday rotation. White, green, black, or grey — pick your base and build the fit around it.",
    description_ar: "ضيّق عند الأسفل، ناعم، ومصمّم للاستعمال اليومي. أبيض، أخضر، أسود أو رمادي.",
    category_id: "cat-269839744ef8695bf9063411",
    gender: 'Men',
    age_group: 'Adult',
    price_usd: 30.0,
    compare_at_price_usd: null,
    cost_usd: 8.25,
    sku: "AURA-SWJ",
    tags: "joggers",
    is_new: true,
    is_featured: false,
    status: 'Active',
    has_variants: true,
    sizes: "S|M|L|XL|XXL",
    colors: "White|Green|Black|Grey",
    stock_quantity: 0,
    reorder_level: 3,
  },
  {
    id: "prod-64fb89e0cac41becc7b133ce",
    slug: "streetwear-tee-regular",
    name: "Streetwear Tee — Regular",
    name_ar: "تيشيرت ستريت وير ريغولر",
    short_description: "Regular-fit streetwear tee in core colors.",
    short_description_ar: "تيشيرت ستريت ويربقصّة ريغولر بألوان أساسية.",
    description: "A cleaner, closer cut for when you want streetwear without the volume. White, black, or grey. Simple done right.",
    description_ar: "قصّة أنظف وأقرب للجسم لمن يريد ستريت ويربلا حجم زائد. أبيض، أسود أو رمادي.",
    category_id: "cat-73ca55db60379c3ae4dcf133",
    gender: 'Men',
    age_group: 'Adult',
    price_usd: 25.0,
    compare_at_price_usd: null,
    cost_usd: 6.0,
    sku: "AURA-STR",
    tags: "t-shirts",
    is_new: false,
    is_featured: false,
    status: 'Active',
    has_variants: true,
    sizes: "S|M|L|XL|XXL",
    colors: "White|Black|Grey",
    stock_quantity: 0,
    reorder_level: 3,
  },
  {
    id: "prod-401e210155a1a6e4fd6ca879",
    slug: "trico-knit-tee",
    name: "Trico Knit Tee",
    name_ar: "تيشيرت تريكو محبوك",
    short_description: "Textured trico-knit tee with a premium feel.",
    short_description_ar: "تيشيرت محبوك بملمس تريكو وإحساس فاخر.",
    description: "A subtle knit texture that elevates a simple silhouette. Beige or black — quietly upscale, easy to wear.",
    description_ar: "ملمس محبوك خفيف يرفع مستوى القصّة البسيطة. بيج أو أسود — راقٍ بهدوء وسهل الارتداء.",
    category_id: "cat-73ca55db60379c3ae4dcf133",
    gender: 'Men',
    age_group: 'Adult',
    price_usd: 25.0,
    compare_at_price_usd: null,
    cost_usd: 8.25,
    sku: "AURA-TKT",
    tags: "t-shirts",
    is_new: false,
    is_featured: false,
    status: 'Active',
    has_variants: true,
    sizes: "S|M|L|XL|XXL",
    colors: "Beige|Black",
    stock_quantity: 0,
    reorder_level: 3,
  },
  {
    id: "prod-eb84f8d73161effebd7a7fa1",
    slug: "essential-tee",
    name: "Essential Tee",
    name_ar: "تيشيرت إيسنشال",
    short_description: "Five-color essential tee — your everyday foundation.",
    short_description_ar: "تيشيرت أساسي بخمسة ألوان — قاعدة إطلالتك اليومية.",
    description: "Soft, reliable cotton in the colors you actually wear: white, black, grey, dark navy, blue. Stock up and never think about it again.",
    description_ar: "قطن ناعم وموثوق بالألوان التي تلبسها فعلاً: أبيض، أسود، رمادي، كحلي غامق، أزرق.",
    category_id: "cat-73ca55db60379c3ae4dcf133",
    gender: 'Men',
    age_group: 'Adult',
    price_usd: 15.0,
    compare_at_price_usd: null,
    cost_usd: 5.5,
    sku: "AURA-ET",
    tags: "t-shirts",
    is_new: false,
    is_featured: false,
    status: 'Active',
    has_variants: true,
    sizes: "S|M|L|XL|XXL",
    colors: "White|Black|Grey|Dark Navy|Blue",
    stock_quantity: 0,
    reorder_level: 3,
  },
  {
    id: "prod-c07ba3b3935248caaf8aff29",
    slug: "oversized-tee-22",
    name: "Oversized Tee 22",
    name_ar: "تيشيرت أوفرسايز 22",
    short_description: "Oversized tee 22 in a clean washed blue.",
    short_description_ar: "تيشيرت أوفرسايز 22 بأزرق مغسول نظيف.",
    description: "A relaxed drop-shoulder fit in an easy blue — the laid-back staple for warm days and cool nights.",
    description_ar: "قصّة كتف منسدلة مريحة بأزرق سهل — القطعة الكاجوال لأيام الدفء وليالي الاعتدال.",
    category_id: "cat-73ca55db60379c3ae4dcf133",
    gender: 'Men',
    age_group: 'Adult',
    price_usd: 35.0,
    compare_at_price_usd: null,
    cost_usd: 8.0,
    sku: "AURA-OT22",
    tags: "t-shirts",
    is_new: false,
    is_featured: false,
    status: 'Active',
    has_variants: true,
    sizes: "S|M|L|XL|XXL",
    colors: "Blue",
    stock_quantity: 0,
    reorder_level: 3,
  },
];

// === AURA seed variants ===
const AURA_VARIANTS = [
  { product_id: "prod-767883b571ad2841745ab6e2", variant_sku: "AURA-SJ-30-Grey", size: "30", color: "Grey", qty_on_hand: 2, qty_reserved: 0 },
  { product_id: "prod-767883b571ad2841745ab6e2", variant_sku: "AURA-SJ-31-Grey", size: "31", color: "Grey", qty_on_hand: 2, qty_reserved: 0 },
  { product_id: "prod-767883b571ad2841745ab6e2", variant_sku: "AURA-SJ-32-Grey", size: "32", color: "Grey", qty_on_hand: 2, qty_reserved: 0 },
  { product_id: "prod-767883b571ad2841745ab6e2", variant_sku: "AURA-SJ-34-Grey", size: "34", color: "Grey", qty_on_hand: 2, qty_reserved: 0 },
  { product_id: "prod-767883b571ad2841745ab6e2", variant_sku: "AURA-SJ-36-Grey", size: "36", color: "Grey", qty_on_hand: 2, qty_reserved: 0 },
  { product_id: "prod-767883b571ad2841745ab6e2", variant_sku: "AURA-SJ-38-Grey", size: "38", color: "Grey", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-2857eb2e0ed9cc5750c10cb7", variant_sku: "AURA-BJ-30-Olive", size: "30", color: "Olive", qty_on_hand: 2, qty_reserved: 0 },
  { product_id: "prod-2857eb2e0ed9cc5750c10cb7", variant_sku: "AURA-BJ-30-Blue", size: "30", color: "Blue", qty_on_hand: 2, qty_reserved: 0 },
  { product_id: "prod-2857eb2e0ed9cc5750c10cb7", variant_sku: "AURA-BJ-31-Olive", size: "31", color: "Olive", qty_on_hand: 2, qty_reserved: 0 },
  { product_id: "prod-2857eb2e0ed9cc5750c10cb7", variant_sku: "AURA-BJ-31-Blue", size: "31", color: "Blue", qty_on_hand: 2, qty_reserved: 0 },
  { product_id: "prod-2857eb2e0ed9cc5750c10cb7", variant_sku: "AURA-BJ-32-Olive", size: "32", color: "Olive", qty_on_hand: 2, qty_reserved: 0 },
  { product_id: "prod-2857eb2e0ed9cc5750c10cb7", variant_sku: "AURA-BJ-32-Blue", size: "32", color: "Blue", qty_on_hand: 2, qty_reserved: 0 },
  { product_id: "prod-2857eb2e0ed9cc5750c10cb7", variant_sku: "AURA-BJ-34-Olive", size: "34", color: "Olive", qty_on_hand: 2, qty_reserved: 0 },
  { product_id: "prod-2857eb2e0ed9cc5750c10cb7", variant_sku: "AURA-BJ-34-Blue", size: "34", color: "Blue", qty_on_hand: 2, qty_reserved: 0 },
  { product_id: "prod-2857eb2e0ed9cc5750c10cb7", variant_sku: "AURA-BJ-36-Olive", size: "36", color: "Olive", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-2857eb2e0ed9cc5750c10cb7", variant_sku: "AURA-BJ-36-Blue", size: "36", color: "Blue", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-2857eb2e0ed9cc5750c10cb7", variant_sku: "AURA-BJ-38-Olive", size: "38", color: "Olive", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-2857eb2e0ed9cc5750c10cb7", variant_sku: "AURA-BJ-38-Blue", size: "38", color: "Blue", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-102cbe217f8d32be76c477f9", variant_sku: "AURA-LS-S", size: "S", color: null, qty_on_hand: 3, qty_reserved: 0 },
  { product_id: "prod-102cbe217f8d32be76c477f9", variant_sku: "AURA-LS-M", size: "M", color: null, qty_on_hand: 3, qty_reserved: 0 },
  { product_id: "prod-102cbe217f8d32be76c477f9", variant_sku: "AURA-LS-L", size: "L", color: null, qty_on_hand: 3, qty_reserved: 0 },
  { product_id: "prod-102cbe217f8d32be76c477f9", variant_sku: "AURA-LS-XL", size: "XL", color: null, qty_on_hand: 3, qty_reserved: 0 },
  { product_id: "prod-102cbe217f8d32be76c477f9", variant_sku: "AURA-LS-XXL", size: "XXL", color: null, qty_on_hand: 3, qty_reserved: 0 },
  { product_id: "prod-7de243ccf43da34762d14d7c", variant_sku: "AURA-SPJ-S-Green", size: "S", color: "Green", qty_on_hand: 2, qty_reserved: 0 },
  { product_id: "prod-7de243ccf43da34762d14d7c", variant_sku: "AURA-SPJ-S-Grey", size: "S", color: "Grey", qty_on_hand: 2, qty_reserved: 0 },
  { product_id: "prod-7de243ccf43da34762d14d7c", variant_sku: "AURA-SPJ-M-Green", size: "M", color: "Green", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-7de243ccf43da34762d14d7c", variant_sku: "AURA-SPJ-M-Grey", size: "M", color: "Grey", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-7de243ccf43da34762d14d7c", variant_sku: "AURA-SPJ-L-Green", size: "L", color: "Green", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-7de243ccf43da34762d14d7c", variant_sku: "AURA-SPJ-L-Grey", size: "L", color: "Grey", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-7de243ccf43da34762d14d7c", variant_sku: "AURA-SPJ-XL-Green", size: "XL", color: "Green", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-7de243ccf43da34762d14d7c", variant_sku: "AURA-SPJ-XL-Grey", size: "XL", color: "Grey", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-f27bc90f990d8be6d7eaabc5", variant_sku: "AURA-ST-S-Dark Blue", size: "S", color: "Dark Blue", qty_on_hand: 2, qty_reserved: 0 },
  { product_id: "prod-f27bc90f990d8be6d7eaabc5", variant_sku: "AURA-ST-S-White", size: "S", color: "White", qty_on_hand: 2, qty_reserved: 0 },
  { product_id: "prod-f27bc90f990d8be6d7eaabc5", variant_sku: "AURA-ST-S-Black", size: "S", color: "Black", qty_on_hand: 2, qty_reserved: 0 },
  { product_id: "prod-f27bc90f990d8be6d7eaabc5", variant_sku: "AURA-ST-M-Dark Blue", size: "M", color: "Dark Blue", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-f27bc90f990d8be6d7eaabc5", variant_sku: "AURA-ST-M-White", size: "M", color: "White", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-f27bc90f990d8be6d7eaabc5", variant_sku: "AURA-ST-M-Black", size: "M", color: "Black", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-f27bc90f990d8be6d7eaabc5", variant_sku: "AURA-ST-L-Dark Blue", size: "L", color: "Dark Blue", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-f27bc90f990d8be6d7eaabc5", variant_sku: "AURA-ST-L-White", size: "L", color: "White", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-f27bc90f990d8be6d7eaabc5", variant_sku: "AURA-ST-L-Black", size: "L", color: "Black", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-f27bc90f990d8be6d7eaabc5", variant_sku: "AURA-ST-XL-Dark Blue", size: "XL", color: "Dark Blue", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-f27bc90f990d8be6d7eaabc5", variant_sku: "AURA-ST-XL-White", size: "XL", color: "White", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-f27bc90f990d8be6d7eaabc5", variant_sku: "AURA-ST-XL-Black", size: "XL", color: "Black", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-bfb4e1c34ac0bdfcf5ae0b10", variant_sku: "AURA-SP-S-Brown Stripes", size: "S", color: "Brown Stripes", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-bfb4e1c34ac0bdfcf5ae0b10", variant_sku: "AURA-SP-S-Navy Stipes", size: "S", color: "Navy Stipes", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-bfb4e1c34ac0bdfcf5ae0b10", variant_sku: "AURA-SP-M-Brown Stripes", size: "M", color: "Brown Stripes", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-bfb4e1c34ac0bdfcf5ae0b10", variant_sku: "AURA-SP-M-Navy Stipes", size: "M", color: "Navy Stipes", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-bfb4e1c34ac0bdfcf5ae0b10", variant_sku: "AURA-SP-L-Brown Stripes", size: "L", color: "Brown Stripes", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-bfb4e1c34ac0bdfcf5ae0b10", variant_sku: "AURA-SP-L-Navy Stipes", size: "L", color: "Navy Stipes", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-bfb4e1c34ac0bdfcf5ae0b10", variant_sku: "AURA-SP-XL-Brown Stripes", size: "XL", color: "Brown Stripes", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-bfb4e1c34ac0bdfcf5ae0b10", variant_sku: "AURA-SP-XL-Navy Stipes", size: "XL", color: "Navy Stipes", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-bfb4e1c34ac0bdfcf5ae0b10", variant_sku: "AURA-SP-XXL-Brown Stripes", size: "XXL", color: "Brown Stripes", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-bfb4e1c34ac0bdfcf5ae0b10", variant_sku: "AURA-SP-XXL-Navy Stipes", size: "XXL", color: "Navy Stipes", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-59e683cd46cf3a53ea92fec0", variant_sku: "AURA-LT-S-Navy", size: "S", color: "Navy", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-59e683cd46cf3a53ea92fec0", variant_sku: "AURA-LT-S-Beige", size: "S", color: "Beige", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-59e683cd46cf3a53ea92fec0", variant_sku: "AURA-LT-M-Navy", size: "M", color: "Navy", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-59e683cd46cf3a53ea92fec0", variant_sku: "AURA-LT-M-Beige", size: "M", color: "Beige", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-59e683cd46cf3a53ea92fec0", variant_sku: "AURA-LT-L-Navy", size: "L", color: "Navy", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-59e683cd46cf3a53ea92fec0", variant_sku: "AURA-LT-L-Beige", size: "L", color: "Beige", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-59e683cd46cf3a53ea92fec0", variant_sku: "AURA-LT-XL-Navy", size: "XL", color: "Navy", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-59e683cd46cf3a53ea92fec0", variant_sku: "AURA-LT-XL-Beige", size: "XL", color: "Beige", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-59e683cd46cf3a53ea92fec0", variant_sku: "AURA-LT-XXL-Navy", size: "XXL", color: "Navy", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-59e683cd46cf3a53ea92fec0", variant_sku: "AURA-LT-XXL-Beige", size: "XXL", color: "Beige", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-0971409c9015e309523d0854", variant_sku: "AURA-TT-S", size: "S", color: null, qty_on_hand: 4, qty_reserved: 0 },
  { product_id: "prod-0971409c9015e309523d0854", variant_sku: "AURA-TT-M", size: "M", color: null, qty_on_hand: 4, qty_reserved: 0 },
  { product_id: "prod-0971409c9015e309523d0854", variant_sku: "AURA-TT-L", size: "L", color: null, qty_on_hand: 3, qty_reserved: 0 },
  { product_id: "prod-0971409c9015e309523d0854", variant_sku: "AURA-TT-XL", size: "XL", color: null, qty_on_hand: 3, qty_reserved: 0 },
  { product_id: "prod-2e6fad22ca5374ab20193bf6", variant_sku: "AURA-CBT-S-Black", size: "S", color: "Black", qty_on_hand: 2, qty_reserved: 0 },
  { product_id: "prod-2e6fad22ca5374ab20193bf6", variant_sku: "AURA-CBT-M-Black", size: "M", color: "Black", qty_on_hand: 2, qty_reserved: 0 },
  { product_id: "prod-2e6fad22ca5374ab20193bf6", variant_sku: "AURA-CBT-L-Black", size: "L", color: "Black", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-2e6fad22ca5374ab20193bf6", variant_sku: "AURA-CBT-XL-Black", size: "XL", color: "Black", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-dafb58c15542171a7b4dd15f", variant_sku: "AURA-BT-S", size: "S", color: null, qty_on_hand: 5, qty_reserved: 0 },
  { product_id: "prod-dafb58c15542171a7b4dd15f", variant_sku: "AURA-BT-M", size: "M", color: null, qty_on_hand: 5, qty_reserved: 0 },
  { product_id: "prod-dafb58c15542171a7b4dd15f", variant_sku: "AURA-BT-L", size: "L", color: null, qty_on_hand: 5, qty_reserved: 0 },
  { product_id: "prod-dafb58c15542171a7b4dd15f", variant_sku: "AURA-BT-XL", size: "XL", color: null, qty_on_hand: 5, qty_reserved: 0 },
  { product_id: "prod-dafb58c15542171a7b4dd15f", variant_sku: "AURA-BT-XXL", size: "XXL", color: null, qty_on_hand: 5, qty_reserved: 0 },
  { product_id: "prod-43dae520820af0b5398e119f", variant_sku: "AURA-OT9-S-Brown Grey", size: "S", color: "Brown Grey", qty_on_hand: 2, qty_reserved: 0 },
  { product_id: "prod-43dae520820af0b5398e119f", variant_sku: "AURA-OT9-S-Cherry", size: "S", color: "Cherry", qty_on_hand: 2, qty_reserved: 0 },
  { product_id: "prod-43dae520820af0b5398e119f", variant_sku: "AURA-OT9-M-Brown Grey", size: "M", color: "Brown Grey", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-43dae520820af0b5398e119f", variant_sku: "AURA-OT9-M-Cherry", size: "M", color: "Cherry", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-43dae520820af0b5398e119f", variant_sku: "AURA-OT9-L-Brown Grey", size: "L", color: "Brown Grey", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-43dae520820af0b5398e119f", variant_sku: "AURA-OT9-L-Cherry", size: "L", color: "Cherry", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-43dae520820af0b5398e119f", variant_sku: "AURA-OT9-XL-Brown Grey", size: "XL", color: "Brown Grey", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-43dae520820af0b5398e119f", variant_sku: "AURA-OT9-XL-Cherry", size: "XL", color: "Cherry", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-ade3adee7fb1374f25454150", variant_sku: "AURA-SWJ-S-White", size: "S", color: "White", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-ade3adee7fb1374f25454150", variant_sku: "AURA-SWJ-S-Green", size: "S", color: "Green", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-ade3adee7fb1374f25454150", variant_sku: "AURA-SWJ-S-Black", size: "S", color: "Black", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-ade3adee7fb1374f25454150", variant_sku: "AURA-SWJ-S-Grey", size: "S", color: "Grey", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-ade3adee7fb1374f25454150", variant_sku: "AURA-SWJ-M-White", size: "M", color: "White", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-ade3adee7fb1374f25454150", variant_sku: "AURA-SWJ-M-Green", size: "M", color: "Green", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-ade3adee7fb1374f25454150", variant_sku: "AURA-SWJ-M-Black", size: "M", color: "Black", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-ade3adee7fb1374f25454150", variant_sku: "AURA-SWJ-M-Grey", size: "M", color: "Grey", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-ade3adee7fb1374f25454150", variant_sku: "AURA-SWJ-L-White", size: "L", color: "White", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-ade3adee7fb1374f25454150", variant_sku: "AURA-SWJ-L-Green", size: "L", color: "Green", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-ade3adee7fb1374f25454150", variant_sku: "AURA-SWJ-L-Black", size: "L", color: "Black", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-ade3adee7fb1374f25454150", variant_sku: "AURA-SWJ-L-Grey", size: "L", color: "Grey", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-ade3adee7fb1374f25454150", variant_sku: "AURA-SWJ-XL-White", size: "XL", color: "White", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-ade3adee7fb1374f25454150", variant_sku: "AURA-SWJ-XL-Green", size: "XL", color: "Green", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-ade3adee7fb1374f25454150", variant_sku: "AURA-SWJ-XL-Black", size: "XL", color: "Black", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-ade3adee7fb1374f25454150", variant_sku: "AURA-SWJ-XL-Grey", size: "XL", color: "Grey", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-ade3adee7fb1374f25454150", variant_sku: "AURA-SWJ-XXL-White", size: "XXL", color: "White", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-ade3adee7fb1374f25454150", variant_sku: "AURA-SWJ-XXL-Green", size: "XXL", color: "Green", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-ade3adee7fb1374f25454150", variant_sku: "AURA-SWJ-XXL-Black", size: "XXL", color: "Black", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-ade3adee7fb1374f25454150", variant_sku: "AURA-SWJ-XXL-Grey", size: "XXL", color: "Grey", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-64fb89e0cac41becc7b133ce", variant_sku: "AURA-STR-S-White", size: "S", color: "White", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-64fb89e0cac41becc7b133ce", variant_sku: "AURA-STR-S-Black", size: "S", color: "Black", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-64fb89e0cac41becc7b133ce", variant_sku: "AURA-STR-S-Grey", size: "S", color: "Grey", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-64fb89e0cac41becc7b133ce", variant_sku: "AURA-STR-M-White", size: "M", color: "White", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-64fb89e0cac41becc7b133ce", variant_sku: "AURA-STR-M-Black", size: "M", color: "Black", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-64fb89e0cac41becc7b133ce", variant_sku: "AURA-STR-M-Grey", size: "M", color: "Grey", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-64fb89e0cac41becc7b133ce", variant_sku: "AURA-STR-L-White", size: "L", color: "White", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-64fb89e0cac41becc7b133ce", variant_sku: "AURA-STR-L-Black", size: "L", color: "Black", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-64fb89e0cac41becc7b133ce", variant_sku: "AURA-STR-L-Grey", size: "L", color: "Grey", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-64fb89e0cac41becc7b133ce", variant_sku: "AURA-STR-XL-White", size: "XL", color: "White", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-64fb89e0cac41becc7b133ce", variant_sku: "AURA-STR-XL-Black", size: "XL", color: "Black", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-64fb89e0cac41becc7b133ce", variant_sku: "AURA-STR-XL-Grey", size: "XL", color: "Grey", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-64fb89e0cac41becc7b133ce", variant_sku: "AURA-STR-XXL-White", size: "XXL", color: "White", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-64fb89e0cac41becc7b133ce", variant_sku: "AURA-STR-XXL-Black", size: "XXL", color: "Black", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-64fb89e0cac41becc7b133ce", variant_sku: "AURA-STR-XXL-Grey", size: "XXL", color: "Grey", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-401e210155a1a6e4fd6ca879", variant_sku: "AURA-TKT-S-Beige", size: "S", color: "Beige", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-401e210155a1a6e4fd6ca879", variant_sku: "AURA-TKT-S-Black", size: "S", color: "Black", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-401e210155a1a6e4fd6ca879", variant_sku: "AURA-TKT-M-Beige", size: "M", color: "Beige", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-401e210155a1a6e4fd6ca879", variant_sku: "AURA-TKT-M-Black", size: "M", color: "Black", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-401e210155a1a6e4fd6ca879", variant_sku: "AURA-TKT-L-Beige", size: "L", color: "Beige", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-401e210155a1a6e4fd6ca879", variant_sku: "AURA-TKT-L-Black", size: "L", color: "Black", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-401e210155a1a6e4fd6ca879", variant_sku: "AURA-TKT-XL-Beige", size: "XL", color: "Beige", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-401e210155a1a6e4fd6ca879", variant_sku: "AURA-TKT-XL-Black", size: "XL", color: "Black", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-401e210155a1a6e4fd6ca879", variant_sku: "AURA-TKT-XXL-Beige", size: "XXL", color: "Beige", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-401e210155a1a6e4fd6ca879", variant_sku: "AURA-TKT-XXL-Black", size: "XXL", color: "Black", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-eb84f8d73161effebd7a7fa1", variant_sku: "AURA-ET-S-White", size: "S", color: "White", qty_on_hand: 2, qty_reserved: 0 },
  { product_id: "prod-eb84f8d73161effebd7a7fa1", variant_sku: "AURA-ET-S-Black", size: "S", color: "Black", qty_on_hand: 2, qty_reserved: 0 },
  { product_id: "prod-eb84f8d73161effebd7a7fa1", variant_sku: "AURA-ET-S-Grey", size: "S", color: "Grey", qty_on_hand: 2, qty_reserved: 0 },
  { product_id: "prod-eb84f8d73161effebd7a7fa1", variant_sku: "AURA-ET-S-Dark Navy", size: "S", color: "Dark Navy", qty_on_hand: 2, qty_reserved: 0 },
  { product_id: "prod-eb84f8d73161effebd7a7fa1", variant_sku: "AURA-ET-S-Blue", size: "S", color: "Blue", qty_on_hand: 2, qty_reserved: 0 },
  { product_id: "prod-eb84f8d73161effebd7a7fa1", variant_sku: "AURA-ET-M-White", size: "M", color: "White", qty_on_hand: 2, qty_reserved: 0 },
  { product_id: "prod-eb84f8d73161effebd7a7fa1", variant_sku: "AURA-ET-M-Black", size: "M", color: "Black", qty_on_hand: 2, qty_reserved: 0 },
  { product_id: "prod-eb84f8d73161effebd7a7fa1", variant_sku: "AURA-ET-M-Grey", size: "M", color: "Grey", qty_on_hand: 2, qty_reserved: 0 },
  { product_id: "prod-eb84f8d73161effebd7a7fa1", variant_sku: "AURA-ET-M-Dark Navy", size: "M", color: "Dark Navy", qty_on_hand: 2, qty_reserved: 0 },
  { product_id: "prod-eb84f8d73161effebd7a7fa1", variant_sku: "AURA-ET-M-Blue", size: "M", color: "Blue", qty_on_hand: 2, qty_reserved: 0 },
  { product_id: "prod-eb84f8d73161effebd7a7fa1", variant_sku: "AURA-ET-L-White", size: "L", color: "White", qty_on_hand: 2, qty_reserved: 0 },
  { product_id: "prod-eb84f8d73161effebd7a7fa1", variant_sku: "AURA-ET-L-Black", size: "L", color: "Black", qty_on_hand: 2, qty_reserved: 0 },
  { product_id: "prod-eb84f8d73161effebd7a7fa1", variant_sku: "AURA-ET-L-Grey", size: "L", color: "Grey", qty_on_hand: 2, qty_reserved: 0 },
  { product_id: "prod-eb84f8d73161effebd7a7fa1", variant_sku: "AURA-ET-L-Dark Navy", size: "L", color: "Dark Navy", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-eb84f8d73161effebd7a7fa1", variant_sku: "AURA-ET-L-Blue", size: "L", color: "Blue", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-eb84f8d73161effebd7a7fa1", variant_sku: "AURA-ET-XL-White", size: "XL", color: "White", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-eb84f8d73161effebd7a7fa1", variant_sku: "AURA-ET-XL-Black", size: "XL", color: "Black", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-eb84f8d73161effebd7a7fa1", variant_sku: "AURA-ET-XL-Grey", size: "XL", color: "Grey", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-eb84f8d73161effebd7a7fa1", variant_sku: "AURA-ET-XL-Dark Navy", size: "XL", color: "Dark Navy", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-eb84f8d73161effebd7a7fa1", variant_sku: "AURA-ET-XL-Blue", size: "XL", color: "Blue", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-eb84f8d73161effebd7a7fa1", variant_sku: "AURA-ET-XXL-White", size: "XXL", color: "White", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-eb84f8d73161effebd7a7fa1", variant_sku: "AURA-ET-XXL-Black", size: "XXL", color: "Black", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-eb84f8d73161effebd7a7fa1", variant_sku: "AURA-ET-XXL-Grey", size: "XXL", color: "Grey", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-eb84f8d73161effebd7a7fa1", variant_sku: "AURA-ET-XXL-Dark Navy", size: "XXL", color: "Dark Navy", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-eb84f8d73161effebd7a7fa1", variant_sku: "AURA-ET-XXL-Blue", size: "XXL", color: "Blue", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-c07ba3b3935248caaf8aff29", variant_sku: "AURA-OT22-S-Blue", size: "S", color: "Blue", qty_on_hand: 2, qty_reserved: 0 },
  { product_id: "prod-c07ba3b3935248caaf8aff29", variant_sku: "AURA-OT22-M-Blue", size: "M", color: "Blue", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-c07ba3b3935248caaf8aff29", variant_sku: "AURA-OT22-L-Blue", size: "L", color: "Blue", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-c07ba3b3935248caaf8aff29", variant_sku: "AURA-OT22-XL-Blue", size: "XL", color: "Blue", qty_on_hand: 1, qty_reserved: 0 },
  { product_id: "prod-c07ba3b3935248caaf8aff29", variant_sku: "AURA-OT22-XXL-Blue", size: "XXL", color: "Blue", qty_on_hand: 1, qty_reserved: 0 },
];

function seedCatalog() {
  // Ensure all categories exist; create missing, set/refresh image_url on all.
  const existing = queryRecords('Category', {});
  const bySlug = Object.fromEntries(existing.map((c) => [c.slug, c]));
  const toCreate = [];
  AURA_CATEGORIES.forEach((c, i) => {
    const slug = slugify(c.name);
    const id = idFromSlug('cat', slug);
    const found = bySlug[slug];
    if (found) {
      // Refresh image_url + ordering on the existing record (non-destructive).
      updateRecord('Category', found.id, {
        name: c.name,
        name_ar: c.name_ar || c.name,
        is_active: true,
        sort_order: i,
        display_order: i,
        ...(c.image_url ? { image_url: c.image_url } : {}),
      });
    } else {
      toCreate.push({
        id,
        slug,
        name: c.name,
        name_ar: c.name_ar || c.name,
        parent_id: null,
        is_active: true,
        sort_order: i,
        display_order: i,
        ...(c.image_url ? { image_url: c.image_url } : {}),
      });
    }
  });
  if (toCreate.length) bulkCreate('Category', toCreate);

  // Seed products + variants only once (skip if any product already exists).
  if (countRecords('Product') > 0) {
    console.log(`[seed] catalog: categories ensured, products already present — skipping product seed`);
    return;
  }
  bulkCreate('Product', AURA_PRODUCTS);
  bulkCreate('ProductVariant', AURA_VARIANTS);
  console.log(`[seed] catalog: ${AURA_CATEGORIES.length} categories, ${AURA_PRODUCTS.length} products, ${AURA_VARIANTS.length} variants`);
}

// Seed the homepage hero CMS section (image_url drives the hero background).
function seedCmsSections() {
  const existing = queryRecords('CmsSection', { query: { section_key: 'home_hero' } });
  const data = {
    section_key: 'home_hero',
    title: 'LEVEL UP YOUR AURA',
    title_ar: 'ارفع مستوى حضورك',
    body: 'Clean fits. Limited drops. Delivered across Lebanon.',
    body_ar: 'قصّات نظيفة. دروبات محدودة. توصيل لكل لبنان.',
    image_url: '/brand/aura-hero.jpg',
    link_url: '/shop?category=new-arrivals',
    is_active: true,
    sort_order: 0,
  };
  if (existing.length) {
    updateRecord('CmsSection', existing[0].id, data);
  } else {
    createRecord('CmsSection', data);
  }
}

// Seed the "Build Your Fit" feature + category grid (home_shop_the_look) and the
// promo/offer banner (home_offer_banner) with their current hardcoded values, so
// the storefront looks identical on deploy and the owner edits from the CMS.
// Only create when missing — never clobber owner edits on redeploy.
function seedHomeFeatureSections() {
  const sections = [
    {
      section_key: 'home_shop_the_look',
      overline: 'Shop the look', overline_ar: 'تسوّق الإطلالة',
      title: 'Build your fit', title_ar: 'كوّن إطلالتك',
      button_label: 'Shop sets', button_label_ar: 'تسوّق الأطقم',
      image_url: '/brand/aura-shopthelook.jpg',
      link_url: '/shop?category=matching-sets',
      tiles_json: JSON.stringify([
        { title: 'Everyday Essentials', title_ar: 'الأساسيات اليومية', link: '/shop?category=t-shirts', image_url: '' },
        { title: 'Weekend Fit', title_ar: 'إطلالة الويكند', link: '/shop?category=polos', image_url: '' },
        { title: 'Clean Basics', title_ar: 'أساسيات نظيفة', link: '/shop?category=jeans', image_url: '' },
        { title: 'New Drops', title_ar: 'وصل حديثاً', link: '/shop?category=new-arrivals', image_url: '' },
      ]),
      is_active: true,
      sort_order: 40,
    },
    {
      section_key: 'home_offer_banner',
      overline: 'Limited drop', overline_ar: 'دروب محدود',
      title: 'Up to 40% off', title_ar: 'خصم حتى 40%',
      body: 'Selected fits, while they last. Limited quantities.',
      body_ar: 'قطع مختارة، طالما توفّرت. كميات محدودة.',
      button_label: 'Shop offers', button_label_ar: 'تسوّق العروض',
      image_url: '/brand/aura-offer.jpg',
      link_url: '/shop?category=offers',
      is_active: true,
      sort_order: 50,
    },
  ];
  for (const data of sections) {
    const existing = queryRecords('CmsSection', { query: { section_key: data.section_key }, limit: 1 });
    if (!existing.length) createRecord('CmsSection', data);
  }
}

export function runSeed() {
  if (kvGet('seed_version') === SEED_VERSION) {
    // Still ensure admin/settings idempotently in case of partial state.
    seedAdmin();
    seedSuperAdmins();
    seedMembershipSettings();
    seedSiteSettings();
    seedShippingZones();
    seedCmsSections();
    seedHomeFeatureSections();
    seedStoreContent();
    return;
  }
  seedAdmin();
  seedSuperAdmins();
  seedMembershipSettings();
  seedSiteSettings();
  seedShippingZones();
  seedCatalog();
  seedCmsSections();
  seedHomeFeatureSections();
  seedStoreContent();
  kvSet('seed_version', SEED_VERSION);
  console.log('[seed] complete');
}

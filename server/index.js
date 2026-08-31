import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import {
  initSchema, createRecord, getRecord, updateRecord, deleteRecord,
  queryRecords, ENTITIES,
} from './db.js';
import {
  registerUser, authenticate, signToken, setSessionCookie, clearSessionCookie,
  getUserFromRequest, publicUser, findUserByEmail, setPassword, changePassword, updateUser,
  issueOtp, verifyOtp as verifyOtpCode, signResetToken, verifyResetToken,
} from './auth.js';
import { invokeFunction } from './functions.js';
import {
  isCustomerBlocked, shapeEntityReadsForRole, stripWriteMoneyForRole,
  authorizeEntityRead, canReadRecordById,
} from './adminTools.js';
import { sendEmail } from './email.js';
import { runSeed } from './seed.js';
import { repairDuplicateSlugs } from './repairSlugs.js';
import { rewriteImageHostUrls } from './rewriteImageHost.js';
import { optimizeAndStore, bufferFromBase64 } from './imageOptimize.js';
import {
  buildFeedRow, buildFeedCsv, absoluteUrl, publicBaseUrl,
  isTrackEvent, buildTrackCustomData, mergeClientHashedUserData, sendTrackCapi,
} from './meta.js';
import { buildTiktokFeedRow, buildTiktokFeedCsv, isTikTokConfigured } from './tiktok.js';
import {
  getProductBySlug, injectProductMeta, buildPreloadedProductPayload, injectPreloadedProduct,
} from './productMeta.js';

// Build the verification-code email HTML.
function otpEmailHtml(code) {
  return `<!doctype html><html><body style="margin:0;background:#f4f1ea;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;">
    <div style="max-width:480px;margin:0 auto;padding:32px 24px;">
      <p style="font-size:18px;font-weight:700;letter-spacing:4px;color:#111111;margin:0 0 20px;">AURA WEAR</p>
      <h1 style="font-size:20px;font-weight:600;color:#111111;margin:0 0 8px;">Verify your email</h1>
      <p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 24px;">Enter this code to confirm your email address. It expires in 10 minutes.</p>
      <div style="font-size:34px;font-weight:700;letter-spacing:8px;color:#111111;background:#fff;border:1px solid #ece7df;border-radius:4px;padding:18px;text-align:center;">${code}</div>
      <p style="color:#999;font-size:12px;margin:24px 0 0;">If you didn't create an AURA WEAR account, you can safely ignore this email.</p>
    </div></body></html>`;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const UPLOAD_DIR = path.join(ROOT, 'uploads');
const PORT = process.env.PORT || 4000;

// Build the password-reset email HTML. The link carries a short-lived,
// single-purpose signed token (see auth.js signResetToken).
function resetEmailHtml(resetUrl) {
  return `<!doctype html><html><body style="margin:0;background:#f4f1ea;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;">
    <div style="max-width:480px;margin:0 auto;padding:32px 24px;">
      <p style="font-size:18px;font-weight:700;letter-spacing:4px;color:#111111;margin:0 0 20px;">AURA WEAR</p>
      <h1 style="font-size:20px;font-weight:600;color:#111111;margin:0 0 8px;">Reset your password</h1>
      <p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 24px;">Tap the button below to choose a new password. The link expires in 1 hour.</p>
      <p style="text-align:center;margin:0 0 24px;"><a href="${resetUrl}" style="display:inline-block;background:#111111;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 28px;border-radius:4px;">Reset password</a></p>
      <p style="color:#999;font-size:12px;margin:24px 0 0;">If you didn't request a password reset, you can safely ignore this email.</p>
    </div></body></html>`;
}

initSchema();
runSeed();
// Repair any pre-existing duplicate product slugs so each product page resolves
// to the correct item. Idempotent — a no-op once slugs are unique.
repairDuplicateSlugs();

// Rewrite any image URLs stored with the legacy r2.dev public host to the
// configured custom domain (R2_PUBLIC_BASE_URL). Idempotent prefix swap across
// all entity tables; silent no-op when the env var is unset (local dev).
rewriteImageHostUrls();

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Log once at boot whether the server-side TikTok Events API is active. When
// unconfigured every TikTok send silently no-ops (never throws, never hits the
// network) — this line makes that state visible without exposing the secret.
// Mirrors the Meta CAPI pattern.
if (!isTikTokConfigured()) {
  console.warn('[tiktokEvents] TikTok Events API disabled: missing AURA_TIKTOK_PIXEL_ID and/or AURA_TIKTOK_ACCESS_TOKEN');
}

const app = express();
app.disable('x-powered-by');
// Behind Railway's edge proxy: trust the first proxy hop so req.ip is the real
// client IP (rate limiting + Meta/TikTok client_ip_address depend on it).
app.set('trust proxy', 1);

// ─── Rate limiting (in-memory, per process) ─────────────────────────────────
// Fixed-window buckets keyed on route bucket + client IP. Protects credential
// endpoints (login/OTP/reset brute force) and the public tracking endpoints
// (CAPI spam would otherwise burn the Meta/TikTok event quotas).
const rateBuckets = new Map();
function rateLimit(bucket, { windowMs, max }) {
  return (req, res, next) => {
    const now = Date.now();
    const key = `${bucket}|${req.ip}`;
    let entry = rateBuckets.get(key);
    if (!entry || now > entry.reset) {
      entry = { count: 0, reset: now + windowMs };
      rateBuckets.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > max) {
      res.set('Retry-After', String(Math.max(1, Math.ceil((entry.reset - now) / 1000))));
      return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }
    next();
  };
}
// Periodic sweep so the map doesn't grow unbounded.
const rateSweep = setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateBuckets) if (now > v.reset) rateBuckets.delete(k);
}, 60 * 1000);
rateSweep.unref?.();

const authRateLimit = rateLimit('auth', { windowMs: 10 * 60 * 1000, max: 30 });
const trackRateLimit = rateLimit('track', { windowMs: 60 * 1000, max: 120 });

// Baseline security headers. NOTE: a Content-Security-Policy is intentionally
// NOT set yet — the Meta pixel and Google Fonts make a correct CSP risky;
// TODO: introduce one in report-only mode first (Content-Security-Policy-Report-Only)
// and tighten from observed violations.
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'SAMEORIGIN');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use(cookieParser());

// ─── helpers ────────────────────────────────────────────────────────────────
function asInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Parse list()/filter() args from query string.
//   list: ?sort=-created_date&limit=50
//   filter: ?q=<json>&sort=...&limit=...
function parseListParams(req) {
  let query = {};
  if (req.query.q) {
    try { query = JSON.parse(req.query.q); } catch { query = {}; }
  }
  const sort = req.query.sort || null;
  const limit = req.query.limit != null ? asInt(req.query.limit) : null;
  return { query, sort, limit };
}

function handleError(res, e) {
  const status = e?.status || 500;
  res.status(status).json({ error: e?.message || 'Internal error' });
}

// ─── Health route (public, no auth, no DB) ──────────────────────────────────
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

// ─── Auth routes ──────────────────────────────────────────────────────────────
app.get('/api/auth/me', (req, res) => {
  const user = getUserFromRequest(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  res.json(publicUser(user));
});

app.post('/api/auth/login', authRateLimit, (req, res) => {
  try {
    const { email, password } = req.body || {};
    const user = authenticate(email, password);
    const token = signToken(user.id);
    setSessionCookie(res, token);
    res.json({ access_token: token, user: publicUser(user) });
  } catch (e) { handleError(res, e); }
});

app.post('/api/auth/register', authRateLimit, (req, res) => {
  try {
    const { email, password, full_name, phone } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });
    const user = registerUser({ email, password, full_name, phone, role: 'customer' });
    // Issue a real verification code and email it. Email send is best-effort
    // (never blocks signup), but the code is required to obtain a session.
    const code = issueOtp(user.id);
    if (process.env.MINIYO_OTP_DEBUG === '1') console.log(`[otp:register] ${user.email} -> ${code}`);
    sendEmail({
      to: user.email,
      subject: 'Your AURA WEAR verification code',
      html: otpEmailHtml(code),
      email_type: 'otp_verification',
      customer_id: user.id,
      trigger_event: 'register',
    }).catch(() => {});
    res.json({ ok: true, email: user.email, requires_otp: true });
  } catch (e) { handleError(res, e); }
});

// Verify the emailed OTP code. Only issues a session on a correct, unexpired code.
app.post('/api/auth/verify-otp', authRateLimit, (req, res) => {
  try {
    const { email, otpCode } = req.body || {};
    const user = findUserByEmail(email);
    if (!user) return res.status(404).json({ error: 'Account not found' });
    const result = verifyOtpCode(user.id, otpCode);
    if (!result.ok) return res.status(result.status || 400).json({ error: result.error });
    const fresh = getRecord('User', user.id);
    const token = signToken(user.id);
    setSessionCookie(res, token);
    res.json({ access_token: token, user: publicUser(fresh) });
  } catch (e) { handleError(res, e); }
});

// Regenerate and re-email a verification code.
app.post('/api/auth/resend-otp', authRateLimit, (req, res) => {
  try {
    const { email } = req.body || {};
    const user = findUserByEmail(email);
    // Do not reveal whether the account exists.
    if (user && !user.email_verified) {
      const code = issueOtp(user.id);
      if (process.env.MINIYO_OTP_DEBUG === '1') console.log(`[otp:resend] ${user.email} -> ${code}`);
      sendEmail({
        to: user.email,
        subject: 'Your AURA WEAR verification code',
        html: otpEmailHtml(code),
        email_type: 'otp_verification',
        customer_id: user.id,
        trigger_event: 'resend_otp',
      }).catch(() => {});
    }
    res.json({ ok: true });
  } catch (e) { handleError(res, e); }
});

app.post('/api/auth/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.post('/api/auth/update-me', (req, res) => {
  try {
    const user = getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    const updated = updateUser(user.id, req.body || {});
    res.json(publicUser(updated));
  } catch (e) { handleError(res, e); }
});

app.post('/api/auth/change-password', (req, res) => {
  try {
    const user = getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'currentPassword and newPassword are required' });
    }
    changePassword(user.id, currentPassword, newPassword);
    res.json({ ok: true });
  } catch (e) { handleError(res, e); }
});

app.post('/api/auth/reset-password-request', authRateLimit, (req, res) => {
  // Always succeed — never reveal whether the account exists. CRITICAL: the
  // reset token is a bearer credential and must ONLY travel over email. (The
  // previous implementation returned it in the JSON response, which let anyone
  // take over any account — including super_admin — knowing just its email.)
  try {
    const { email } = req.body || {};
    const user = email ? findUserByEmail(email) : null;
    if (user) {
      const token = signResetToken(user.id);
      const resetUrl = `${publicBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`;
      sendEmail({
        to: user.email,
        subject: 'Reset your AURA WEAR password',
        html: resetEmailHtml(resetUrl),
        email_type: 'password_reset',
        customer_id: user.id,
        trigger_event: 'reset_password',
      }).catch(() => {});
    }
    res.json({ ok: true });
  } catch (e) { handleError(res, e); }
});

app.post('/api/auth/reset-password', authRateLimit, (req, res) => {
  try {
    const { resetToken, newPassword } = req.body || {};
    // Verify the SIGNATURE and the single-purpose claim (the old code merely
    // base64-decoded the payload, so a forged token could reset any account).
    const payload = resetToken ? verifyResetToken(resetToken) : null;
    if (!payload?.sub) return res.status(400).json({ error: 'Invalid or expired reset token' });
    if (!newPassword || String(newPassword).length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }
    setPassword(payload.sub, newPassword);
    res.json({ ok: true });
  } catch (e) { handleError(res, e); }
});

// ─── User invite (admin) ────────────────────────────────────────────────────
app.post('/api/users/invite', (req, res) => {
  try {
    const actor = getUserFromRequest(req);
    if (!actor || !['admin', 'super_admin'].includes(actor.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const { email, role = 'staff' } = req.body || {};
    if (!email) return res.status(400).json({ error: 'email required' });
    const VALID_INVITE_ROLES = ['staff', 'admin', 'super_admin'];
    if (!VALID_INVITE_ROLES.includes(role)) {
      return res.status(400).json({ error: `Invalid role: ${role}` });
    }
    // Only a super_admin may grant admin/super_admin. Admins can invite staff only.
    if (role !== 'staff' && actor.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only a super admin can grant admin or super admin roles.' });
    }
    let user = findUserByEmail(email);
    if (!user) {
      const tempPassword = crypto.randomUUID();
      user = registerUser({ email, password: tempPassword, role });
    } else {
      user = updateRecord('User', user.id, { role });
    }
    res.json({ ok: true, user: publicUser(user) });
  } catch (e) { handleError(res, e); }
});

// ─── Functions ────────────────────────────────────────────────────────────────
app.post('/api/functions/:name', async (req, res) => {
  try {
    const user = getUserFromRequest(req);
    const body = { ...(req.body || {}) };
    // The server-side Meta Purchase needs the browser's request signals
    // (ip/ua/fbp/fbc) for Event Match Quality — attach them server-side so
    // they are never trusted from the client body.
    if (req.params.name === 'metaTrackPurchase') {
      const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
      body._signals = {
        fbp: req.cookies?._fbp,
        fbc: req.cookies?._fbc,
        clientIp: req.headers['cf-connecting-ip'] || xff || req.socket?.remoteAddress,
        userAgent: req.headers['user-agent'],
      };
    }
    const result = await invokeFunction(req.params.name, body, user);
    if (result && typeof result === 'object' && result._status) {
      const { _status, ...rest } = result;
      return res.status(_status).json({ data: rest });
    }
    res.json({ data: result });
  } catch (e) { handleError(res, e); }
});

// ─── File upload (base64 JSON or raw) ──────────────────────────────────────────
// Admin uploads flow through the image pipeline: sharp compresses + resizes to
// WebP derivatives and writes them to R2 (or local disk in dev). Returns the
// canonical card URL as `file_url` (back-compat) plus the full descriptor
// (`url`, `variants`, `base`, `optimized`) so callers can store the variants map.
app.post('/api/upload', async (req, res) => {
  try {
    const user = getUserFromRequest(req);
    if (!user || !['admin', 'super_admin', 'staff'].includes(user.role)) {
      return res.status(user ? 403 : 401).json({ error: user ? 'Forbidden' : 'Not authenticated' });
    }
    const { filename, content_base64 } = req.body || {};
    if (!content_base64) return res.status(400).json({ error: 'content_base64 required' });
    const buffer = bufferFromBase64(content_base64);
    const descriptor = await optimizeAndStore(buffer, filename || 'upload');
    res.json({ file_url: descriptor.url, ...descriptor });
  } catch (e) { handleError(res, e); }
});

// ─── Entity CRUD ────────────────────────────────────────────────────────────
function ensureEntity(req, res, next) {
  if (!ENTITIES.includes(req.params.entity)) {
    return res.status(404).json({ error: `Unknown entity: ${req.params.entity}` });
  }
  next();
}

// Write authorization for the generic entity CRUD surface.
//
// Reads stay public (the storefront is a public catalog). Writes are admin-only
// by default; without this gate ANY anonymous client could create/modify/delete
// products, prices, discounts, orders, etc. directly against the API.
//
// The storefront legitimately performs a small set of writes as an
// unauthenticated guest (checkout, account self-service). Those — and only
// those — are allowed per (entity, operation) below. Everything else requires
// an admin/super_admin session.
const isAdmin = (user) => !!user && (user.role === 'admin' || user.role === 'super_admin');

// Entity → operations that a non-admin (guest/customer) may perform.
// Guest writes are limited to what checkout genuinely needs; everything
// self-scoped (wishlist, addresses, profile) requires authentication and is
// enforced per-record in authorizeWrite below.
const PUBLIC_WRITES = {
  Order: ['create'],
  OrderItem: ['create'],
  OrderStatusHistory: ['create'],
  Customer: ['create'],
  Review: ['create'],
  PromoCode: ['update'], // guests may ONLY increment times_used by 1 (see below)
};

// Fields a non-admin may never write on a Customer record (CRM/loyalty state).
// Spend + tier accrual moved server-side to membershipEngine 'accrue_spend'.
const CUSTOMER_WRITE_BLOCKLIST = new Set([
  'is_blocked', 'tags', 'notes', 'current_tier', 'lifetime_spend_usd',
  'total_orders', 'total_spent_usd', 'free_delivery_credits_remaining',
  'silver_granted', 'gold_granted', 'user_id', 'role',
]);

// Ids of Customer records owned by this account (matched by account email).
function customerIdsForUser(user) {
  if (!user?.email) return new Set();
  const email = String(user.email).toLowerCase();
  return new Set(
    queryRecords('Customer', { limit: 5000 })
      .filter((c) => (c.email || '').toLowerCase() === email)
      .map((c) => c.id),
  );
}

function authorizeWrite(op) {
  return (req, res, next) => {
    const user = getUserFromRequest(req);
    if (isAdmin(user)) return next();
    const entity = req.params.entity;

    // Self-scoped writes for authenticated customers.
    if (user) {
      const ownCustomers = customerIdsForUser(user);
      if (entity === 'WishlistItem') {
        if (op === 'create' && req.body?.user_id === user.id) return next();
        if (op === 'update' || op === 'delete') {
          const rec = getRecord('WishlistItem', req.params.id);
          if (rec && rec.user_id === user.id) return next();
        }
        return res.status(403).json({ error: 'Forbidden' });
      }
      if (entity === 'CustomerAddress') {
        const ownsCustomer = (cid) => ownCustomers.has(cid);
        if (op === 'create' && ownsCustomer(req.body?.customer_id)) return next();
        if (op === 'update' || op === 'delete') {
          const rec = getRecord('CustomerAddress', req.params.id);
          if (rec && ownsCustomer(rec.customer_id)) return next();
        }
        return res.status(403).json({ error: 'Forbidden' });
      }
      if (entity === 'Customer' && op === 'update') {
        // Own record only, and never the CRM/loyalty blocklist fields.
        if (ownCustomers.has(req.params.id)
            && !Object.keys(req.body || {}).some((k) => CUSTOMER_WRITE_BLOCKLIST.has(k))) {
          return next();
        }
        return res.status(403).json({ error: 'Forbidden' });
      }
      if (entity === 'AuditLog' && op === 'create') return next();
    }

    if (PUBLIC_WRITES[entity]?.includes(op)) {
      // Guest PromoCode update: allow ONLY a times_used increment of exactly 1
      // (checkout's promo redemption counter). Previously a guest could rewrite
      // ANY promo field — e.g. set a 100% discount or activate dead codes.
      if (entity === 'PromoCode' && op === 'update' && !user) {
        const rec = getRecord('PromoCode', req.params.id);
        const keys = Object.keys(req.body || {});
        const nextVal = Number(req.body?.times_used);
        if (!rec || keys.length !== 1 || keys[0] !== 'times_used'
            || nextVal !== (Number(rec.times_used) || 0) + 1) {
          return res.status(403).json({ error: 'Forbidden' });
        }
      }
      return next();
    }
    return res.status(user ? 403 : 401).json({
      error: user ? 'Forbidden: admin access required' : 'Authentication required',
    });
  };
}

// Never expose User credential-bearing fields through generic CRUD.
function sanitize(entity, record) {
  if (entity === 'User' && record) {
    const { password_hash, otp_hash, otp_expires_at, otp_attempts, ...rest } = record;
    return rest;
  }
  return record;
}

// ── Catalog cache headers ────────────────────────────────────────────────────
// Sets public cache headers on GET requests for read-only catalog entities.
// Cloudflare / CDN will cache these at the edge (max-age=60s, SWR=300s).
// Admin reads bypass the cache entirely (no-store) so panel edits show up
// immediately; public cached responses Vary on Cookie/Authorization so the
// anonymous snapshot is never served to a signed-in session.
const CATALOG_CACHE_ENTITIES = new Set([
  'CmsSection', 'SiteSetting', 'Category', 'Product', 'ProductImage',
  'ProductVariant', 'Collection', 'Review', 'Discount', 'Campaign',
]);
app.use('/api/entities/:entity', (req, res, next) => {
  if (req.method === 'GET') {
    const user = getUserFromRequest(req);
    const isAdminRead = !!user && ['admin', 'super_admin', 'staff'].includes(user.role);
    // Admin reads ALWAYS bypass caches so admin saves are visible immediately
    // after write. This used to cover only SiteSetting/ShippingZone — every
    // other admin-mutable entity (Category, Product, Discount, …) could serve
    // a stale public snapshot for minutes after a save, which presented as
    // "my new category didn't persist".
    if (isAdminRead) {
      res.set('Cache-Control', 'no-store');
      res.set('Vary', 'Cookie');
      return next();
    }
    // Keep fast public cache behavior for unauthenticated storefront catalog reads.
    // Vary on Cookie + Authorization so shared caches (Cloudflare) and browsers
    // never serve the anonymous snapshot to a signed-in session, or vice versa.
    if (!user && CATALOG_CACHE_ENTITIES.has(req.params.entity)) {
      res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
      res.set('Vary', 'Cookie, Authorization');
    }
  }
  next();
});

app.get('/api/entities/:entity', ensureEntity, (req, res) => {
  try {
    const user = getUserFromRequest(req);
    const { query, sort, limit } = parseListParams(req);
    // Gate private/admin entities so anonymous clients cannot list customer PII
    // or others' orders. Public catalog entities pass through.
    const auth = authorizeEntityRead(req.params.entity, user, query, false);
    if (!auth.allow) {
      return res.status(auth.status).json({
        error: auth.status === 401 ? 'Authentication required' : 'Forbidden',
      });
    }
    const records = queryRecords(req.params.entity, { query, sort, limit })
      .map((r) => sanitize(req.params.entity, r));
    // Strip monetary fields for non-super-admins (own/self-service orders kept).
    res.json(shapeEntityReadsForRole(req.params.entity, records, user, query));
  } catch (e) { handleError(res, e); }
});

app.get('/api/entities/:entity/:id', ensureEntity, (req, res) => {
  try {
    const user = getUserFromRequest(req);
    const auth = authorizeEntityRead(req.params.entity, user, {}, true);
    if (!auth.allow) {
      return res.status(auth.status).json({
        error: auth.status === 401 ? 'Authentication required' : 'Forbidden',
      });
    }
    const record = getRecord(req.params.entity, req.params.id);
    if (!record) return res.status(404).json({ error: 'Not found' });
    // Non-admin readers may only fetch their own private record by id.
    if (!canReadRecordById(req.params.entity, record, user)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    res.json(shapeEntityReadsForRole(req.params.entity, sanitize(req.params.entity, record), user));
  } catch (e) { handleError(res, e); }
});

// Role is privileged: it can only be set via the super-admin-guarded
// setUserRole function / invite endpoint, never through generic User writes.
function stripPrivilegedUserFields(entity, body) {
  if (entity === 'User' && body && 'role' in body) {
    const { role, ...rest } = body;
    return rest;
  }
  return body || {};
}

app.post('/api/entities/:entity', ensureEntity, authorizeWrite('create'), (req, res) => {
  try {
    // Blocked customers cannot place orders (matched by customer_id or email).
    if (req.params.entity === 'Order' && !isAdmin(getUserFromRequest(req)) && isCustomerBlocked(req.body)) {
      return res.status(403).json({ error: 'This account is not able to place orders. Please contact support.' });
    }
    let body = stripPrivilegedUserFields(req.params.entity, req.body);
    body = stripWriteMoneyForRole(req.params.entity, body, getUserFromRequest(req));
    const record = createRecord(req.params.entity, body);
    res.json(sanitize(req.params.entity, record));
  } catch (e) { handleError(res, e); }
});

app.put('/api/entities/:entity/:id', ensureEntity, authorizeWrite('update'), (req, res) => {
  try {
    const actor = getUserFromRequest(req);
    let body = stripPrivilegedUserFields(req.params.entity, req.body);
    body = stripWriteMoneyForRole(req.params.entity, body, actor);
    const record = updateRecord(req.params.entity, req.params.id, body);
    res.json(shapeEntityReadsForRole(req.params.entity, sanitize(req.params.entity, record), actor));
  } catch (e) { handleError(res, e); }
});

app.delete('/api/entities/:entity/:id', ensureEntity, authorizeWrite('delete'), (req, res) => {
  try {
    res.json(deleteRecord(req.params.entity, req.params.id));
  } catch (e) { handleError(res, e); }
});

// ─── Guest order tracking (phone-verified) ──────────────────────────────────
// Replaces the old flow where the browser filtered the public Order entity by
// order_number and compared the phone client-side — which exposed the full
// order (customer PII) to anyone who guessed an order number. Now the server
// verifies order number + phone and returns only what the tracking UI needs.
app.post('/api/orders/track', trackRateLimit, (req, res) => {
  try {
    const orderNumber = String(req.body?.order_number || '').trim().toUpperCase();
    const phoneRaw = String(req.body?.phone || '');
    if (!orderNumber || !phoneRaw) {
      return res.status(400).json({ error: 'order_number and phone required' });
    }
    const order = queryRecords('Order', { query: { order_number: orderNumber }, limit: 1 })[0];
    const digits = (v) => String(v || '').replace(/\D/g, '');
    const orderPhone = digits(order?.customer_phone);
    const givenPhone = digits(phoneRaw);
    // Match on the trailing 8 digits (local LB subscriber number) so country
    // code / leading-zero formatting differences don't lock out real customers.
    const matches = order && orderPhone && givenPhone
      && orderPhone.slice(-8) === givenPhone.slice(-8);
    if (!matches) return res.status(404).json({ error: 'Order not found' });

    const items = queryRecords('OrderItem', { query: { order_id: order.id }, limit: 200 })
      .map((i) => ({
        id: i.id,
        product_name: i.product_name,
        quantity: i.quantity,
        line_total_usd: i.line_total_usd,
      }));
    res.json({
      order: {
        id: order.id,
        order_number: order.order_number,
        order_status: order.order_status,
        order_date: order.order_date,
        customer_name: order.customer_name,
        grand_total_usd: order.grand_total_usd,
      },
      items,
    });
  } catch (e) { handleError(res, e); }
});

// ─── Meta Conversions API: client-originated events ─────────────────────────
// Server-side twin for the browser Pixel's PageView / ViewContent / AddToCart /
// InitiateCheckout. The storefront posts the SAME event_id it passed to fbq so
// Meta dedups the pair. Only NON-PII custom_data is accepted from the client,
// plus PRE-HASHED (SHA-256) identity fields for EMQ; ip/ua/fbp/fbc are always
// derived server-side. Purchase is NOT accepted here — it fires only from the
// trusted order flow (metaTrackPurchase). Fire-and-forget: the response never
// waits on Meta and tracking can never break a page load.
app.post('/api/meta/track', trackRateLimit, (req, res) => {
  try {
    const body = req.body || {};
    const eventName = body.event_name;
    if (!isTrackEvent(eventName)) {
      return res.status(400).json({ error: 'unsupported_event' });
    }
    const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const signals = {
      fbp: req.cookies?._fbp,
      fbc: req.cookies?._fbc,
      clientIp: req.headers['cf-connecting-ip'] || xff || req.socket?.remoteAddress,
      userAgent: req.headers['user-agent'],
    };
    const customData = buildTrackCustomData(body);
    const userData = mergeClientHashedUserData(signals, body.user_data);

    sendTrackCapi({
      eventName,
      eventId: body.event_id ? String(body.event_id) : undefined,
      eventTime: Math.floor(Date.now() / 1000),
      eventSourceUrl: typeof body.event_source_url === 'string' ? body.event_source_url : undefined,
      userData,
      customData,
    }).catch((e) => console.error('[metaCapi] track send error:', e?.message));

    res.json({ ok: true });
  } catch (e) {
    console.error('[metaCapi] track route error:', e?.message);
    res.json({ ok: false });
  }
});

// ─── Meta catalog feed ────────────────────────────────────────────────────────
// Public CSV data feed for Meta Commerce Manager. id = normalized product SKU so
// it matches the pixel/CAPI content_ids. Needs no env vars or secrets.
app.get('/meta-feed.csv', (req, res) => {
  try {
    const base = publicBaseUrl();
    const products = queryRecords('Product', { query: { status: 'Active' }, sort: 'name' });
    const rows = products.map((product) => {
      // First image by sort order (falls back to a brand image in buildFeedRow).
      const images = queryRecords('ProductImage', {
        query: { product_id: product.id }, sort: 'sort_order', limit: 1,
      });
      const rawImg = images[0]?.image_url || images[0]?.url || images[0]?.file_url || '';
      const imageUrl = absoluteUrl(rawImg, base);

      // In stock if the (sum of variant) quantity is positive.
      let inStock;
      if (product.has_variants) {
        const variants = queryRecords('ProductVariant', { query: { product_id: product.id } });
        inStock = variants.reduce((s, v) => s + Number(v.qty_on_hand || 0), 0) > 0;
      } else {
        inStock = Number(product.stock_quantity || 0) > 0;
      }
      return buildFeedRow(product, { base, imageUrl, inStock });
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=1800');
    res.send(buildFeedCsv(rows));
  } catch (e) { handleError(res, e); }
});

// ─── TikTok catalog feed ──────────────────────────────────────────────────────
// TikTok Catalog CSV product feed. Mirrors the Meta feed (same product query,
// image resolution, price/availability logic, and normalized sku as the catalog
// id — sku_id == Meta feed id == pixel content_id) but uses TikTok's column
// names and populates google_product_category/product_type from the category.
// Needs no env vars or secrets.
app.get('/tiktok-feed.csv', (req, res) => {
  try {
    const base = publicBaseUrl();
    const categoriesById = new Map(
      queryRecords('Category', { limit: 100000 }).map((c) => [c.id, c]),
    );
    const products = queryRecords('Product', { query: { status: 'Active' }, sort: 'name' });
    const rows = products.map((product) => {
      // First image by sort order (falls back to a brand image in the row builder).
      const images = queryRecords('ProductImage', {
        query: { product_id: product.id }, sort: 'sort_order', limit: 1,
      });
      const rawImg = images[0]?.image_url || images[0]?.url || images[0]?.file_url || '';
      const imageUrl = absoluteUrl(rawImg, base);

      // In stock if the (sum of variant) quantity is positive.
      let inStock;
      if (product.has_variants) {
        const variants = queryRecords('ProductVariant', { query: { product_id: product.id } });
        inStock = variants.reduce((s, v) => s + Number(v.qty_on_hand || 0), 0) > 0;
      } else {
        inStock = Number(product.stock_quantity || 0) > 0;
      }

      const cat = product.category_id ? categoriesById.get(product.category_id) : null;
      const sub = product.subcategory_id ? categoriesById.get(product.subcategory_id) : null;
      return buildTiktokFeedRow(product, {
        base, imageUrl, inStock,
        category: cat?.name || '', subcategory: sub?.name || '',
      });
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=1800');
    res.send(buildTiktokFeedCsv(rows));
  } catch (e) { handleError(res, e); }
});

// ─── Sitemap ────────────────────────────────────────────────────────────────
// Dynamic XML sitemap for search crawlers (robots.txt points here). Registered
// before the SPA fallback. Uses publicBaseUrl() so absolute URLs stay consistent
// with the OG/meta-feed base URL (AURA_PUBLIC_BASE_URL env override).
function xmlEscape(v) {
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Public, indexable storefront pages (from src/App.jsx). Excludes cart,
// checkout, account, admin, and auth-utility pages (register/reset-password).
const SITEMAP_STATIC_PAGES = [
  { loc: '/', priority: '1.0' },
  { loc: '/shop', priority: '0.5' },
  { loc: '/gifts', priority: '0.5' },
  { loc: '/faq', priority: '0.5' },
  { loc: '/about', priority: '0.5' },
  { loc: '/track', priority: '0.5' },
  { loc: '/wishlist', priority: '0.5' },
  { loc: '/login', priority: '0.5' },
  { loc: '/legal/contact', priority: '0.5' },
  { loc: '/legal/shipping', priority: '0.5' },
  { loc: '/legal/returns', priority: '0.5' },
  { loc: '/legal/privacy', priority: '0.5' },
  { loc: '/legal/terms', priority: '0.5' },
];

function isoDate(v) {
  const t = Date.parse(v || '');
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
}

app.get('/sitemap.xml', (req, res) => {
  try {
    const base = publicBaseUrl();
    const products = queryRecords('Product', { query: { status: 'Active' }, limit: 100000 })
      .filter((p) => p && p.slug);
    const urls = [];
    for (const page of SITEMAP_STATIC_PAGES) {
      urls.push(
        `  <url><loc>${xmlEscape(base + page.loc)}</loc>`
        + `<changefreq>weekly</changefreq><priority>${page.priority}</priority></url>`,
      );
    }
    for (const p of products) {
      const lastmod = isoDate(p.updated_date);
      urls.push(
        `  <url><loc>${xmlEscape(`${base}/product/${p.slug}`)}</loc>`
        + (lastmod ? `<lastmod>${lastmod}</lastmod>` : '')
        + '<changefreq>weekly</changefreq><priority>0.8</priority></url>',
      );
    }
    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
      + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
      + urls.join('\n')
      + '\n</urlset>\n';
    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(xml);
  } catch (e) {
    console.error('[sitemap] generation failed:', e?.message);
    res.status(500).type('text/plain').send('sitemap generation error');
  }
});

// Uploaded files use content-random (uuid) filenames, so they can be cached
// hard at the edge/browser.
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '30d', immutable: true }));

// ─── Serve SPA with history fallback ──────────────────────────────────────────
if (fs.existsSync(DIST)) {
  // Serve the PWA manifest and robots.txt with their correct content types,
  // ahead of both express.static and the SPA history fallback. Without these,
  // Serve the PWA manifest, robots.txt and llms.txt with their correct content
  // types, ahead of both express.static and the SPA history fallback. Without
  // these, they fall through to the catch-all and return the index.html shell
  // as text/html — an invalid manifest that some in-app WebViews (e.g.
  // Facebook) choke on.
  app.get('/manifest.json', (req, res) => {
    res.type('application/manifest+json');
    res.sendFile(path.join(DIST, 'manifest.json'));
  });
  app.get('/robots.txt', (req, res) => {
    res.type('text/plain');
    res.sendFile(path.join(DIST, 'robots.txt'));
  });
  app.get('/llms.txt', (req, res) => {
    res.type('text/plain');
    res.sendFile(path.join(DIST, 'llms.txt'));
  });

  // Cache policy (Lighthouse "use efficient cache lifetimes"):
  //  • /assets/* — Vite content-hashed bundles: cache for a year, immutable.
  //  • index.html — never cached, so deploys take effect immediately.
  //  • everything else (icons, brand images, manifest) — 1 day.
  const setStaticCacheHeaders = (res, filePath) => {
    const p = filePath.replace(/\\/g, '/');
    if (p.includes('/assets/')) {
      res.set('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (p.endsWith('/index.html')) {
      res.set('Cache-Control', 'no-cache');
    } else {
      res.set('Cache-Control', 'public, max-age=86400');
    }
  };

  app.use(express.static(DIST, { setHeaders: setStaticCacheHeaders }));

  // Server-inject per-product structured data for product detail pages so
  // Meta's non-JS crawler / Pixel catalog scanner sees per-product OG product
  // tags + JSON-LD (id, price, availability). Registered before the SPA
  // fallback. Best-effort — any read/inject error degrades to serving the
  // untouched shell so the page always loads.
  const INDEX_HTML = path.join(DIST, 'index.html');
  app.get('/product/:slug', (req, res, next) => {
    try {
      const product = getProductBySlug(req.params.slug);
      const template = fs.readFileSync(INDEX_HTML, 'utf8');
      res.set('Cache-Control', 'no-cache');
      // Unknown slug: serve the SPA shell (the client renders its own NotFound
      // UI) but with a real HTTP 404 so crawlers stop indexing dead URLs.
      if (!product) return res.status(404).type('html').send(template);
      const withMeta = injectProductMeta(template, product);
      const withPreload = injectPreloadedProduct(withMeta, buildPreloadedProductPayload(product));
      res.type('html').send(withPreload);
    } catch (e) {
      console.error('[productMeta] inject failed:', e?.message);
      next();
    }
  });

  app.get(/^(?!\/api\/).*/, (req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.sendFile(INDEX_HTML);
  });
} else {
  app.get('/', (req, res) => {
    res.status(200).send('Backend running. Build the frontend with `npm run build` to serve the SPA.');
  });
}

// Bind to 0.0.0.0 so the platform router (Railway/Render/etc.) can reach the app.
// Binding to the default (localhost) causes the proxy to 502 even though the
// server logs that it is "listening".
app.listen(PORT, '0.0.0.0', () => {
  console.log(`AURA WEAR server listening on 0.0.0.0:${PORT}`);
});

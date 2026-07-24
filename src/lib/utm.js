import { safeStorage } from '@/lib/safeStorage';

const ATTRIBUTION_STORAGE_KEY = 'aura-attribution-utm-v1';
const UTM_FIELDS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];

function normalizeUtmValue(value) {
  return String(value ?? '').trim().toLowerCase();
}

function sanitizeUtmRecord(input) {
  const source = input && typeof input === 'object' ? input : {};
  const out = {};
  for (const key of UTM_FIELDS) {
    out[key] = normalizeUtmValue(source[key]);
  }
  return out;
}

function hasAnyUtmValues(utm) {
  return UTM_FIELDS.some((key) => !!utm[key]);
}

export function captureUtmFromSearch(search) {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(String(search || window.location.search || ''));
  const hasUtmInUrl = UTM_FIELDS.some((key) => params.has(key));
  if (!hasUtmInUrl) return null;

  const captured = {};
  for (const key of UTM_FIELDS) {
    captured[key] = normalizeUtmValue(params.get(key));
  }
  captured.captured_at = new Date().toISOString();

  safeStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(captured));
  return captured;
}

export function getStoredUtm() {
  const raw = safeStorage.getItem(ATTRIBUTION_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const sanitized = sanitizeUtmRecord(parsed);
    if (!hasAnyUtmValues(sanitized)) return null;
    return {
      ...sanitized,
      captured_at: typeof parsed?.captured_at === 'string' ? parsed.captured_at : null,
    };
  } catch {
    return null;
  }
}

export function getAttributionContext() {
  const utm = getStoredUtm();
  if (!utm) return {
    utm_source: '',
    utm_medium: '',
    utm_campaign: '',
    utm_content: '',
    utm_term: '',
    utm_captured_at: null,
  };
  return {
    utm_source: utm.utm_source,
    utm_medium: utm.utm_medium,
    utm_campaign: utm.utm_campaign,
    utm_content: utm.utm_content,
    utm_term: utm.utm_term,
    utm_captured_at: utm.captured_at || null,
  };
}

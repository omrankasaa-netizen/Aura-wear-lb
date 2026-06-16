// AURA brand constants. Where possible these mirror SiteSetting values so the
// admin panel stays the source of truth; these are fallbacks + static assets.

export const BRAND = {
  name: 'AURA',
  wordmark: 'AURA',
  wordmarkSub: 'APPAREL',
  tagline: 'LEVEL UP YOUR AURA',
  whatsappNumber: '+961 71 66 29 06',
  whatsappDigits: '96171662906',
  instagramUrl: 'https://www.instagram.com/aura.wear.leb/',
  instagramHandle: 'aura.wear.leb',
};

export const LOGO = {
  dark: '/brand/aura-logo.png',        // black lockup — for light backgrounds
  light: '/brand/aura-logo-white.png', // white lockup — for dark backgrounds
  mark: '/brand/aura-mark.png',
  markWhite: '/brand/aura-mark-white.png',
  icon: '/brand/aura-icon-512.png',
};

// Build a wa.me deep link with optional prefilled text.
export function whatsappLink(text, digits = BRAND.whatsappDigits) {
  const base = `https://wa.me/${String(digits).replace(/\D/g, '') || BRAND.whatsappDigits}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

// Storefront collections (mirror seeded categories).
export const COLLECTIONS = [
  { label: 'New Arrivals', slug: 'new-arrivals' },
  { label: 'Best Sellers', slug: 'best-sellers' },
  { label: 'T-Shirts', slug: 't-shirts' },
  { label: 'Polos', slug: 'polos' },
  { label: 'Jeans', slug: 'jeans' },
  { label: 'Matching Sets', slug: 'matching-sets' },
  { label: 'Offers', slug: 'offers' },
];

export const FIT_OPTIONS = ['Oversized', 'Relaxed', 'Regular', 'Slim'];
export const SIZE_OPTIONS = ['S', 'M', 'L', 'XL', 'XXL'];

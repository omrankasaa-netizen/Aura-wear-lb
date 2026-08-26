import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { COLLECTIONS } from '@/lib/brand';
import { useLang } from '@/contexts/LanguageContext';

/**
 * Live top-level categories for storefront navigation (header nav, mobile
 * drawer, footer). Previously these were the hardcoded COLLECTIONS list, so a
 * category created in the admin panel never appeared in the navigation —
 * most visibly in the mobile drawer, whose only category list was hardcoded.
 *
 * Shares the ['categories-active'] query key with FeaturedCategories — one
 * fetch, one cache entry, always in sync. Falls back to the static
 * COLLECTIONS list while loading / pre-catalog so the nav is never empty.
 * Labels are localized here so callers render `label` directly.
 */
export function useNavCategories() {
  const { lang } = useLang();
  const { data: categories = [] } = useQuery({
    queryKey: ['categories-active'],
    queryFn: () => base44.entities.Category.filter({ is_active: true }, 'sort_order', 100),
    staleTime: 60_000,
  });
  const topLevel = categories.filter((c) => !c.parent_id);
  if (!topLevel.length) return COLLECTIONS.map((c) => ({ slug: c.slug, label: c.label }));
  return topLevel.map((c) => ({
    slug: c.slug,
    label: lang === 'ar' ? (c.name_ar || c.name) : c.name,
  }));
}

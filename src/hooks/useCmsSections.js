import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

export function useCmsSections() {
  const { data: sections = [] } = useQuery({
    queryKey: ['cms-sections-home'],
    queryFn: () => base44.entities.CmsSection.filter({}, 'sort_order', 50),
    staleTime: 60_000,
  });

  const byKey = new Map();
  for (const section of sections) {
    const key = section?.section_key;
    if (!key || byKey.has(key)) continue;
    byKey.set(key, section);
  }

  return {
    sections,
    getSection: (key) => byKey.get(key) || null,
  };
}


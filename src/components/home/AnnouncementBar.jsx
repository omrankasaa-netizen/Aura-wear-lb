import React, { useEffect, useState } from 'react';
import { useLang } from '@/contexts/LanguageContext';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';

const FALLBACK = [
  'Delivery all over Lebanon 🇱🇧',
  'Cash on delivery available',
  'Questions? DM us on WhatsApp',
];

export default function AnnouncementBar() {
  const { t } = useLang();
  const [index, setIndex] = useState(0);

  const { data: settings = [] } = useQuery({
    queryKey: ['site-settings-public'],
    queryFn: () => base44.entities.SiteSetting.list('setting_key', 100),
    staleTime: 5 * 60_000,
  });

  let messages = FALLBACK;
  const raw = settings.find((s) => s.setting_key === 'announcement_messages')?.setting_value;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) messages = parsed;
    } catch {
      /* keep fallback */
    }
  }

  useEffect(() => {
    if (messages.length <= 1) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % messages.length), 4000);
    return () => clearInterval(id);
  }, [messages.length]);

  return (
    <div className="bg-charcoal text-white text-center text-[11px] sm:text-xs py-2 px-4 font-display uppercase tracking-[0.15em]">
      <span key={index} className="inline-block animate-in fade-in duration-500">
        {t(messages[index % messages.length], messages[index % messages.length])}
      </span>
    </div>
  );
}

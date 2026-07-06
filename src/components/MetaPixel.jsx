import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useLang } from '@/contexts/LanguageContext';
import {
  initMetaPixel, trackPageView, shouldAskConsent, grantConsent, denyConsent,
  isPixelConfigured,
} from '@/lib/meta';

// Boots the Meta Pixel (no-op if VITE_META_PIXEL_ID is unset), fires a PageView
// on every SPA route change once consent is granted, and renders a lightweight
// bilingual consent banner when a decision hasn't been made yet.
export default function MetaPixel() {
  const location = useLocation();
  const { t } = useLang();
  const [ask, setAsk] = useState(false);

  // Boot once on mount.
  useEffect(() => {
    initMetaPixel();
    setAsk(shouldAskConsent());
  }, []);

  // PageView on client-side navigation (initMetaPixel already fired the first one).
  const firstRender = React.useRef(true);
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    trackPageView();
  }, [location.pathname]);

  if (!isPixelConfigured() || !ask) return null;

  const accept = () => { grantConsent(); setAsk(false); };
  const decline = () => { denyConsent(); setAsk(false); };

  return (
    <div className="fixed bottom-0 inset-x-0 z-[60] bg-charcoal text-white border-t border-white/10 px-4 py-4 shadow-2xl">
      <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
        <p className="text-xs sm:text-sm leading-relaxed flex-1">
          {t(
            'We use cookies and similar tools to measure and improve your shopping experience. You can accept or decline analytics tracking.',
            'نستخدم ملفات تعريف الارتباط وأدوات مماثلة لقياس وتحسين تجربة تسوّقك. يمكنك قبول أو رفض تتبّع التحليلات.'
          )}
        </p>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={decline}
            className="h-9 px-4 rounded-sm border border-white/30 text-xs font-display uppercase tracking-wide hover:bg-white/10 transition-colors"
          >
            {t('Decline', 'رفض')}
          </button>
          <button
            onClick={accept}
            className="h-9 px-4 rounded-sm bg-white text-charcoal text-xs font-display uppercase tracking-wide hover:bg-white/90 transition-colors"
          >
            {t('Accept', 'قبول')}
          </button>
        </div>
      </div>
    </div>
  );
}

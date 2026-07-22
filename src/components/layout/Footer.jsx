import React, { useState } from 'react';
import { useLang } from '@/contexts/LanguageContext';
import { MessageCircle, Instagram, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import { LOGO, BRAND, COLLECTIONS, whatsappLink } from '@/lib/brand';

export default function Footer() {
  const { t } = useLang();
  const settings = useSiteSettings();
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  const whatsapp = settings.whatsappNumber || BRAND.whatsappNumber;
  const instagram = settings.instagramUrl || BRAND.instagramUrl;

  const col = (title, links) => (
    <div>
      <p className="eyebrow text-white/50 mb-4">{title}</p>
      <div className="flex flex-col gap-2.5">{links}</div>
    </div>
  );
  const fLink = (to, label, external) => external ? (
    <a key={label} href={to} target="_blank" rel="noopener" className="text-sm text-white/70 hover:text-white transition-colors">{label}</a>
  ) : (
    <Link key={label} to={to} className="text-sm text-white/70 hover:text-white transition-colors">{label}</Link>
  );

  return (
    <footer className="bg-charcoal text-white mt-auto">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-14">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-10 mb-12">
          {/* Brand */}
          <div className="col-span-2 lg:col-span-1 flex flex-col gap-4">
            <img src={LOGO.light} alt="AURA" className="h-9 w-auto self-start" />
            <p className="text-sm text-white/60 leading-relaxed max-w-xs">
              {t('Clean fits. Limited drops. Delivered across Lebanon.', 'قصّات نظيفة. دروبات محدودة. توصيل لكل لبنان.')}
            </p>
            <div className="flex gap-2.5 mt-1">
              <a href={whatsappLink(null, whatsapp)} target="_blank" rel="noopener"
                aria-label={t('Chat with us on WhatsApp', 'تواصل معنا عبر واتساب')}
                className="w-9 h-9 border border-white/20 rounded-sm flex items-center justify-center hover:bg-white hover:text-charcoal transition-colors">
                <MessageCircle className="w-4 h-4" />
              </a>
              <a href={instagram} target="_blank" rel="noopener"
                aria-label={t('AURA on Instagram', 'AURA على إنستغرام')}
                className="w-9 h-9 border border-white/20 rounded-sm flex items-center justify-center hover:bg-white hover:text-charcoal transition-colors">
                <Instagram className="w-4 h-4" />
              </a>
            </div>
          </div>

          {col(t('Shop', 'تسوّق'), COLLECTIONS.map((c) => fLink(`/shop?category=${c.slug}`, t(c.label, c.label))))}

          {col(t('Help', 'المساعدة'), [
            fLink('/faq', t('FAQ', 'الأسئلة الشائعة')),
            fLink('/legal/shipping', t('Delivery', 'التوصيل')),
            fLink('/legal/returns', t('Returns', 'الإرجاع')),
            fLink('/legal/contact', t('Payment', 'الدفع')),
            fLink('/track', t('Track Order', 'تتبع الطلب')),
          ])}

          {col('AURA', [
            fLink('/about', t('About', 'عن AURA')),
            fLink('/legal/contact', t('Contact', 'تواصل معنا')),
            fLink(whatsappLink(null, whatsapp), t('WhatsApp', 'واتساب'), true),
            fLink(instagram, `@${BRAND.instagramHandle}`, true),
          ])}

          {/* Newsletter */}
          <div className="col-span-2 lg:col-span-1">
            <p className="eyebrow text-white/50 mb-4">{t('Stay in the loop', 'ابقَ على اطلاع')}</p>
            <p className="text-sm text-white/60 mb-3">{t('New drops & offers, first.', 'الدروبات والعروض، أولاً.')}</p>
            <form onSubmit={(e) => { e.preventDefault(); if (email.trim()) setSubscribed(true); }} className="flex">
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                placeholder={t('Email address', 'البريد الإلكتروني')}
                className="flex-1 min-w-0 bg-white/5 border border-white/20 rounded-sm px-3 h-11 text-sm placeholder:text-white/40 focus:outline-none focus:border-white" />
              <button type="submit" className="w-11 h-11 bg-white text-charcoal flex items-center justify-center rounded-sm ml-2 hover:bg-white/90" aria-label={t('Subscribe', 'اشترك')}>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
            {subscribed && <p className="text-xs text-success mt-2">{t("You're on the list.", 'تمّ تسجيلك.')}</p>}
          </div>
        </div>

        <div className="border-t border-white/10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-white/40">© {new Date().getFullYear()} {BRAND.name}. {t('All rights reserved.', 'جميع الحقوق محفوظة.')}</p>
          <div className="flex items-center gap-4">
            <Link to="/legal/privacy" className="text-xs text-white/40 hover:text-white/70">{t('Privacy', 'الخصوصية')}</Link>
            <Link to="/legal/terms" className="text-xs text-white/40 hover:text-white/70">{t('Terms', 'الشروط')}</Link>
            <Link to="/admin/login" className="text-xs text-white/20 hover:text-white/50 transition-colors" title="Staff access">{t('Staff', 'الموظفون')}</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

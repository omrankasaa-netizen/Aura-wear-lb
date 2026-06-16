import React from 'react';
import { useLang } from '@/contexts/LanguageContext';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { BRAND } from '@/lib/brand';

export default function AboutPage() {
  const { lang, t } = useLang();

  const { data: sections = [] } = useQuery({
    queryKey: ['cms-section', 'page_about'],
    queryFn: () => base44.entities.CmsSection.filter({ section_key: 'page_about' }, 'sort_order', 1),
    staleTime: 60_000,
  });

  const section = sections[0];
  const content = section
    ? (lang === 'ar' ? (section.body_ar || section.body) : section.body)
    : null;

  return (
    <div className="min-h-screen bg-background" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      {/* Hero band */}
      <div className="bg-charcoal text-white py-20 px-4 text-center">
        <p className="eyebrow text-white/60 mb-4">{BRAND.tagline}</p>
        <h1 className="font-display font-bold uppercase text-3xl sm:text-5xl tracking-tight leading-none mb-4">
          {t('About AURA', 'عن AURA')}
        </h1>
        <p className="text-white/70 text-sm max-w-md mx-auto">
          {t('Premium menswear, made for Lebanon.', 'ملابس رجالية فاخرة، صُنعت للبنان.')}
        </p>
      </div>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-8">
          <ArrowLeft className={`w-4 h-4 ${lang === 'ar' ? 'rotate-180' : ''}`} />
          {t('Back to Home', 'العودة للرئيسية')}
        </Link>

        {content ? (
          <div className="prose prose-sm max-w-none text-foreground
            prose-headings:font-display prose-headings:uppercase prose-headings:tracking-tight prose-headings:text-foreground
            prose-p:text-muted-foreground prose-li:text-muted-foreground
            prose-strong:text-foreground prose-hr:border-border">
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        ) : (
          <div className="space-y-6 text-muted-foreground text-sm leading-relaxed">
            <p>
              {t(
                'AURA is a menswear label built in Lebanon, for the modern man who wants his everyday wardrobe to feel considered — without the markup.',
                'AURA علامة ملابس رجالية صُنعت في لبنان، للرجل العصري الذي يريد خزانة يومية مدروسة — دون مبالغة في السعر.'
              )}
            </p>
            <hr className="border-border" />
            <h2 className="font-display font-bold uppercase tracking-tight text-foreground">{t('What we make', 'ماذا نصنع')}</h2>
            <p>
              {t(
                'Clean essentials, elevated basics, and matching sets — tees, polos, jeans, and the pieces that build a fit. Honest fabrics, sharp fits, and prices that make sense.',
                'أساسيات نظيفة، قطع راقية، وأطقم متناسقة — تيشيرتات، بولو، جينز، والقطع التي تكوّن الإطلالة. أقمشة صادقة، قصّات حادة، وأسعار منطقية.'
              )}
            </p>
            <hr className="border-border" />
            <h2 className="font-display font-bold uppercase tracking-tight text-foreground">{t('Level up your aura', 'ارفع مستوى حضورك')}</h2>
            <p>
              {t(
                'We believe how you dress changes how you show up. AURA is here to make that effortless — delivered across Lebanon, with cash on delivery and real support on WhatsApp.',
                'نؤمن أن طريقة لبسك تغيّر حضورك. AURA هنا لتجعل ذلك سهلاً — توصيل لكل لبنان، دفع عند الاستلام، ودعم حقيقي على واتساب.'
              )}
            </p>
            <hr className="border-border" />
            <p className="text-xs text-muted-foreground">— {t('The AURA team', 'فريق AURA')}</p>
          </div>
        )}

        <div className="mt-12 flex flex-col sm:flex-row gap-3">
          <Link to="/shop" className="btn-primary flex-1 h-12 flex items-center justify-center">{t('Shop now', 'تسوّق الآن')}</Link>
          <Link to="/legal/contact" className="btn-outline flex-1 h-12 flex items-center justify-center">{t('Contact us', 'تواصل معنا')}</Link>
        </div>
      </div>
    </div>
  );
}

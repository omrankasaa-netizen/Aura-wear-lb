import React from 'react';
import { motion } from 'framer-motion';
import { useLang } from '@/contexts/LanguageContext';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import { MessageCircle } from 'lucide-react';
import { BRAND, whatsappLink } from '@/lib/brand';

export default function FloatingWhatsApp() {
  const { t } = useLang();
  const settings = useSiteSettings();
  const number = settings.whatsappNumber || BRAND.whatsappNumber;

  const waLink = whatsappLink(t('Hi AURA! I need help.', 'أهلاً AURA! بدي مساعدة.'), number);

  return (
    <motion.a
      href={waLink}
      target="_blank"
      rel="noopener"
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      className="fixed bottom-5 right-5 z-40 w-12 h-12 bg-charcoal text-white rounded-sm flex items-center justify-center shadow-xl hover:bg-primary transition-colors"
      aria-label="WhatsApp"
    >
      <MessageCircle className="w-5 h-5" strokeWidth={1.5} />
    </motion.a>
  );
}
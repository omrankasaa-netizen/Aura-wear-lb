import React, { useState, useEffect } from 'react';
import { useLang } from '@/contexts/LanguageContext';
import { useCart } from '@/contexts/CartContext';
import { useAuthUser } from '@/contexts/AuthUserContext';
import { useWishlist } from '@/contexts/WishlistContext';
import { Link, useLocation } from 'react-router-dom';
import { ShoppingBag, Heart, User, Menu, X, Search, ChevronRight } from 'lucide-react';
import { useCustomerTier } from '@/hooks/useCustomerTier';
import { LOGO, COLLECTIONS } from '@/lib/brand';

export default function Header() {
  const { lang, toggleLang, t } = useLang();
  const { totalQty: count, setIsOpen } = useCart();
  const { currentUser } = useAuthUser();
  const wishlist = useWishlist?.();
  const wishCount = wishlist?.wishlistIds?.length || 0;
  const { customer } = useCustomerTier(currentUser?.email);
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const tier = customer?.current_tier || customer?.membership_tier;

  function submitSearch(e) {
    e.preventDefault();
    if (!query.trim()) return;
    window.location.href = `/shop?q=${encodeURIComponent(query.trim())}`;
  }

  const IconBtn = ({ children, ...props }) => (
    <button {...props} className="flex items-center justify-center w-10 h-10 hover:bg-secondary/60 transition-colors rounded-sm">
      {children}
    </button>
  );

  return (
    <header className={`sticky top-0 z-50 bg-background/95 backdrop-blur transition-shadow duration-300 border-b border-border ${scrolled ? 'shadow-[0_1px_0_0_hsl(var(--border))]' : ''}`}>
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16 lg:h-20 gap-4">
          {/* Mobile menu toggle */}
          <button onClick={() => setMobileOpen(true)} className="lg:hidden flex items-center justify-center w-10 h-10 -ml-2" aria-label="Menu">
            <Menu className="w-5 h-5" strokeWidth={1.5} />
          </button>

          {/* Desktop nav (left) */}
          <nav className="hidden lg:flex items-center gap-6 flex-1">
            {COLLECTIONS.slice(0, 5).map((c) => (
              <Link key={c.slug} to={`/shop?category=${c.slug}`}
                className="eyebrow text-foreground/80 hover:text-foreground transition-colors">
                {c.label}
              </Link>
            ))}
          </nav>

          {/* Logo (center) */}
          <Link to="/" className="flex flex-col items-center shrink-0 lg:absolute lg:left-1/2 lg:-translate-x-1/2">
            <img src={LOGO.dark} alt="AURA" className="h-7 lg:h-9 w-auto object-contain" />
          </Link>

          {/* Right actions */}
          <div className="flex items-center gap-0.5 lg:flex-1 lg:justify-end">
            <IconBtn onClick={() => setSearchOpen((o) => !o)} aria-label={t('Search', 'بحث')}>
              <Search className="w-5 h-5" strokeWidth={1.5} />
            </IconBtn>

            <button onClick={toggleLang}
              className="hidden sm:flex items-center justify-center w-10 h-10 text-[11px] font-display font-semibold tracking-wider hover:bg-secondary/60 rounded-sm"
              aria-label={t('Switch language', 'تغيير اللغة')}>
              {lang === 'en' ? 'ع' : 'EN'}
            </button>

            <Link to="/wishlist" className="relative flex items-center justify-center w-10 h-10 hover:bg-secondary/60 transition-colors rounded-sm" aria-label={t('Wishlist', 'المفضلة')}>
              <Heart className="w-5 h-5" strokeWidth={1.5} />
              {wishCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-primary text-primary-foreground text-[9px] font-bold rounded-full flex items-center justify-center">{wishCount > 9 ? '9+' : wishCount}</span>
              )}
            </Link>

            <Link to={currentUser ? '/account' : '/login'}
              className="flex items-center gap-1.5 px-2 h-10 hover:bg-secondary/60 transition-colors rounded-sm" aria-label={t('Account', 'حسابي')}>
              <User className="w-5 h-5" strokeWidth={1.5} />
              {currentUser && tier && (
                <span className="hidden md:inline-flex eyebrow text-[10px] text-muted-foreground">{tier}</span>
              )}
            </Link>

            <button onClick={() => setIsOpen(true)} className="relative flex items-center justify-center w-10 h-10 hover:bg-secondary/60 transition-colors rounded-sm" aria-label={t('Cart', 'السلة')}>
              <ShoppingBag className="w-5 h-5" strokeWidth={1.5} />
              {count > 0 && (
                <span className="absolute top-1 right-1 min-w-4 h-4 px-1 bg-primary text-primary-foreground text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
                  {count > 9 ? '9+' : count}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Search bar */}
        {searchOpen && (
          <form onSubmit={submitSearch} className="pb-3 -mt-1 flex items-center gap-2 border-t border-border pt-3 animate-in fade-in slide-in-from-top-1 duration-200">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('Search tees, polos, jeans…', 'ابحث عن تيشيرت، بولو، جينز…')}
              className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-muted-foreground"
            />
            <button type="button" onClick={() => setSearchOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
          </form>
        )}
      </div>

      {/* Mobile nav drawer */}
      {mobileOpen && (
        <>
          <div className="fixed inset-0 bg-black/50 z-50 lg:hidden animate-in fade-in duration-200" onClick={() => setMobileOpen(false)} />
          <div className="fixed left-0 top-0 bottom-0 w-[85%] max-w-xs bg-background z-50 lg:hidden flex flex-col shadow-2xl animate-in slide-in-from-left duration-300">
            <div className="flex items-center justify-between h-16 px-4 border-b border-border">
              <img src={LOGO.dark} alt="AURA" className="h-6 w-auto" />
              <button onClick={() => setMobileOpen(false)} className="w-10 h-10 flex items-center justify-center -mr-2"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto py-2">
              <p className="eyebrow text-muted-foreground px-4 pt-4 pb-2">{t('Shop', 'تسوّق')}</p>
              {COLLECTIONS.map((c) => (
                <Link key={c.slug} to={`/shop?category=${c.slug}`}
                  className="flex items-center justify-between px-4 py-3.5 font-display text-sm uppercase tracking-wide border-b border-border/50 hover:bg-secondary/40">
                  {c.label}
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </Link>
              ))}
              <div className="px-4 py-4 mt-2 space-y-3">
                <Link to="/about" className="block text-sm text-muted-foreground hover:text-foreground">{t('About AURA', 'عن AURA')}</Link>
                <Link to="/track" className="block text-sm text-muted-foreground hover:text-foreground">{t('Track Order', 'تتبع الطلب')}</Link>
                <Link to="/faq" className="block text-sm text-muted-foreground hover:text-foreground">{t('Help & FAQ', 'المساعدة')}</Link>
                <button onClick={toggleLang} className="block text-sm text-muted-foreground hover:text-foreground">{lang === 'en' ? 'العربية' : 'English'}</button>
              </div>
            </div>
            <Link to={currentUser ? '/account' : '/login'} className="btn-primary m-4 rounded-sm">
              {currentUser ? t('My Account', 'حسابي') : t('Sign In', 'تسجيل الدخول')}
            </Link>
          </div>
        </>
      )}
    </header>
  );
}

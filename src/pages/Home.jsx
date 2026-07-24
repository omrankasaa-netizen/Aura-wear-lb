import React, { Suspense, lazy } from 'react';
import HeroSection from '@/components/home/HeroSection';
import FeaturedCategories from '@/components/home/FeaturedCategories';
import ProductRow from '@/components/home/ProductRow';
import DeferredSection from '@/components/home/DeferredSection';

const ShopTheLook = lazy(() => import('@/components/home/ShopTheLook'));
const OfferBanner = lazy(() => import('@/components/home/OfferBanner'));
const TrustStrip = lazy(() => import('@/components/home/TrustStrip'));
const InstagramStrip = lazy(() => import('@/components/home/InstagramStrip'));
const FloatingWhatsApp = lazy(() => import('@/components/home/FloatingWhatsApp'));

function SectionSkeleton({ className = 'h-24' }) {
  return (
    <div className={`max-w-[1280px] mx-auto px-4 sm:px-6 ${className}`} aria-hidden="true">
      <div className="h-full rounded-sm bg-secondary/55 animate-pulse" />
    </div>
  );
}

export default function Home() {
  return (
    <div className="flex flex-col">
      <HeroSection />
      <FeaturedCategories />
      <ProductRow
        title="New Arrivals"
        titleAr="الوصولات الجديدة"
        filter={{ is_new: true, status: 'Active' }}
        viewAllLink="/shop?category=new-arrivals"
      />
      <ProductRow
        title="Best Sellers"
        titleAr="الأكثر مبيعاً"
        filter={{ is_featured: true, status: 'Active' }}
        viewAllLink="/shop?category=best-sellers"
      />
      <DeferredSection minHeight={420} fallback={<SectionSkeleton className="h-[420px]" />}>
        <Suspense fallback={<SectionSkeleton className="h-[420px]" />}>
          <ShopTheLook />
        </Suspense>
      </DeferredSection>
      <DeferredSection minHeight={260} fallback={<SectionSkeleton className="h-[260px]" />}>
        <Suspense fallback={<SectionSkeleton className="h-[260px]" />}>
          <OfferBanner />
        </Suspense>
      </DeferredSection>
      <DeferredSection minHeight={96} fallback={<SectionSkeleton className="h-24" />}>
        <Suspense fallback={<SectionSkeleton className="h-24" />}>
          <TrustStrip />
        </Suspense>
      </DeferredSection>
      <DeferredSection minHeight={360} fallback={<SectionSkeleton className="h-[360px]" />}>
        <Suspense fallback={<SectionSkeleton className="h-[360px]" />}>
          <InstagramStrip />
        </Suspense>
      </DeferredSection>
      <DeferredSection minHeight={48}>
        <Suspense fallback={null}>
          <FloatingWhatsApp />
        </Suspense>
      </DeferredSection>
    </div>
  );
}

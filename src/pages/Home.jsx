import React from 'react';
import AnnouncementBar from '@/components/home/AnnouncementBar';
import HeroSection from '@/components/home/HeroSection';
import FeaturedCategories from '@/components/home/FeaturedCategories';
import ProductRow from '@/components/home/ProductRow';
import ShopTheLook from '@/components/home/ShopTheLook';
import OfferBanner from '@/components/home/OfferBanner';
import TrustStrip from '@/components/home/TrustStrip';
import InstagramStrip from '@/components/home/InstagramStrip';
import FloatingWhatsApp from '@/components/home/FloatingWhatsApp';

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
      <ShopTheLook />
      <OfferBanner />
      <TrustStrip />
      <InstagramStrip />
      <FloatingWhatsApp />
    </div>
  );
}

import React, { createContext, useContext } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { getBestDiscount, getBestDiscountAnySize, applyDiscountToPrice, isDiscountLive, isCampaignLive } from '@/lib/discounts';

const DiscountContext = createContext({});

export function DiscountProvider({ children }) {
  const { data: discounts = [] } = useQuery({
    queryKey: ['active-discounts'],
    queryFn: () => base44.entities.Discount.filter({ is_active: true }, '-created_date', 100),
    staleTime: 60_000,
  });

  const { data: campaigns = [] } = useQuery({
    queryKey: ['active-campaigns'],
    queryFn: () => base44.entities.Campaign.filter({ is_active: true }, '-starts_at', 50),
    staleTime: 60_000,
  });

  const liveDiscounts = discounts.filter(isDiscountLive);
  const liveCampaigns = campaigns.filter(isCampaignLive);

  // `size` is optional — pass the selected variant size so size-scoped
  // discounts (e.g. "flat $15 on XL") only resolve for the sizes they cover.
  // With no size, a size-scoped discount intentionally does NOT apply, so
  // product cards/grids keep showing the real base price.
  function getProductDiscount(product, size = null) {
    return getBestDiscount(liveDiscounts, product, size);
  }

  function getDiscountedPrice(product, size = null) {
    const d = getProductDiscount(product, size);
    if (!d) return product.price_usd;
    return applyDiscountToPrice(d, product.price_usd);
  }

  // Advertising-only: best live discount ignoring size scoping. For "is there
  // a sale on this product?" checks (Sale filter, select-sizes hints) — never
  // use it to quote a price, since it may only apply to specific sizes.
  function getProductDiscountAnySize(product) {
    return getBestDiscountAnySize(liveDiscounts, product);
  }

  function getCampaignForPlacement(placement) {
    return liveCampaigns.find(c => c.placement === placement) || null;
  }

  return (
    <DiscountContext.Provider value={{ liveDiscounts, liveCampaigns, getProductDiscount, getDiscountedPrice, getProductDiscountAnySize, getCampaignForPlacement }}>
      {children}
    </DiscountContext.Provider>
  );
}

export function useDiscounts() {
  return useContext(DiscountContext);
}

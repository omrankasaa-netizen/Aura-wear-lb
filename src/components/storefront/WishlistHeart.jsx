import React from 'react';
import { Heart } from 'lucide-react';
import { useWishlist } from '@/contexts/WishlistContext';

export default function WishlistHeart({ productId, className = '' }) {
  const { isWishlisted, toggle } = useWishlist();
  const active = isWishlisted(productId);

  return (
    <button
      onClick={e => { e.preventDefault(); e.stopPropagation(); toggle(productId); }}
      className={`flex items-center justify-center transition-all ${className}`}
      aria-label={active ? 'Remove from wishlist' : 'Add to wishlist'}
    >
      <Heart className={`w-4 h-4 transition-colors ${active ? 'fill-foreground text-foreground' : 'text-foreground/70 hover:text-foreground'}`} strokeWidth={1.5} />
    </button>
  );
}
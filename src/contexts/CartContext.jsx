import React, { createContext, useContext, useState, useEffect } from 'react';
import { useDiscounts } from '@/contexts/DiscountContext';
import { applyDiscountToPrice } from '@/lib/discounts';
import { trackAddToCart } from '@/lib/meta';
import { safeStorage } from '@/lib/safeStorage';
import { ttAddToCart } from '@/lib/tiktok';
import { gaAddToCart } from '@/lib/ga4';

const CartContext = createContext();
const STORAGE_KEY = 'aura-cart';

function loadCart() {
  try {
    const raw = safeStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function CartProvider({ children }) {
  const [items, setItems] = useState(loadCart);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    try {
      safeStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      /* storage unavailable (private mode / quota) — cart stays in memory */
    }
  }, [items]);

  function getKey(product, variant) {
    return variant ? `${product.id}_${variant.id}` : String(product.id);
  }

  // UX clamp: on-hand minus reserved from the freshest product/variant copy we
  // hold. Checkout revalidation + server reserve remain the hard gate; this
  // stops shoppers bagging unlimited units of a low-stock item.
  function maxAddable(product, variant) {
    const source = variant || product;
    if (!source) return 0;
    const onHand = Number(source.qty_on_hand ?? source.stock_quantity ?? 0);
    const reserved = Number(source.qty_reserved ?? 0);
    return Math.max(0, onHand - reserved);
  }

  function addItem(product, variant, qty = 1) {
    const key = getKey(product, variant);
    const max = maxAddable(product, variant);
    if (max <= 0) return;
    const addPrice = parseFloat(variant?.price_usd || product.price_usd || 0);
    trackAddToCart(product, qty, addPrice);
    ttAddToCart(product, qty, addPrice);
    gaAddToCart(product, qty, addPrice);
    setItems(prev => {
      const existing = prev.find(i => i.key === key);
      if (existing) {
        return prev.map(i => i.key === key ? { ...i, quantity: Math.min(max, i.quantity + qty) } : i);
      }
      const price = parseFloat(variant?.price_usd || product.price_usd || 0);
      return [...prev, { key, product, variant, quantity: Math.min(max, qty), price }];
    });
  }

  function removeItem(key) {
    setItems(prev => prev.filter(i => i.key !== key));
  }

  function updateQty(key, quantity) {
    if (quantity <= 0) { removeItem(key); return; }
    setItems(prev => prev.map(i => {
      if (i.key !== key) return i;
      const max = maxAddable(i.product, i.variant);
      if (max <= 0) return i;
      return { ...i, quantity: Math.min(max, quantity) };
    }));
  }

  function clearCart() { setItems([]); }

  // Resolve auto-discounts live so the cart never freezes a stale add-time price.
  // Variant price (stored as `price`) is the BASE; the auto-discount applies on top,
  // using the same logic the storefront badge uses so badge price == cart price.
  // The item's size is passed along so size-scoped discounts (e.g. "$5 off XXL")
  // only discount the sizes they cover — this is what wires them into the cart
  // subtotal, the checkout order summary, and the saved OrderItem unit price.
  const { getProductDiscount } = useDiscounts();
  const pricedItems = items.map(item => {
    const rawPrice = parseFloat(item.price ?? item.variant?.price_usd ?? item.product?.price_usd ?? 0) || 0;
    const discount = getProductDiscount ? getProductDiscount(item.product, item.variant?.size || null) : null;
    const price = discount ? applyDiscountToPrice(discount, rawPrice) : rawPrice;
    return { ...item, rawPrice, price, discount };
  });

  const totalQty = pricedItems.reduce((s, i) => s + i.quantity, 0);
  const subtotal = pricedItems.reduce((s, i) => s + (parseFloat(i.price) || 0) * i.quantity, 0);

  return (
    <CartContext.Provider value={{ items: pricedItems, addItem, removeItem, updateQty, clearCart, totalQty, subtotal, isOpen, setIsOpen }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  return useContext(CartContext);
}

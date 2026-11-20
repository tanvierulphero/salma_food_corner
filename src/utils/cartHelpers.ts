/**
 * Pure multi-item cart & order-item storage helpers for Salma Food Corner.
 * Guarantees distinct items never collide (even with missing/numeric IDs or string prices)
 * and keeps serialized order items lightweight so multi-item checkout never hits storage limits.
 */

export interface CartCompatibleItem {
  id?: string | number | null;
  nameBn?: string;
  nameEn?: string;
  name?: string;
  category?: string;
  price: number | string;
  image?: string;
}

export type CartItemWithMeta<T extends CartCompatibleItem> = Omit<
  T,
  'id' | 'price' | 'quantity'
> & {
  id: string;
  price: number;
  quantity: number;
};

export function getCartItemKey(item: CartCompatibleItem): string {
  const rawId = item?.id !== undefined && item?.id !== null ? String(item.id).trim() : '';
  if (rawId) return rawId;
  const fallbackName = String(item?.nameBn || item?.name || item?.nameEn || 'item').trim();
  const fallbackPrice = Number(item?.price) || 0;
  return `fallback-${fallbackName}-${fallbackPrice}`;
}

export function toNumericPrice(price: number | string | undefined | null): number {
  const n = Number(price);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function addItemToCart<T extends CartCompatibleItem>(
  cart: Array<CartItemWithMeta<T>>,
  item: T,
  qtyToAdd: number = 1
): Array<CartItemWithMeta<T>> {
  const key = getCartItemKey(item);
  const safePrice = toNumericPrice(item.price);
  const safeQty = Math.max(1, Math.floor(Number(qtyToAdd) || 1));

  const existingIndex = cart.findIndex((c) => getCartItemKey(c) === key);
  if (existingIndex >= 0) {
    return cart.map((c, idx) =>
      idx === existingIndex
        ? {
            ...c,
            id: key,
            price: safePrice,
            quantity: Math.max(1, Number(c.quantity) || 1) + safeQty,
          }
        : c
    );
  }

  return [
    ...cart,
    {
      ...item,
      id: key,
      nameBn: String(item.nameBn || item.name || item.nameEn || 'খাবার'),
      nameEn: String(item.nameEn || ''),
      price: safePrice,
      quantity: safeQty,
    } as CartItemWithMeta<T>,
  ];
}

export function updateCartItemQuantity<T extends CartCompatibleItem & { quantity: number }>(
  cart: T[],
  itemId: string,
  delta: number
): T[] {
  const targetKey = String(itemId || '').trim();
  return cart
    .map((c) => {
      if (getCartItemKey(c) !== targetKey) return c;
      const nextQty = (Number(c.quantity) || 0) + delta;
      return nextQty > 0 ? { ...c, quantity: nextQty } : null;
    })
    .filter((c): c is T => c !== null);
}

export function removeCartItem<T extends CartCompatibleItem>(cart: T[], itemId: string): T[] {
  const targetKey = String(itemId || '').trim();
  return cart.filter((c) => getCartItemKey(c) !== targetKey);
}

export function calculateCartSubtotal(
  cart: Array<{ price: number | string; quantity: number | string }>
): number {
  return cart.reduce((sum, item) => {
    const price = toNumericPrice(item.price);
    const qty = Math.max(0, Number(item.quantity) || 0);
    return sum + price * qty;
  }, 0);
}

export function countCartItems(cart: Array<{ quantity: number | string }>): number {
  return cart.reduce((sum, item) => sum + Math.max(0, Number(item.quantity) || 0), 0);
}

/**
 * Strips huge inline base64 data:image URIs from order line items before persisting orders
 * to localStorage and cPanel API so multi-item orders never hit QuotaExceededError or post_max_size.
 */
export function sanitizeOrderItemsForStorage<T extends CartCompatibleItem & { quantity: number }>(
  cart: T[]
): T[] {
  return cart.map((item) => {
    const img = typeof item.image === 'string' ? item.image : '';
    const safeImage = img.startsWith('data:') && img.length > 2048 ? '' : img;
    return {
      ...item,
      id: getCartItemKey(item),
      price: toNumericPrice(item.price),
      quantity: Math.max(1, Math.floor(Number(item.quantity) || 1)),
      image: safeImage,
    };
  });
}

/**
 * Pure checkout, 30% advance payment, and 1km service radius calculations
 * for Salma Food Corner.
 *
 * Business policy:
 * - Service operates strictly within a 1 km radius around the shop, so NO delivery charge is added or displayed.
 * - Minimum advance payment is 30% of the final bill (rounded up to whole Taka via Math.ceil).
 */

export const ADVANCE_RATE = 0.3;
export const DEFAULT_SERVICE_RADIUS_KM = 1.0;

export interface CheckoutSummaryInput {
  subtotal: number;
  couponDiscount?: number;
  loyaltyDiscount?: number;
  advanceOption?: '30' | '100';
}

export interface CheckoutSummary {
  subtotal: number;
  deliveryFee: 0;
  totalDiscount: number;
  finalTotal: number;
  minAdvance: number;
  advanceAmount: number;
  dueAmount: number;
  advancePercentage: 30 | 100;
}

export function calculateCheckoutSummary({
  subtotal,
  couponDiscount = 0,
  loyaltyDiscount = 0,
  advanceOption = '30'
}: CheckoutSummaryInput): CheckoutSummary {
  const safeSubtotal = Math.max(0, Number(subtotal) || 0);
  const safeCoupon = Math.max(0, Number(couponDiscount) || 0);
  const safeLoyalty = Math.max(0, Number(loyaltyDiscount) || 0);
  const totalDiscount = safeCoupon + safeLoyalty;

  // Delivery charge is strictly 0 within the 1km local business zone
  const deliveryFee = 0 as const;
  const finalTotal = Math.max(0, safeSubtotal - totalDiscount);
  const minAdvance = Math.ceil(finalTotal * ADVANCE_RATE);
  const advancePercentage: 30 | 100 = advanceOption === '100' ? 100 : 30;
  const advanceAmount = advancePercentage === 100 ? finalTotal : minAdvance;
  const dueAmount = Math.max(0, finalTotal - advanceAmount);

  return {
    subtotal: safeSubtotal,
    deliveryFee,
    totalDiscount,
    finalTotal,
    minAdvance,
    advanceAmount,
    dueAmount,
    advancePercentage
  };
}

export function isWithinLocalServiceArea(
  distanceKm: number | null,
  isAddressMatched: boolean,
  radiusKm: number = DEFAULT_SERVICE_RADIUS_KM
): boolean {
  if (isAddressMatched) return true;
  if (distanceKm === null || Number.isNaN(distanceKm)) return false;
  return distanceKm <= radiusKm;
}

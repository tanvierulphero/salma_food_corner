import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCheckoutSummary, isWithinLocalServiceArea, ADVANCE_RATE } from './orderCalculations';

test('ADVANCE_RATE is 30%', () => {
  assert.equal(ADVANCE_RATE, 0.3);
});

test('deliveryFee is always 0 and 30% advance is calculated properly', () => {
  const res = calculateCheckoutSummary({
    subtotal: 500,
    couponDiscount: 0,
    loyaltyDiscount: 0,
    advanceOption: '30'
  });

  assert.equal(res.deliveryFee, 0);
  assert.equal(res.finalTotal, 500);
  assert.equal(res.minAdvance, 150);
  assert.equal(res.advanceAmount, 150);
  assert.equal(res.dueAmount, 350);
  assert.equal(res.advancePercentage, 30);
});

test('30% advance rounds up fractional taka cleanly', () => {
  const res = calculateCheckoutSummary({
    subtotal: 350,
    advanceOption: '30'
  });

  assert.equal(res.finalTotal, 350);
  assert.equal(res.minAdvance, 105);
  assert.equal(res.advanceAmount, 105);
  assert.equal(res.dueAmount, 245);

  const oddRes = calculateCheckoutSummary({
    subtotal: 101,
    advanceOption: '30'
  });
  assert.equal(oddRes.minAdvance, 31); // Math.ceil(30.3) = 31
  assert.equal(oddRes.dueAmount, 70);
});

test('100% full payment sets dueAmount to 0 and keeps deliveryFee 0', () => {
  const res = calculateCheckoutSummary({
    subtotal: 400,
    couponDiscount: 40,
    loyaltyDiscount: 10,
    advanceOption: '100'
  });

  assert.equal(res.deliveryFee, 0);
  assert.equal(res.finalTotal, 350);
  assert.equal(res.minAdvance, 105);
  assert.equal(res.advanceAmount, 350);
  assert.equal(res.dueAmount, 0);
  assert.equal(res.advancePercentage, 100);
});

test('discounts cannot make finalTotal negative', () => {
  const res = calculateCheckoutSummary({
    subtotal: 100,
    couponDiscount: 120,
    advanceOption: '30'
  });

  assert.equal(res.finalTotal, 0);
  assert.equal(res.minAdvance, 0);
  assert.equal(res.advanceAmount, 0);
  assert.equal(res.dueAmount, 0);
});

test('isWithinLocalServiceArea checks 1km radius and address keyword match', () => {
  assert.equal(isWithinLocalServiceArea(0.8, false, 1.0), true);
  assert.equal(isWithinLocalServiceArea(1.0, false, 1.0), true);
  assert.equal(isWithinLocalServiceArea(1.2, false, 1.0), false);
  assert.equal(isWithinLocalServiceArea(null, false, 1.0), false);
  assert.equal(isWithinLocalServiceArea(null, true, 1.0), true);
});

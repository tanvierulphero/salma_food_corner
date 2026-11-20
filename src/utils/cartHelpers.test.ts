import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addItemToCart,
  calculateCartSubtotal,
  countCartItems,
  getCartItemKey,
  removeCartItem,
  sanitizeOrderItemsForStorage,
  updateCartItemQuantity,
} from './cartHelpers.ts';

test('addItemToCart adds multiple distinct items and computes accurate subtotal & item counts', () => {
  let cart: any[] = [];
  cart = addItemToCart(cart, { id: 'food-1', nameBn: 'খাসির কাচ্চি', nameEn: 'Kacchi', price: '380' }, 2);
  cart = addItemToCart(cart, { id: 'food-2', nameBn: 'বোরহানি', nameEn: 'Borhani', price: 80 }, 1);
  cart = addItemToCart(cart, { id: 'food-3', nameBn: 'চিকেন রোস্ট', nameEn: 'Roast', price: '220' }, 2);

  assert.equal(cart.length, 3);
  assert.equal(countCartItems(cart), 5);
  assert.equal(calculateCartSubtotal(cart), 380 * 2 + 80 * 1 + 220 * 2);

  // Adding an existing item increments its quantity without affecting other items
  cart = addItemToCart(cart, { id: 'food-2', nameBn: 'বোরহানি', nameEn: 'Borhani', price: 80 }, 1);
  assert.equal(cart.length, 3);
  assert.equal(cart[1].quantity, 2);
  assert.equal(countCartItems(cart), 6);
  assert.equal(calculateCartSubtotal(cart), 380 * 2 + 80 * 2 + 220 * 2);
});

test('addItemToCart keeps items separate even when id is missing or numeric', () => {
  let cart: any[] = [];
  cart = addItemToCart(cart, { id: undefined, nameBn: 'তেহারি', price: 240 }, 1);
  cart = addItemToCart(cart, { id: undefined, nameBn: 'ফিরনি', price: 90 }, 2);
  cart = addItemToCart(cart, { id: 101, nameBn: 'চিকেন ফ্রাই', price: 150 }, 1);

  assert.equal(cart.length, 3);
  assert.equal(countCartItems(cart), 4);
  assert.equal(calculateCartSubtotal(cart), 240 + 180 + 150);
  assert.equal(getCartItemKey(cart[2]), '101');
});

test('updateCartItemQuantity and removeCartItem modify only the targeted item in a multi-item cart', () => {
  let cart: any[] = [];
  cart = addItemToCart(cart, { id: 'a', nameBn: 'আইটেম ১', price: 100 }, 2);
  cart = addItemToCart(cart, { id: 'b', nameBn: 'আইটেম ২', price: 250 }, 1);

  cart = updateCartItemQuantity(cart, 'a', -1);
  assert.equal(cart.length, 2);
  assert.equal(cart[0].quantity, 1);

  cart = updateCartItemQuantity(cart, 'b', -1);
  assert.equal(cart.length, 1);
  assert.equal(cart[0].id, 'a');

  cart = addItemToCart(cart, { id: 'c', nameBn: 'আইটেম ৩', price: 300 }, 3);
  cart = removeCartItem(cart, 'a');
  assert.equal(cart.length, 1);
  assert.equal(cart[0].id, 'c');
  assert.equal(calculateCartSubtotal(cart), 900);
});

test('sanitizeOrderItemsForStorage strips oversized base64 images while preserving URL images and item data', () => {
  const bigBase64 = 'data:image/jpeg;base64,' + 'A'.repeat(5000);
  const cart = [
    { id: 'food-1', nameBn: 'কাচ্চি', price: '400' as any, quantity: 2, image: bigBase64 },
    { id: 'food-2', nameBn: 'বোরহানি', price: 80, quantity: 1, image: 'uploads/borhani.jpg' },
  ];

  const sanitized = sanitizeOrderItemsForStorage(cart);
  assert.equal(sanitized.length, 2);
  assert.equal(sanitized[0].image, '');
  assert.equal(sanitized[0].price, 400);
  assert.equal(sanitized[1].image, 'uploads/borhani.jpg');
});

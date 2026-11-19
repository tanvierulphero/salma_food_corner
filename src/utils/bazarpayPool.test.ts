import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  buildBazarPaySignaturePayload,
  storeIncomingBazarPayTx,
  verifyAndClaimBazarPayTx,
  type BazarPayTransaction,
} from './bazarpayPool.ts';

test('storeIncomingBazarPayTx normalizes trx_id and verifyAndClaimBazarPayTx claims matching payment', () => {
  const pool: Record<string, BazarPayTransaction> = {};
  const stored = storeIncomingBazarPayTx(pool, {
    trx_id: '  bk9j4k2l  ',
    amount_bdt: 250,
    gateway: 'bKash',
    sender_wallet: '01711000000',
  });
  assert.equal(stored.ok, true);
  if (stored.ok) assert.equal(stored.trxId, 'BK9J4K2L');

  const res = verifyAndClaimBazarPayTx(pool, {
    orderId: 'SF-1001',
    trxId: 'bk9j4k2l',
    amountBdt: 250,
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.paid, true);
  if (res.body.paid) {
    assert.equal(res.body.trxId, 'BK9J4K2L');
    assert.equal(res.body.gateway, 'bKash');
    assert.equal(res.body.orderId, 'SF-1001');
  }
});

test('verifyAndClaimBazarPayTx rejects unknown TrxID (404), amount mismatch (400), and reuse (409)', () => {
  const pool: Record<string, BazarPayTransaction> = {};
  storeIncomingBazarPayTx(pool, {
    trx_id: 'NG123456',
    amount_bdt: 150,
    gateway: 'Nagad',
  });

  const missing = verifyAndClaimBazarPayTx(pool, { orderId: 'SF-1', trxId: 'UNKNOWN', amountBdt: 100 });
  assert.equal(missing.status, 404);
  assert.equal(missing.body.paid, false);

  const short = verifyAndClaimBazarPayTx(pool, { orderId: 'SF-1', trxId: 'NG123456', amountBdt: 200 });
  assert.equal(short.status, 400);
  assert.equal(short.body.paid, false);

  const ok = verifyAndClaimBazarPayTx(pool, { orderId: 'SF-1', trxId: 'NG123456', amountBdt: 150 });
  assert.equal(ok.status, 200);

  // Idempotent retry for the same order succeeds
  const sameOrder = verifyAndClaimBazarPayTx(pool, { orderId: 'SF-1', trxId: 'NG123456', amountBdt: 150 });
  assert.equal(sameOrder.status, 200);

  // Reuse on a different order is blocked with 409
  const reused = verifyAndClaimBazarPayTx(pool, { orderId: 'SF-2', trxId: 'NG123456', amountBdt: 150 });
  assert.equal(reused.status, 409);
  assert.equal(reused.body.paid, false);

  // Re-delivered webhook must not reset claimed flag
  storeIncomingBazarPayTx(pool, { trx_id: 'NG123456', amount_bdt: 150, gateway: 'Nagad' });
  const stillClaimed = verifyAndClaimBazarPayTx(pool, { orderId: 'SF-3', trxId: 'NG123456', amountBdt: 150 });
  assert.equal(stillClaimed.status, 409);
});

test('buildBazarPaySignaturePayload matches expected HMAC-SHA256 format', () => {
  const secret = 'bp_test_94f8a2c1e7b04d39';
  const ts = '1763560000';
  const rawBody = '  {"trx_id":"TRX123","amount_bdt":500,"gateway":"bKash"}  ';
  const payload = buildBazarPaySignaturePayload(ts, rawBody);
  assert.equal(payload, `${ts}.{"trx_id":"TRX123","amount_bdt":500,"gateway":"bKash"}`);

  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  assert.equal(sig.length, 64);
});

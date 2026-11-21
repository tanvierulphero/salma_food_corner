import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  buildBanglaQrPayload,
  buildBazarPaySignaturePayload,
  computeBazarPayWalletSummary,
  crc16Ccitt,
  createBazarPayPaymentSession,
  DEFAULT_BAZARPAY_RECEIVER_NUMBERS,
  markBazarPaySessionPaid,
  storeIncomingBazarPayTx,
  verifyAndClaimBazarPayTx,
  type BazarPayPaymentSession,
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

test('createBazarPayPaymentSession creates session with 01840684615 receiver numbers and marks PAID cleanly', () => {
  const sessions: Record<string, BazarPayPaymentSession> = {};
  const created = createBazarPayPaymentSession(
    sessions,
    { orderId: 'ORD-1001', amountBdt: 1500, customerName: 'Rahim', gateway: 'BKASH' },
    DEFAULT_BAZARPAY_RECEIVER_NUMBERS,
    1763560000000
  );

  assert.equal(created.paymentId, 'bp_pay_1763560000000');
  assert.equal(created.checkoutUrl, '/bazarpay/checkout/bp_pay_1763560000000');
  assert.equal(created.receiverNumbers.BKASH, '01840684615');
  assert.equal(created.receiverNumbers.NAGAD, '01840684615');
  assert.equal(created.receiverNumbers.ROCKET, '01840684615');
  assert.equal(created.receiverNumbers.BANGLA_QR, '01840684615');
  assert.ok(created.banglaQrPayload.startsWith('000201'));
  assert.equal(created.session.status, 'PENDING');

  const paidSession = markBazarPaySessionPaid(sessions, {
    paymentId: created.paymentId,
    trxId: 'BK999111',
    gateway: 'BKASH',
  });
  assert.ok(paidSession);
  assert.equal(paidSession.status, 'PAID');
  assert.equal(paidSession.trxId, 'BK999111');
});

test('buildBanglaQrPayload generates valid EMVCo payload with BDT currency, wallet, amount, and CRC16', () => {
  const payload = buildBanglaQrPayload({
    receiverNumber: '01840684615',
    amountBdt: 450,
    orderId: 'SF-5501',
  });
  assert.ok(payload.startsWith('000201010212'));
  assert.ok(payload.includes('01840684615'));
  assert.ok(payload.includes('5303050'));
  assert.ok(payload.includes('5403450'));
  assert.ok(payload.includes('5802BD'));
  const body = payload.slice(0, -4);
  const crc = payload.slice(-4);
  assert.equal(crc, crc16Ccitt(body));
});

test('buildBazarPaySignaturePayload matches expected HMAC-SHA256 format', () => {
  const secret = 'bp_test_e4f767322bc64af2';
  const ts = '1763290000000';
  const rawBody = '  {"event":"bazarpay.mfs.payment_received","trx_id":"BK7M91K42P","gateway":"BKASH","account_mode":"PERSONAL_SEND_MONEY","amount_bdt":1500,"sender_wallet":"017XXXXXXXX","external_order_id":"","timestamp_ms":1763290000000}  ';
  const payload = buildBazarPaySignaturePayload(ts, rawBody);
  assert.equal(payload, `${ts}.${rawBody.trim()}`);

  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  assert.equal(sig.length, 64);
});

test('computeBazarPayWalletSummary computes totalSettledBdt, verifiedCount, and unclaimedCount accurately', () => {
  const pool: Record<string, BazarPayTransaction> = {};
  storeIncomingBazarPayTx(pool, {
    event: 'bazarpay.mfs.payment_received',
    trx_id: 'BK7M91K42P',
    gateway: 'BKASH',
    account_mode: 'PERSONAL_SEND_MONEY',
    amount_bdt: 1500,
    sender_wallet: '01711111111',
    external_order_id: '',
    timestamp_ms: 1763290000000,
  });
  storeIncomingBazarPayTx(pool, {
    event: 'bazarpay.mfs.payment_received',
    trx_id: 'NG88889999',
    gateway: 'NAGAD',
    account_mode: 'PERSONAL_SEND_MONEY',
    amount_bdt: 650,
    sender_wallet: '01822222222',
    external_order_id: '',
    timestamp_ms: 1763290010000,
  });

  const beforeClaim = computeBazarPayWalletSummary(pool);
  assert.deepEqual(beforeClaim, {
    ok: true,
    currency: 'BDT',
    totalSettledBdt: 0,
    verifiedCount: 0,
    unclaimedCount: 2,
  });

  verifyAndClaimBazarPayTx(pool, { orderId: 'ORD-1001', trxId: 'BK7M91K42P', amountBdt: 1500 });

  const afterClaim = computeBazarPayWalletSummary(pool);
  assert.deepEqual(afterClaim, {
    ok: true,
    currency: 'BDT',
    totalSettledBdt: 1500,
    verifiedCount: 1,
    unclaimedCount: 1,
  });
  assert.equal(pool['BK7M91K42P'].account_mode, 'PERSONAL_SEND_MONEY');
});

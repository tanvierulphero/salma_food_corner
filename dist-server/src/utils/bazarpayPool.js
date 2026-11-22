/**
 * Pure BazarPay webhook, payment session, and TrxID verification logic.
 * Used by server.ts and unit-tested with node:test.
 */
export const DEFAULT_BAZARPAY_RECEIVER_NUMBERS = {
    BKASH: '01840684615',
    NAGAD: '01840684615',
    ROCKET: '01840684615',
    BANGLA_QR: '01840684615',
};
export function normalizeTrxId(raw) {
    return String(raw ?? '').trim().toUpperCase();
}
export function buildBazarPaySignaturePayload(timestamp, rawBody) {
    return `${timestamp}.${rawBody.trim()}`;
}
function tlv(tag, value) {
    const clean = value;
    const len = String(clean.length).padStart(2, '0');
    return `${tag}${len}${clean}`;
}
export function crc16Ccitt(input) {
    let crc = 0xffff;
    for (let i = 0; i < input.length; i++) {
        crc ^= input.charCodeAt(i) << 8;
        for (let j = 0; j < 8; j++) {
            if ((crc & 0x8000) !== 0) {
                crc = ((crc << 1) ^ 0x1021) & 0xffff;
            }
            else {
                crc = (crc << 1) & 0xffff;
            }
        }
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
}
/**
 * Generates an EMVCo / Bangla QR Merchant Presented payload string for BazarPay BANGLA_QR.
 */
export function buildBanglaQrPayload(opts) {
    const wallet = String(opts.receiverNumber || DEFAULT_BAZARPAY_RECEIVER_NUMBERS.BANGLA_QR).replace(/[^0-9+]/g, '') || DEFAULT_BAZARPAY_RECEIVER_NUMBERS.BANGLA_QR;
    const amountNum = Number(opts.amountBdt ?? 0);
    const hasAmount = Number.isFinite(amountNum) && amountNum > 0;
    const merchantName = (opts.merchantName || 'Salma Food Corner').slice(0, 25);
    const merchantCity = (opts.merchantCity || 'Gazipur').slice(0, 15);
    const orderRef = String(opts.orderId || 'ORDER').replace(/[^A-Za-z0-9-_]/g, '').slice(0, 20) || 'ORDER';
    // Tag 26: Merchant Account Info (Bangla QR / BazarPay wallet identifier)
    const merchantAccountInfo = tlv('00', 'BD.BAZARPAY.QR') + tlv('01', wallet);
    // Tag 62: Additional Data (Bill/Order Reference)
    const additionalData = tlv('05', orderRef);
    const parts = [
        tlv('00', '01'),
        tlv('01', hasAmount ? '12' : '11'),
        tlv('26', merchantAccountInfo),
        tlv('52', '5812'),
        tlv('53', '050'),
        ...(hasAmount ? [tlv('54', Number.isInteger(amountNum) ? String(amountNum) : amountNum.toFixed(2))] : []),
        tlv('58', 'BD'),
        tlv('59', merchantName),
        tlv('60', merchantCity),
        tlv('62', additionalData),
    ];
    const payloadWithoutCrc = `${parts.join('')}6304`;
    return `${payloadWithoutCrc}${crc16Ccitt(payloadWithoutCrc)}`;
}
export function createBazarPayPaymentSession(sessions, input, receiverNumbers = DEFAULT_BAZARPAY_RECEIVER_NUMBERS, nowMs = Date.now()) {
    const paymentId = `bp_pay_${nowMs}`;
    const amount = Number(input.amountBdt ?? 0);
    const cleanAmount = Number.isFinite(amount) ? amount : 0;
    const gateway = String(input.gateway || 'BKASH').trim().toUpperCase() || 'BKASH';
    const orderId = String(input.orderId || `ORD-${nowMs}`).trim();
    const banglaQrPayload = buildBanglaQrPayload({
        receiverNumber: receiverNumbers.BANGLA_QR || DEFAULT_BAZARPAY_RECEIVER_NUMBERS.BANGLA_QR,
        amountBdt: cleanAmount,
        orderId,
    });
    const session = {
        paymentId,
        orderId,
        amountBdt: cleanAmount,
        customerName: String(input.customerName || 'Customer').trim() || 'Customer',
        gateway,
        status: 'PENDING',
        trxId: null,
        receiverNumbers: { ...receiverNumbers },
        banglaQrPayload,
        createdAt: nowMs,
        paidAt: null,
    };
    sessions[paymentId] = session;
    return {
        paymentId,
        checkoutUrl: `/bazarpay/checkout/${paymentId}`,
        receiverNumbers: { ...receiverNumbers },
        banglaQrPayload,
        session,
    };
}
export function markBazarPaySessionPaid(sessions, opts, nowMs = Date.now()) {
    let target;
    if (opts.paymentId && sessions[opts.paymentId]) {
        target = sessions[opts.paymentId];
    }
    else if (opts.orderId) {
        target = Object.values(sessions).find((s) => s.orderId === opts.orderId);
    }
    if (!target)
        return null;
    target.status = 'PAID';
    target.trxId = opts.trxId;
    if (opts.gateway)
        target.gateway = opts.gateway;
    target.paidAt = nowMs;
    return target;
}
export function storeIncomingBazarPayTx(pool, data, nowMs = Date.now()) {
    const trxId = normalizeTrxId(data.trx_id ?? data.trxId);
    if (!trxId) {
        return { ok: false, error: 'Missing trx_id in webhook payload' };
    }
    const existing = pool[trxId];
    // Never un-claim an already claimed TrxID if the webhook is re-delivered
    if (existing && existing.claimed) {
        return { ok: true, trxId };
    }
    const amount = Number(data.amount_bdt ?? data.amount ?? 0);
    const gateway = String(data.gateway ?? data.method ?? 'BKASH').trim() || 'BKASH';
    const senderWallet = data.sender_wallet !== undefined ? String(data.sender_wallet) : undefined;
    const accountMode = data.account_mode !== undefined ? String(data.account_mode) : undefined;
    const externalOrderId = data.external_order_id !== undefined ? String(data.external_order_id) : undefined;
    const event = data.event !== undefined ? String(data.event) : 'bazarpay.mfs.payment_received';
    const timestampMs = Number(data.timestamp_ms ?? nowMs);
    pool[trxId] = {
        ...data,
        event,
        trx_id: trxId,
        amount_bdt: Number.isFinite(amount) ? amount : 0,
        gateway,
        account_mode: accountMode,
        sender_wallet: senderWallet,
        external_order_id: externalOrderId,
        timestamp_ms: Number.isFinite(timestampMs) ? timestampMs : nowMs,
        claimed: false,
        claimed_order_id: null,
        received_at: nowMs,
        claimed_at: null,
    };
    return { ok: true, trxId };
}
export const AUTO_MATCH_WINDOW_MS = 30 * 60 * 1000;
/**
 * Automatically matches a newly arrived unclaimed webhook transaction to a matching PENDING payment session:
 * 1) Exact external_order_id match against session.orderId or session.paymentId (amount >= session.amountBdt)
 * 2) Newest PENDING session within 30 minutes with exact matching amount_bdt
 */
export function autoMatchWebhookToPendingSession(pool, sessions, trxId, nowMs = Date.now()) {
    const key = normalizeTrxId(trxId);
    const tx = pool[key];
    if (!tx || tx.claimed)
        return null;
    const txAmount = Number(tx.amount_bdt ?? 0);
    if (!Number.isFinite(txAmount) || txAmount <= 0)
        return null;
    const pending = Object.values(sessions)
        .filter((s) => s && s.status === 'PENDING' && Number(s.amountBdt) > 0)
        .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
    if (pending.length === 0)
        return null;
    const extRef = String(tx.external_order_id || '').trim().toLowerCase();
    let matched;
    if (extRef) {
        matched = pending.find((s) => (s.orderId.trim().toLowerCase() === extRef ||
            s.paymentId.trim().toLowerCase() === extRef) &&
            txAmount >= Number(s.amountBdt));
    }
    if (!matched) {
        matched = pending.find((s) => {
            const ageMs = nowMs - Number(s.createdAt || 0);
            return (ageMs >= -60_000 &&
                ageMs <= AUTO_MATCH_WINDOW_MS &&
                Math.abs(Number(s.amountBdt) - txAmount) < 0.01);
        });
    }
    if (!matched)
        return null;
    tx.claimed = true;
    tx.claimed_order_id = matched.orderId;
    tx.claimed_at = nowMs;
    matched.status = 'PAID';
    matched.trxId = key;
    if (tx.gateway)
        matched.gateway = tx.gateway;
    matched.paidAt = nowMs;
    return matched;
}
/**
 * Checks if a PENDING payment session can be auto-verified against an unclaimed recent transaction in the pool.
 */
export function reconcilePendingSessionWithPool(pool, sessions, paymentId, nowMs = Date.now()) {
    const session = sessions[paymentId] || null;
    if (!session)
        return { session: null, newlyMatched: false };
    if (session.status === 'PAID')
        return { session, newlyMatched: false };
    const expectedAmount = Number(session.amountBdt ?? 0);
    if (!Number.isFinite(expectedAmount) || expectedAmount <= 0) {
        return { session, newlyMatched: false };
    }
    const unclaimed = Object.values(pool)
        .filter((tx) => tx && !tx.claimed && Number(tx.amount_bdt) > 0)
        .sort((a, b) => Number(b.received_at || b.timestamp_ms || 0) - Number(a.received_at || a.timestamp_ms || 0));
    const orderLower = session.orderId.trim().toLowerCase();
    const payLower = session.paymentId.trim().toLowerCase();
    let matchedTx = unclaimed.find((tx) => {
        const ext = String(tx.external_order_id || '').trim().toLowerCase();
        return ext && (ext === orderLower || ext === payLower) && Number(tx.amount_bdt) >= expectedAmount;
    });
    if (!matchedTx) {
        matchedTx = unclaimed.find((tx) => {
            const txTs = Number(tx.received_at || tx.timestamp_ms || 0);
            const ageMs = nowMs - txTs;
            return (ageMs >= -60_000 &&
                ageMs <= AUTO_MATCH_WINDOW_MS &&
                Math.abs(Number(tx.amount_bdt) - expectedAmount) < 0.01);
        });
    }
    if (!matchedTx)
        return { session, newlyMatched: false };
    matchedTx.claimed = true;
    matchedTx.claimed_order_id = session.orderId;
    matchedTx.claimed_at = nowMs;
    session.status = 'PAID';
    session.trxId = matchedTx.trx_id;
    if (matchedTx.gateway)
        session.gateway = matchedTx.gateway;
    session.paidAt = nowMs;
    return { session, newlyMatched: true };
}
export function computeBazarPayWalletSummary(pool) {
    const all = pool && typeof pool === 'object' ? Object.values(pool) : [];
    const verified = all.filter((tx) => Boolean(tx && tx.claimed));
    const unclaimedCount = all.filter((tx) => tx && !tx.claimed).length;
    const totalSettledBdt = verified.reduce((sum, tx) => {
        const amt = Number(tx.amount_bdt ?? 0);
        return sum + (Number.isFinite(amt) ? amt : 0);
    }, 0);
    return {
        ok: true,
        currency: 'BDT',
        totalSettledBdt,
        verifiedCount: verified.length,
        unclaimedCount,
    };
}
export function verifyAndClaimBazarPayTx(pool, input, nowMs = Date.now()) {
    const key = normalizeTrxId(input.trxId);
    if (!key) {
        return {
            status: 400,
            body: { paid: false, message: 'TrxID প্রদান করুন।' },
        };
    }
    const tx = pool[key];
    if (!tx) {
        return {
            status: 404,
            body: {
                paid: false,
                message: 'TrxID এখনো পাওয়া যায়নি। পেমেন্ট করার কয়েক সেকেন্ড পর আবার চেষ্টা করুন।',
            },
        };
    }
    const requestedOrderId = String(input.orderId || '').trim();
    const requestedPaymentId = String(input.paymentId || '').trim() || undefined;
    if (tx.claimed) {
        // Allow idempotent re-check for the exact same orderId
        if (requestedOrderId && tx.claimed_order_id === requestedOrderId) {
            return {
                status: 200,
                body: {
                    paid: true,
                    orderId: requestedOrderId,
                    paymentId: requestedPaymentId,
                    trxId: key,
                    gateway: tx.gateway,
                    amountBdt: Number(tx.amount_bdt),
                    senderWallet: tx.sender_wallet,
                },
            };
        }
        return {
            status: 409,
            body: { paid: false, message: 'এই TrxID ইতিমধ্যে ব্যবহৃত হয়ে গেছে।' },
        };
    }
    const expectedAmount = Number(input.amountBdt ?? 0);
    const receivedAmount = Number(tx.amount_bdt ?? 0);
    if (Number.isFinite(expectedAmount) && expectedAmount > 0 && receivedAmount < expectedAmount) {
        return {
            status: 400,
            body: {
                paid: false,
                message: `পেমেন্টের পরিমাণ কম (প্রাপ্ত ৳${receivedAmount}, প্রয়োজন ৳${expectedAmount})।`,
            },
        };
    }
    tx.claimed = true;
    tx.claimed_order_id = requestedOrderId || null;
    tx.claimed_at = nowMs;
    return {
        status: 200,
        body: {
            paid: true,
            orderId: requestedOrderId,
            paymentId: requestedPaymentId,
            trxId: key,
            gateway: tx.gateway,
            amountBdt: receivedAmount,
            senderWallet: tx.sender_wallet,
        },
    };
}

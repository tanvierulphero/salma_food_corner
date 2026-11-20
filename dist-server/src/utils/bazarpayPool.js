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
export function createBazarPayPaymentSession(sessions, input, receiverNumbers = DEFAULT_BAZARPAY_RECEIVER_NUMBERS, nowMs = Date.now()) {
    const paymentId = `bp_pay_${nowMs}`;
    const amount = Number(input.amountBdt ?? 0);
    const gateway = String(input.gateway || 'BKASH').trim().toUpperCase() || 'BKASH';
    const orderId = String(input.orderId || `ORD-${nowMs}`).trim();
    const session = {
        paymentId,
        orderId,
        amountBdt: Number.isFinite(amount) ? amount : 0,
        customerName: String(input.customerName || 'Customer').trim() || 'Customer',
        gateway,
        status: 'PENDING',
        trxId: null,
        receiverNumbers: { ...receiverNumbers },
        createdAt: nowMs,
        paidAt: null,
    };
    sessions[paymentId] = session;
    return {
        paymentId,
        checkoutUrl: `/bazarpay/checkout/${paymentId}`,
        receiverNumbers: { ...receiverNumbers },
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
    pool[trxId] = {
        ...data,
        trx_id: trxId,
        amount_bdt: Number.isFinite(amount) ? amount : 0,
        gateway,
        sender_wallet: senderWallet,
        claimed: false,
        claimed_order_id: null,
        received_at: nowMs,
        claimed_at: null,
    };
    return { ok: true, trxId };
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

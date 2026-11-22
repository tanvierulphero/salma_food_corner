/**
 * Pure BazarPay webhook, payment session, and TrxID / Bangla QR (Solution 2) verification logic.
 * Used by server.ts and unit-tested with node:test.
 */
export const ALLOWED_BAZARPAY_GATEWAYS = [
    'BKASH',
    'NAGAD',
    'ROCKET',
    'BANGLA_QR',
];
export const DEFAULT_BAZARPAY_RECEIVER_NUMBERS = {
    BKASH: '01840684615',
    NAGAD: '01840684615',
    ROCKET: '01840684615',
    BANGLA_QR: '01840684615',
};
export function normalizeTrxId(raw) {
    return String(raw ?? '').trim().toUpperCase();
}
export function normalizeBazarPayGateway(raw) {
    const upper = String(raw ?? '').trim().toUpperCase();
    if (upper === 'BKASH' ||
        upper === 'NAGAD' ||
        upper === 'ROCKET' ||
        upper === 'BANGLA_QR') {
        return upper;
    }
    return null;
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
    const wallet = String(opts.receiverNumber || DEFAULT_BAZARPAY_RECEIVER_NUMBERS.BANGLA_QR).replace(/[^0-9+]/g, '') ||
        DEFAULT_BAZARPAY_RECEIVER_NUMBERS.BANGLA_QR;
    const amountNum = Number(opts.amountBdt ?? 0);
    const hasAmount = Number.isFinite(amountNum) && amountNum > 0;
    const merchantName = (opts.merchantName || 'Salma Food Corner').slice(0, 25);
    const merchantCity = (opts.merchantCity || 'Gazipur').slice(0, 15);
    const orderRef = String(opts.orderId || 'ORDER')
        .replace(/[^A-Za-z0-9-_]/g, '')
        .slice(0, 20) || 'ORDER';
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
    const rawGateway = typeof input.gateway === 'string' ? input.gateway.trim().toUpperCase() : '';
    const gateway = rawGateway || null;
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
        customerTrxId: null,
        matchMode: null,
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
export function updateBazarPaySessionGateway(sessions, paymentId, rawGateway) {
    const session = sessions[paymentId];
    if (!session) {
        return { ok: false, status: 404, error: 'Session not found' };
    }
    const str = String(rawGateway ?? '').trim();
    if (!str) {
        session.gateway = null;
        return { ok: true, gateway: null, session };
    }
    const normalized = normalizeBazarPayGateway(str);
    if (!normalized) {
        return { ok: false, status: 400, error: 'Invalid gateway' };
    }
    session.gateway = normalized;
    return { ok: true, gateway: normalized, session };
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
    if (opts.customerTrxId)
        target.customerTrxId = opts.customerTrxId;
    if (opts.gateway)
        target.gateway = opts.gateway;
    if (opts.matchMode)
        target.matchMode = opts.matchMode;
    target.paidAt = nowMs;
    return target;
}
export function storeIncomingBazarPayTx(pool, data, nowMs = Date.now()) {
    const trxId = normalizeTrxId(data.trx_id ?? data.trxId ?? data.transaction_id);
    if (!trxId) {
        return { ok: false, error: 'Missing trx_id in webhook payload' };
    }
    const existing = pool[trxId];
    // Never un-claim an already claimed TrxID if the webhook is re-delivered
    if (existing && existing.claimed) {
        return { ok: true, trxId };
    }
    const amount = Number(data.amount_bdt ?? data.amount ?? 0);
    const rawGateway = String(data.gateway ?? data.method ?? '').trim().toUpperCase();
    const gateway = rawGateway || 'BKASH';
    const senderWallet = data.sender_wallet !== undefined ? String(data.sender_wallet) : undefined;
    const accountMode = data.account_mode !== undefined ? String(data.account_mode) : undefined;
    const externalOrderId = data.external_order_id !== undefined
        ? String(data.external_order_id)
        : data.orderId !== undefined
            ? String(data.orderId)
            : undefined;
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
/** Solution 2: 15-minute Exact Amount + Time Window (works for Bangla QR cross-network payments) */
export const BANGLA_QR_WINDOW_MS = 15 * 60 * 1000;
export const AUTO_MATCH_WINDOW_MS = BANGLA_QR_WINDOW_MS;
function isExactAmount(a, b) {
    return Math.abs(Number(a) - Number(b)) < 0.01;
}
/**
 * Automatically matches a newly arrived unclaimed webhook transaction to a matching PENDING payment session:
 * (a) Exact external_order_id match against session.orderId or session.paymentId (within 15-min window)
 * (b) Exact Amount + 15-Minute Time Window:
 *     1) Exact gateway + exact amount
 *     2) Bangla QR / interoperable gateway (!s.gateway || s.gateway === 'BANGLA_QR' || incomingGateway === 'BANGLA_QR') + exact amount
 *     3) Any remaining pending session with exact amount
 */
export function autoMatchWebhookToPendingSession(pool, sessions, trxId, nowMs = Date.now()) {
    const key = normalizeTrxId(trxId);
    const tx = pool[key];
    if (!tx || tx.claimed)
        return null;
    const txAmount = Number(tx.amount_bdt ?? 0);
    if (!Number.isFinite(txAmount) || txAmount <= 0)
        return null;
    const incomingGateway = String(tx.gateway || '').trim().toUpperCase();
    const pendingList = Object.values(sessions)
        .filter((s) => {
        if (!s || s.status !== 'PENDING' || Number(s.amountBdt) <= 0)
            return false;
        const ageMs = nowMs - Number(s.createdAt ?? nowMs);
        return ageMs >= -60_000 && ageMs <= BANGLA_QR_WINDOW_MS;
    })
        .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
    if (pendingList.length === 0)
        return null;
    const extRef = String(tx.external_order_id || '').trim().toLowerCase();
    let matched;
    let matchMode = 'AMOUNT_TIME_WINDOW';
    if (extRef) {
        matched = pendingList.find((s) => (s.orderId.trim().toLowerCase() === extRef ||
            s.paymentId.trim().toLowerCase() === extRef) &&
            txAmount >= Number(s.amountBdt));
        if (matched)
            matchMode = 'ORDER_ID';
    }
    if (!matched) {
        matched =
            pendingList.find((s) => isExactAmount(s.amountBdt, txAmount) &&
                incomingGateway !== '' &&
                String(s.gateway || '').toUpperCase() === incomingGateway) ||
                pendingList.find((s) => {
                    const sgw = String(s.gateway || '').toUpperCase();
                    return (isExactAmount(s.amountBdt, txAmount) &&
                        (!sgw || sgw === 'BANGLA_QR' || incomingGateway === 'BANGLA_QR'));
                }) ||
                pendingList.find((s) => isExactAmount(s.amountBdt, txAmount));
    }
    if (!matched)
        return null;
    tx.claimed = true;
    tx.claimed_order_id = matched.orderId;
    tx.claimed_at = nowMs;
    matched.status = 'PAID';
    matched.trxId = key;
    matched.gateway = incomingGateway || matched.gateway || 'BANGLA_QR';
    matched.matchMode = matchMode;
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
        .filter((tx) => {
        if (!tx || tx.claimed || Number(tx.amount_bdt) <= 0)
            return false;
        const txTs = Number(tx.received_at ?? tx.timestamp_ms ?? nowMs);
        const ageMs = nowMs - txTs;
        return ageMs >= -60_000 && ageMs <= BANGLA_QR_WINDOW_MS;
    })
        .sort((a, b) => Number(b.received_at || b.timestamp_ms || 0) - Number(a.received_at || a.timestamp_ms || 0));
    const orderLower = session.orderId.trim().toLowerCase();
    const payLower = session.paymentId.trim().toLowerCase();
    const sessionGw = String(session.gateway || '').toUpperCase();
    let matchMode = 'AMOUNT_TIME_WINDOW';
    let matchedTx = unclaimed.find((tx) => {
        const ext = String(tx.external_order_id || '').trim().toLowerCase();
        return ext && (ext === orderLower || ext === payLower) && Number(tx.amount_bdt) >= expectedAmount;
    });
    if (matchedTx)
        matchMode = 'ORDER_ID';
    if (!matchedTx) {
        matchedTx =
            unclaimed.find((tx) => isExactAmount(tx.amount_bdt, expectedAmount) &&
                sessionGw !== '' &&
                String(tx.gateway || '').toUpperCase() === sessionGw) ||
                unclaimed.find((tx) => {
                    const tgw = String(tx.gateway || '').toUpperCase();
                    return (isExactAmount(tx.amount_bdt, expectedAmount) &&
                        (!sessionGw || sessionGw === 'BANGLA_QR' || tgw === 'BANGLA_QR'));
                }) ||
                unclaimed.find((tx) => isExactAmount(tx.amount_bdt, expectedAmount));
    }
    if (!matchedTx)
        return { session, newlyMatched: false };
    matchedTx.claimed = true;
    matchedTx.claimed_order_id = session.orderId;
    matchedTx.claimed_at = nowMs;
    session.status = 'PAID';
    session.trxId = matchedTx.trx_id;
    session.gateway = String(matchedTx.gateway || '').toUpperCase() || session.gateway || 'BANGLA_QR';
    session.matchMode = matchMode;
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
/**
 * Verifies & claims a payment via:
 * Step A: Direct TrxID match (bKash / Nagad / Rocket Personal Send Money)
 * Step B (Solution 2): Exact Amount + 15-min Time Window when gateway === 'BANGLA_QR' or TrxID/gateway omitted
 *         (handles Bangla QR where customer's bKash/Nagad TrxID differs from merchant Bank QR Ref!)
 */
export function verifyAndClaimBazarPayTx(pool, input, nowMs = Date.now()) {
    const cleanTrx = normalizeTrxId(input.trxId);
    const targetAmt = Number(input.amountBdt ?? 0);
    const gw = String(input.gateway || '').trim().toUpperCase();
    const requestedOrderId = String(input.orderId || '').trim();
    const requestedPaymentId = String(input.paymentId || '').trim() || undefined;
    if (!cleanTrx && !(Number.isFinite(targetAmt) && targetAmt > 0)) {
        const msg = 'TrxID প্রদান করুন।';
        return {
            status: 400,
            body: { ok: false, paid: false, error: msg, message: msg },
        };
    }
    // Step A: Direct TrxID match
    let found = cleanTrx ? pool[cleanTrx] : undefined;
    let matchMode = 'TRX_ID';
    // Step B (Solution 2): Bangla QR Exact Amount + 15-Minute Time Window fallback
    if (!found &&
        Number.isFinite(targetAmt) &&
        targetAmt > 0 &&
        (gw === 'BANGLA_QR' || !cleanTrx)) {
        const candidates = Object.values(pool)
            .filter((tx) => {
            if (!tx || tx.claimed)
                return false;
            if (!isExactAmount(tx.amount_bdt, targetAmt))
                return false;
            const txTs = Number(tx.received_at ?? tx.timestamp_ms ?? nowMs);
            const ageMs = nowMs - txTs;
            return ageMs >= -60_000 && ageMs <= BANGLA_QR_WINDOW_MS;
        })
            .sort((a, b) => {
            const aIsQr = String(a.gateway || '').toUpperCase() === 'BANGLA_QR' ? 0 : 1;
            const bIsQr = String(b.gateway || '').toUpperCase() === 'BANGLA_QR' ? 0 : 1;
            if (aIsQr !== bIsQr)
                return aIsQr - bIsQr;
            return Number(b.received_at || b.timestamp_ms || 0) - Number(a.received_at || a.timestamp_ms || 0);
        });
        if (candidates.length > 0) {
            found = candidates[0];
            matchMode = 'AMOUNT_TIME_WINDOW';
        }
    }
    if (!found) {
        const msg = 'পেমেন্ট এখনো পাওয়া যায়নি। কয়েক সেকেন্ড পর আবার চেষ্টা করুন।';
        return {
            status: 404,
            body: { ok: false, paid: false, error: msg, message: msg },
        };
    }
    if (found.claimed) {
        // Allow idempotent re-check for the exact same orderId
        if (requestedOrderId && found.claimed_order_id === requestedOrderId) {
            const amt = Number(found.amount_bdt);
            const custTrx = found.customerTrxId || cleanTrx || found.trx_id;
            return {
                status: 200,
                body: {
                    ok: true,
                    paid: true,
                    autoVerified: true,
                    matchMode,
                    orderId: requestedOrderId,
                    paymentId: requestedPaymentId,
                    trxId: found.trx_id,
                    trx_id: found.trx_id,
                    customerTrxId: custTrx,
                    gateway: found.gateway,
                    amountBdt: amt,
                    amount_bdt: amt,
                    senderWallet: found.sender_wallet,
                },
            };
        }
        const msg = 'এই পেমেন্টটি ইতিমধ্যে অন্য অর্ডারে ব্যবহৃত হয়েছে।';
        return {
            status: 409,
            body: { ok: false, paid: false, error: msg, message: msg },
        };
    }
    const receivedAmount = Number(found.amount_bdt ?? 0);
    if (Number.isFinite(targetAmt) && targetAmt > 0 && receivedAmount < targetAmt) {
        const msg = `পেমেন্টের পরিমাণ কম (প্রাপ্ত ৳${receivedAmount}, প্রয়োজন ৳${targetAmt})।`;
        return {
            status: 400,
            body: { ok: false, paid: false, error: msg, message: msg },
        };
    }
    const finalOrderId = requestedOrderId || requestedPaymentId || `ORD-${nowMs}`;
    const customerTrxId = cleanTrx || found.trx_id;
    found.claimed = true;
    found.claimed_order_id = finalOrderId;
    found.customerTrxId = customerTrxId;
    found.claimed_at = nowMs;
    return {
        status: 200,
        body: {
            ok: true,
            paid: true,
            autoVerified: true,
            matchMode,
            orderId: finalOrderId,
            paymentId: requestedPaymentId,
            trxId: found.trx_id,
            trx_id: found.trx_id,
            customerTrxId,
            gateway: found.gateway,
            amountBdt: receivedAmount,
            amount_bdt: receivedAmount,
            senderWallet: found.sender_wallet,
        },
    };
}

/**
 * Client-side helpers for BazarPay self-hosted payment sessions & TrxID verification.
 * Works on both Node.js (/api/bazarpay/*) and cPanel PHP (api.php?action=bazarpay_*).
 */

import {
  DEFAULT_BAZARPAY_RECEIVER_NUMBERS,
  type BazarPayPaymentSession,
  type BazarPayReceiverNumbers,
} from './bazarpayPool';

export type { BazarPayPaymentSession, BazarPayReceiverNumbers };
export { DEFAULT_BAZARPAY_RECEIVER_NUMBERS };

export interface BazarPayCreatePaymentResponse {
  ok: boolean;
  paymentId?: string;
  checkoutUrl?: string;
  receiverNumbers?: BazarPayReceiverNumbers;
  session?: BazarPayPaymentSession;
  error?: string;
}

export interface BazarPayGetPaymentResponse {
  ok: boolean;
  paid?: boolean;
  session?: BazarPayPaymentSession;
  error?: string;
}

export interface BazarPayClientVerifyResponse {
  paid: boolean;
  orderId?: string;
  paymentId?: string;
  trxId?: string;
  gateway?: string;
  amountBdt?: number;
  senderWallet?: string;
  message?: string;
}

function getApiPhpUrl(action: string, extraQuery: string = ''): string {
  const prefix =
    typeof window !== 'undefined' &&
    (window.location.pathname === '/admin' ||
      window.location.pathname.startsWith('/admin/') ||
      window.location.pathname.startsWith('/bazarpay/'))
      ? '/api.php'
      : './api.php';
  const sep = extraQuery ? `&${extraQuery}` : '';
  return `${prefix}?action=${action}${sep}&_t=${Date.now()}`;
}

async function fetchJsonSafe<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        'Accept': 'application/json',
        ...(init?.headers || {}),
      },
      cache: 'no-store',
    });
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function createBazarPayPayment(params: {
  orderId: string;
  amountBdt: number;
  customerName?: string;
  gateway?: string;
}): Promise<BazarPayCreatePaymentResponse> {
  const body = JSON.stringify({
    orderId: params.orderId,
    amountBdt: params.amountBdt,
    customerName: params.customerName || 'Customer',
    gateway: params.gateway || 'BKASH',
  });
  const init: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  };

  const primary = await fetchJsonSafe<BazarPayCreatePaymentResponse>('/api/bazarpay/create-payment', init);
  if (primary && typeof primary.ok === 'boolean') return primary;

  const fallback = await fetchJsonSafe<BazarPayCreatePaymentResponse>(getApiPhpUrl('bazarpay_create'), init);
  if (fallback && typeof fallback.ok === 'boolean') return fallback;

  return {
    ok: false,
    receiverNumbers: DEFAULT_BAZARPAY_RECEIVER_NUMBERS,
    error: 'পেমেন্ট সেশন তৈরি করা যায়নি।',
  };
}

export async function getBazarPayPayment(paymentId: string): Promise<BazarPayGetPaymentResponse> {
  const safeId = encodeURIComponent(paymentId.trim());
  const primary = await fetchJsonSafe<BazarPayGetPaymentResponse>(`/api/bazarpay/payment/${safeId}`);
  if (primary && typeof primary.ok === 'boolean') return primary;

  const fallback = await fetchJsonSafe<BazarPayGetPaymentResponse>(
    getApiPhpUrl('bazarpay_payment', `paymentId=${safeId}`)
  );
  if (fallback && typeof fallback.ok === 'boolean') return fallback;

  return { ok: false, error: 'পেমেন্ট সেশন পাওয়া যায়নি।' };
}

export async function verifyBazarPayOrder(params: {
  orderId: string;
  paymentId?: string;
  trxId: string;
  amountBdt: number;
}): Promise<BazarPayClientVerifyResponse> {
  const body = JSON.stringify({
    orderId: params.orderId,
    paymentId: params.paymentId,
    trxId: params.trxId.trim().toUpperCase(),
    amountBdt: params.amountBdt,
  });
  const init: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  };

  const primary = await fetchJsonSafe<BazarPayClientVerifyResponse>('/api/bazarpay/verify-order', init);
  if (primary && typeof primary.paid === 'boolean') return primary;

  const fallback = await fetchJsonSafe<BazarPayClientVerifyResponse>(getApiPhpUrl('bazarpay_verify'), init);
  if (fallback && typeof fallback.paid === 'boolean') return fallback;

  return {
    paid: false,
    message: 'পেমেন্ট সার্ভারের সাথে সংযোগ করা যায়নি। একটু পর আবার চেষ্টা করুন।',
  };
}

/**
 * Client-side helper to verify customer TrxID against the BazarPay backend.
 * Works on both Node.js (/api/bazarpay/verify-order) and cPanel PHP (api.php?action=bazarpay_verify).
 */

export interface BazarPayClientVerifyResponse {
  paid: boolean;
  orderId?: string;
  trxId?: string;
  gateway?: string;
  amountBdt?: number;
  senderWallet?: string;
  message?: string;
}

function getApiPhpVerifyUrl(): string {
  if (typeof window !== 'undefined') {
    const pathname = window.location.pathname || '/';
    if (pathname === '/admin' || pathname.startsWith('/admin/')) {
      return `../api.php?action=bazarpay_verify&_t=${Date.now()}`;
    }
  }
  return `./api.php?action=bazarpay_verify&_t=${Date.now()}`;
}

async function postVerifyJson(url: string, body: string): Promise<BazarPayClientVerifyResponse | null> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body,
      cache: 'no-store',
    });

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return null;
    }

    const json = await res.json();
    if (json && typeof json.paid === 'boolean') {
      return json as BazarPayClientVerifyResponse;
    }
    return null;
  } catch {
    return null;
  }
}

export async function verifyBazarPayOrder(params: {
  orderId: string;
  trxId: string;
  amountBdt: number;
}): Promise<BazarPayClientVerifyResponse> {
  const payload = JSON.stringify({
    orderId: params.orderId,
    trxId: params.trxId.trim().toUpperCase(),
    amountBdt: params.amountBdt,
  });

  // 1) Primary route (Node.js Express & cPanel .htaccess rewrite)
  const primary = await postVerifyJson('/api/bazarpay/verify-order', payload);
  if (primary) return primary;

  // 2) Direct cPanel PHP fallback (if mod_rewrite is unavailable)
  const fallback = await postVerifyJson(getApiPhpVerifyUrl(), payload);
  if (fallback) return fallback;

  return {
    paid: false,
    message: 'পেমেন্ট সার্ভারের সাথে সংযোগ করা যায়নি। একটু পর আবার চেষ্টা করুন।',
  };
}

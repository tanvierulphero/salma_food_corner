import {
  DEFAULT_BAZARPAY_RECEIVER_NUMBERS,
  type BazarPayReceiverNumbers,
} from './bazarpayPool';

export const BAZARPAY_SETTINGS_KEY = 'salma_bazarpay_settings';
export const DEFAULT_OFFICIAL_BANGLA_QR_IMAGE_URL =
  'https://i.ibb.co.com/pBp92Fs9/QR-only.png';

export interface BazarPaySettings {
  banglaQrImageUrl: string;
  banglaQrPayload: string;
  receiverNumbers: BazarPayReceiverNumbers;
}

export const DEFAULT_BAZARPAY_SETTINGS: BazarPaySettings = {
  banglaQrImageUrl: DEFAULT_OFFICIAL_BANGLA_QR_IMAGE_URL,
  banglaQrPayload: '',
  receiverNumbers: { ...DEFAULT_BAZARPAY_RECEIVER_NUMBERS },
};

export function isSafeQrImageUrl(url: unknown): boolean {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (/^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=\s]+$/i.test(trimmed)) {
    return true;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return true;
  }
  if (/^\/?(uploads\/|\.?\/?uploads\/)[A-Za-z0-9._\-/]+$/i.test(trimmed) && !trimmed.includes('..')) {
    return true;
  }
  return false;
}

export function resolveBanglaQrImageUrl(
  qrImageUrl?: string,
  _qrPayloadOverride?: string
): string {
  const cleanImg = typeof qrImageUrl === 'string' ? qrImageUrl.trim() : '';
  if (isSafeQrImageUrl(cleanImg)) {
    return cleanImg.startsWith('uploads/') ? `/${cleanImg}` : cleanImg;
  }
  return DEFAULT_OFFICIAL_BANGLA_QR_IMAGE_URL;
}

export function normalizeBazarPaySettings(raw: unknown): BazarPaySettings {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const rawNums =
    obj.receiverNumbers && typeof obj.receiverNumbers === 'object'
      ? (obj.receiverNumbers as Record<string, unknown>)
      : {};

  const pickNum = (key: keyof BazarPayReceiverNumbers): string => {
    const v = rawNums[key];
    const clean = typeof v === 'string' ? v.trim() : '';
    return clean || DEFAULT_BAZARPAY_RECEIVER_NUMBERS[key];
  };

  const rawImg = typeof obj.banglaQrImageUrl === 'string' ? obj.banglaQrImageUrl.trim() : '';
  const rawPayload = typeof obj.banglaQrPayload === 'string' ? obj.banglaQrPayload.trim() : '';

  return {
    banglaQrImageUrl: isSafeQrImageUrl(rawImg) ? rawImg : '',
    banglaQrPayload: rawPayload,
    receiverNumbers: {
      BKASH: pickNum('BKASH'),
      NAGAD: pickNum('NAGAD'),
      ROCKET: pickNum('ROCKET'),
      BANGLA_QR: pickNum('BANGLA_QR'),
    },
  };
}

export function loadBazarPaySettings(): BazarPaySettings {
  if (typeof window === 'undefined') {
    return {
      ...DEFAULT_BAZARPAY_SETTINGS,
      receiverNumbers: { ...DEFAULT_BAZARPAY_RECEIVER_NUMBERS },
    };
  }
  try {
    const raw = window.localStorage.getItem(BAZARPAY_SETTINGS_KEY);
    if (!raw) {
      return {
        ...DEFAULT_BAZARPAY_SETTINGS,
        receiverNumbers: { ...DEFAULT_BAZARPAY_RECEIVER_NUMBERS },
      };
    }
    return normalizeBazarPaySettings(JSON.parse(raw));
  } catch {
    return {
      ...DEFAULT_BAZARPAY_SETTINGS,
      receiverNumbers: { ...DEFAULT_BAZARPAY_RECEIVER_NUMBERS },
    };
  }
}

export function saveBazarPaySettings(input: Partial<BazarPaySettings>): BazarPaySettings {
  const normalized = normalizeBazarPaySettings(input);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(BAZARPAY_SETTINGS_KEY, JSON.stringify(normalized));
    } catch {
      // Ignore quota errors
    }
  }
  return normalized;
}

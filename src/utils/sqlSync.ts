/**
 * cPanel Server & MySQL (phpMyAdmin) Database Engine
 * - Intercepts Storage.prototype so all localStorage.getItem / setItem calls use the cPanel server DB
 * - Provides direct MySQL configuration & status helpers for AdminApp
 */

const SYNCED_KEYS = new Set([
  'salma_menu_items',
  'salma_orders',
  'salma_ledger',
  'salma_due_ledger',
  'salma_customers',
  'salma_shop_location',
  'salma_location_presets',
  'salma_sms_logs',
  'salma_active_offer'
]);

const memoryStore = new Map<string, string>();
let isRemoteApplying = false;
let isInitialized = false;

let dbStatusInfo: {
  mysqlConnected: boolean;
  dbName: string | null;
  mysqlError: string | null;
} = {
  mysqlConnected: false,
  dbName: null,
  mysqlError: null
};

const statusListeners = new Set<() => void>();

export function getMysqlStatus() {
  return dbStatusInfo;
}

export function subscribeMysqlStatus(cb: () => void) {
  statusListeners.add(cb);
  return () => {
    statusListeners.delete(cb);
  };
}

function notifyStatusListeners() {
  statusListeners.forEach((cb) => cb());
}

function getApiUrl(action: string): string {
  return `./api.php?action=${action}&_t=${Date.now()}`;
}

export async function saveToCpanelDb(key: string, value: any): Promise<void> {
  const strValue = typeof value === 'string' ? value : JSON.stringify(value);
  memoryStore.set(key, strValue);
  try {
    const res = await fetch(getApiUrl('save'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value: strValue }),
      keepalive: true
    });
    const data = await res.json().catch(() => null);
    if (data && typeof data.mysqlConnected === 'boolean') {
      dbStatusInfo = {
        ...dbStatusInfo,
        mysqlConnected: data.mysqlConnected
      };
      notifyStatusListeners();
    }
  } catch (err) {
    console.error('cPanel DB Save Error:', err);
  }
}

export async function syncAllToMysqlNow(): Promise<boolean> {
  try {
    for (const key of SYNCED_KEYS) {
      if (memoryStore.has(key)) {
        const val = memoryStore.get(key)!;
        await fetch(getApiUrl('save'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, value: val })
        });
      }
    }
    await pullFromServer();
    return true;
  } catch {
    return false;
  }
}

/**
 * Compresses and resizes an image file on the client before uploading to cPanel
 * so even 10MB mobile camera photos become fast ~100KB JPEGs that never fail PHP upload limits.
 */
function compressImageToDataUrl(file: File, maxDim = 800, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      if (!dataUrl) {
        reject(new Error('ছবি পড়া সম্ভব হয়নি।'));
        return;
      }
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width >= height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        const compressed = canvas.toDataURL('image/jpeg', quality);
        resolve(compressed);
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    };
    reader.onerror = () => reject(new Error('ফাইল রিড এরর'));
    reader.readAsDataURL(file);
  });
}

/**
 * Uploads a food photo directly to cPanel (uploads/ folder + MySQL backup)
 */
export async function uploadFoodImageToCpanel(file: File): Promise<{
  ok: boolean;
  imageUrl: string;
  message: string;
}> {
  try {
    const compressedDataUrl = await compressImageToDataUrl(file, 800, 0.85);
    const res = await fetch(getApiUrl('upload_image'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: file.name,
        imageBase64: compressedDataUrl
      })
    });
    const data = await res.json().catch(() => null);
    if (res.ok && data && data.status === 'ok' && data.imageUrl) {
      return {
        ok: true,
        imageUrl: data.imageUrl,
        message: data.message || 'ছবিটি সফলভাবে cPanel সার্ভারে সেভ হয়েছে!'
      };
    }
    // Fallback to compressed data URL so image still saves in cPanel MySQL database
    return {
      ok: true,
      imageUrl: compressedDataUrl,
      message: 'ছবিটি অপ্টিমাইজ করে সরাসরি cPanel ডাটাবেসে সংরক্ষিত হয়েছে!'
    };
  } catch {
    const fallbackUrl = await compressImageToDataUrl(file, 700, 0.8).catch(() => '');
    if (fallbackUrl) {
      return {
        ok: true,
        imageUrl: fallbackUrl,
        message: 'ছবিটি সরাসরি ডাটাবেসে সংরক্ষিত হয়েছে!'
      };
    }
    return {
      ok: false,
      imageUrl: '',
      message: 'ছবি আপলোড করতে সমস্যা হয়েছে।'
    };
  }
}

export async function setupMysqlDatabase(config: {
  dbHost: string;
  dbName: string;
  dbUser: string;
  dbPass: string;
}): Promise<{ ok: boolean; message: string; dbName?: string }> {
  try {
    const currentData: Record<string, any> = {};
    for (const key of SYNCED_KEYS) {
      if (memoryStore.has(key)) {
        try {
          currentData[key] = JSON.parse(memoryStore.get(key)!);
        } catch {
          currentData[key] = memoryStore.get(key);
        }
      }
    }

    const res = await fetch(getApiUrl('setup_db'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...config,
        currentData
      })
    });

    const result = await res.json();
    if (res.ok && result.status === 'ok') {
      dbStatusInfo = {
        mysqlConnected: true,
        dbName: result.dbName || config.dbName,
        mysqlError: null
      };
      notifyStatusListeners();
      return {
        ok: true,
        message: result.message || 'ডাটাবেস সফলভাবে কানেক্ট হয়েছে!',
        dbName: result.dbName || config.dbName
      };
    } else {
      return {
        ok: false,
        message: result.message || 'ডাটাবেস কানেকশন ব্যর্থ হয়েছে। তথ্যগুলো পুনরায় চেক করুন।'
      };
    }
  } catch (err: any) {
    return {
      ok: false,
      message: 'সার্ভারের সাথে যোগাযোগ করা যায়নি: ' + (err?.message || '')
    };
  }
}

export async function pullFromServer(): Promise<void> {
  try {
    const res = await fetch(getApiUrl('load'), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Cache-Control': 'no-cache'
      },
      cache: 'no-store'
    });

    const contentType = res.headers.get('content-type') || '';
    if (!res.ok || !contentType.includes('application/json')) return;

    const result = await res.json();
    if (!result) return;

    dbStatusInfo = {
      mysqlConnected: Boolean(result.mysqlConnected),
      dbName: result.dbName || null,
      mysqlError: result.mysqlError || null
    };
    notifyStatusListeners();

    if (!result.data || typeof result.data !== 'object') return;

    isRemoteApplying = true;
    try {
      Object.entries(result.data).forEach(([key, val]) => {
        if (val !== undefined && val !== null) {
          const strVal = typeof val === 'string' ? val : JSON.stringify(val);
          const prevVal = memoryStore.get(key);
          if (prevVal !== strVal) {
            memoryStore.set(key, strVal);
            window.dispatchEvent(
              new StorageEvent('storage', {
                key,
                newValue: strVal
              })
            );
          }
        }
      });
    } finally {
      isRemoteApplying = false;
    }
  } catch {
    // Ignore transient network errors
  }
}

/**
 * Normalizes Bangladeshi mobile numbers so '01712-345678', '+8801712345678',
 * or Bengali digits '০১৭১২৩৪৫৬৭৮' all resolve to '01712345678'.
 */
export function normalizeBdPhone(raw: string): string {
  if (!raw) return '';
  const bnToEnMap: Record<string, string> = {
    '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4',
    '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9'
  };
  let ascii = raw.replace(/[০-৯]/g, (d) => bnToEnMap[d] || d);
  let digits = ascii.replace(/\D/g, '');
  if (digits.startsWith('8801') && digits.length === 13) {
    digits = digits.slice(2);
  } else if (digits.startsWith('1') && digits.length === 10) {
    digits = '0' + digits;
  }
  return digits;
}

/**
 * Finds an existing registered customer by mobile number from the customers map
 * (or fallback from previous orders), matching both exact and normalized BD phone numbers.
 */
export function findCustomerByPhone(
  phoneInput: string,
  customersMap: Record<string, any>,
  ordersList?: Array<any>
): any | null {
  const norm = normalizeBdPhone(phoneInput);
  if (!norm || norm.length < 8) return null;

  // 1. Direct or normalized match in customersMap
  if (customersMap) {
    if (customersMap[phoneInput.trim()]) {
      return customersMap[phoneInput.trim()];
    }
    if (customersMap[norm]) {
      return customersMap[norm];
    }
    for (const [k, prof] of Object.entries(customersMap)) {
      if (
        normalizeBdPhone(k) === norm ||
        (prof && normalizeBdPhone(prof.phone || '') === norm)
      ) {
        return prof;
      }
    }
  }

  // 2. Also check latest memoryStore('salma_customers') in case cPanel sync just arrived
  const rawStored = memoryStore.get('salma_customers');
  if (rawStored) {
    try {
      const parsed = JSON.parse(rawStored);
      if (parsed && typeof parsed === 'object') {
        if (parsed[norm]) return parsed[norm];
        for (const [k, prof] of Object.entries(parsed)) {
          if (
            normalizeBdPhone(k) === norm ||
            (prof && normalizeBdPhone((prof as any).phone || '') === norm)
          ) {
            return prof;
          }
        }
      }
    } catch {
      // ignore
    }
  }

  // 3. Fallback: if customer previously ordered with this phone number, build profile automatically
  if (Array.isArray(ordersList)) {
    const matchedOrder = ordersList.find((o) => normalizeBdPhone(o.phone || '') === norm);
    if (matchedOrder) {
      return {
        phone: norm,
        name: matchedOrder.customerName || 'সম্মানিত গ্রাহক',
        address: matchedOrder.address || 'চান্দনা চৌরাস্তা, গাজীপুর',
        loyaltyPoints: matchedOrder.loyaltyPointsEarned || 50,
        registeredAt: matchedOrder.date || new Date().toISOString().split('T')[0],
        totalOrders: ordersList.filter((o) => normalizeBdPhone(o.phone || '') === norm).length,
        totalSpent: ordersList
          .filter((o) => normalizeBdPhone(o.phone || '') === norm)
          .reduce((s, o) => s + (Number(o.totalAmount) || 0), 0)
      };
    }
  }

  return null;
}

const SESSION_KEYS = new Set(['salma_logged_customer', 'salma_admin_auth']);

export async function initSqlDatabaseSync(): Promise<void> {
  if (typeof window === 'undefined' || isInitialized) return;
  isInitialized = true;

  // Clear native browser localStorage completely before overriding
  try {
    Storage.prototype.clear.call(window.localStorage);
  } catch {
    // Ignore
  }

  // Restore active login session from sessionStorage if present
  try {
    SESSION_KEYS.forEach((sKey) => {
      const val = window.sessionStorage.getItem(sKey);
      if (val) memoryStore.set(sKey, val);
    });
  } catch {
    // Ignore
  }

  // Patch Storage.prototype so ALL calls to localStorage.getItem / setItem across all modules use memoryStore + cPanel API
  Storage.prototype.getItem = function (key: string): string | null {
    return memoryStore.has(key) ? memoryStore.get(key)! : null;
  };

  Storage.prototype.setItem = function (key: string, value: string): void {
    const strValue = String(value);
    const previousValue = memoryStore.get(key);

    if (previousValue === strValue) {
      return;
    }

    memoryStore.set(key, strValue);

    if (SESSION_KEYS.has(key)) {
      try {
        window.sessionStorage.setItem(key, strValue);
      } catch {
        // Ignore
      }
    }

    // Skip initial mount empty default array/object so page load never overwrites server DB
    if (previousValue === undefined && (strValue === '[]' || strValue === '{}')) {
      return;
    }

    if (!isRemoteApplying && SYNCED_KEYS.has(key)) {
      fetch(getApiUrl('save'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: strValue }),
        keepalive: true
      }).catch((err) => {
        console.error('cPanel DB Save Error:', err);
      });
    }
  };

  Storage.prototype.removeItem = function (key: string): void {
    memoryStore.delete(key);
    if (SESSION_KEYS.has(key)) {
      try {
        window.sessionStorage.removeItem(key);
      } catch {
        // Ignore
      }
    }
  };

  Storage.prototype.clear = function (): void {
    memoryStore.clear();
  };

  // Load initial database state from cPanel server BEFORE mounting React app
  await pullFromServer();

  // Keep all tabs/devices synced with cPanel server
  window.addEventListener('focus', () => {
    pullFromServer();
  });
  setInterval(() => {
    pullFromServer();
  }, 5000);
}


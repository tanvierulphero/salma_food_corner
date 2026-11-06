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

export async function initSqlDatabaseSync(): Promise<void> {
  if (typeof window === 'undefined' || isInitialized) return;
  isInitialized = true;

  // Clear native browser localStorage completely before overriding
  try {
    Storage.prototype.clear.call(window.localStorage);
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

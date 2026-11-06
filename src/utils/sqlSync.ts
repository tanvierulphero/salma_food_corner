/**
 * cPanel Server & MySQL Database Engine (Zero Browser LocalStorage)
 * All application state is loaded from and saved directly to ./api.php on the cPanel server.
 * Browser localStorage is completely bypassed and cleared.
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

function getApiUrl(action: string): string {
  return `./api.php?action=${action}&_t=${Date.now()}`;
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
    if (!result || !result.data || typeof result.data !== 'object') return;

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
    // Silent fallback if network temporarily unreachable
  }
}

export async function initSqlDatabaseSync(): Promise<void> {
  if (typeof window === 'undefined' || isInitialized) return;
  isInitialized = true;

  // Clear any old browser localStorage so local storage is not used
  try {
    window.localStorage.clear();
  } catch {
    // Ignore
  }

  // Override Storage prototype / localStorage methods to use our in-memory cPanel Server Store
  const customGetItem = (key: string): string | null => {
    return memoryStore.has(key) ? memoryStore.get(key)! : null;
  };

  const customSetItem = (key: string, value: string): void => {
    const strValue = String(value);
    const previousValue = memoryStore.get(key);

    // Do not re-save if the value hasn't actually changed
    if (previousValue === strValue) {
      return;
    }

    memoryStore.set(key, strValue);

    // If this is the initial component mount setting a default empty array/object, do not overwrite server
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

  const customRemoveItem = (key: string): void => {
    memoryStore.delete(key);
  };

  const customClear = (): void => {
    memoryStore.clear();
  };

  try {
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: customGetItem,
        setItem: customSetItem,
        removeItem: customRemoveItem,
        clear: customClear,
        key: (index: number) => Array.from(memoryStore.keys())[index] ?? null,
        get length() {
          return memoryStore.size;
        }
      },
      configurable: true,
      writable: true
    });
  } catch {
    window.localStorage.getItem = customGetItem;
    window.localStorage.setItem = customSetItem;
    window.localStorage.removeItem = customRemoveItem;
    window.localStorage.clear = customClear;
  }

  // Load initial database state from cPanel server BEFORE mounting React app
  await pullFromServer();

  // Keep all tabs/devices in sync with cPanel server every 5 seconds and on window focus
  window.addEventListener('focus', () => {
    pullFromServer();
  });
  setInterval(() => {
    pullFromServer();
  }, 5000);
}

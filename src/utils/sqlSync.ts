/**
 * Automatic cPanel MySQL Database Sync Bridge
 * Syncs Salma Food Corner state with /api.php (MySQL) when hosted on cPanel,
 * while keeping localStorage intact for instant offline/preview responsiveness.
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

let isRemoteApplying = false;

export function initSqlDatabaseSync() {
  if (typeof window === 'undefined') return;

  const originalSetItem = window.localStorage.setItem.bind(window.localStorage);

  // Override localStorage.setItem to push updates to cPanel MySQL (/api.php)
  window.localStorage.setItem = (key: string, value: string) => {
    originalSetItem(key, value);

    if (!isRemoteApplying && SYNCED_KEYS.has(key)) {
      fetch('/api.php?action=save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value })
      }).catch(() => {
        // Silent fallback when running in local preview without PHP
      });
    }
  };

  // Initial pull from cPanel MySQL (/api.php?action=load)
  fetch('/api.php?action=load', {
    method: 'GET',
    headers: { 'Accept': 'application/json' }
  })
    .then(async (res) => {
      const contentType = res.headers.get('content-type') || '';
      if (!res.ok || !contentType.includes('application/json')) return null;
      return res.json();
    })
    .then((result) => {
      if (!result || !result.connected || !result.data) return;

      isRemoteApplying = true;
      try {
        Object.entries(result.data).forEach(([key, val]) => {
          if (SYNCED_KEYS.has(key) && val !== undefined && val !== null) {
            const strVal = typeof val === 'string' ? val : JSON.stringify(val);
            const currentVal = window.localStorage.getItem(key);
            if (currentVal !== strVal) {
              originalSetItem(key, strVal);
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
    })
    .catch(() => {
      // Running in local/preview environment without PHP backend
    });
}

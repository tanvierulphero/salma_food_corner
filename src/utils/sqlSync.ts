/**
 * cPanel Server & MySQL (phpMyAdmin) Database Engine
 * - Intercepts Storage.prototype so all localStorage.getItem / setItem calls use the cPanel server DB
 * - Keeps native localStorage as an instant local backup so data is never lost
 * - Protects in-flight & recent saves from being overwritten by background polling
 */

import {
  countSerializedRecords,
  isNonEmptySerializedValue,
  parseBackupPayload,
  resolveServerPullAction
} from './syncReconcile';

export const SYNCED_KEYS = new Set([
  'salma_menu_items',
  'salma_orders',
  'salma_ledger',
  'salma_due_ledger',
  'salma_customers',
  'salma_shop_location',
  'salma_location_presets',
  'salma_sms_logs',
  'salma_active_offer',
  'salma_menu_categories',
  'salma_bazarpay_settings'
]);

const SYNC_META_STORAGE_KEY = 'salma_sync_meta_ts';
const AUTO_BACKUP_STORAGE_KEY = 'salma_auto_backup_v1';

const SESSION_KEYS = new Set(['salma_logged_customer', 'salma_admin_auth']);

const memoryStore = new Map<string, string>();
let syncMetaMap: Record<string, number> = {};
let isRemoteApplying = false;
let isInternalDispatching = false;
let isInitialized = false;
let syncBootDoneAt = 0;

// Native browser storage references (kept before patching Storage.prototype)
let nativeGetItem: ((key: string) => string | null) | null = null;
let nativeSetItem: ((key: string, val: string) => void) | null = null;
let nativeRemoveItem: ((key: string) => void) | null = null;

// Track in-flight POST saves and recent local save timestamps to prevent pullFromServer race conditions
const inFlightSaves = new Map<string, number>();
const lastLocalSaveTime = new Map<string, number>();
const lastSentPayload = new Map<string, string>();
let lastGlobalSaveTime = 0;

function readNativeRaw(key: string): string | null {
  try {
    if (nativeGetItem) return nativeGetItem(key);
    if (typeof window !== 'undefined') return window.localStorage.getItem(key);
  } catch {
    // Ignore
  }
  return null;
}

function writeNativeRaw(key: string, value: string): void {
  try {
    if (nativeSetItem) {
      nativeSetItem(key, value);
    } else if (typeof window !== 'undefined') {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // Ignore quota errors
  }
}

function persistSyncMeta(key: string, ts: number): void {
  if (!ts || !Number.isFinite(ts)) return;
  syncMetaMap[key] = ts;
  writeNativeRaw(SYNC_META_STORAGE_KEY, JSON.stringify(syncMetaMap));
}

function capturePreOverwriteAutoBackup(key: string, prevSerialized: string | undefined | null): void {
  if (!SYNCED_KEYS.has(key) || !prevSerialized || !isNonEmptySerializedValue(prevSerialized)) {
    return;
  }
  try {
    const raw = readNativeRaw(AUTO_BACKUP_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const existingKeys: Record<string, string> =
      parsed && typeof parsed === 'object' && parsed.keys && typeof parsed.keys === 'object'
        ? { ...parsed.keys }
        : {};
    existingKeys[key] = prevSerialized;
    writeNativeRaw(
      AUTO_BACKUP_STORAGE_KEY,
      JSON.stringify({
        savedAt: new Date().toISOString(),
        keys: existingKeys
      })
    );
  } catch {
    // Ignore backup errors
  }
}

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
  if (typeof window !== 'undefined') {
    const path = window.location.pathname || '/';
    // If URL is /admin/ with trailing slash, step up one level so we always hit root api.php
    if (/\/admin\/$/i.test(path)) {
      return `../api.php?action=${action}&_t=${Date.now()}`;
    }
    if (/^\/(bazarpay|checkout)(\/|$)/i.test(path)) {
      return `/api.php?action=${action}&_t=${Date.now()}`;
    }
  }
  return `./api.php?action=${action}&_t=${Date.now()}`;
}

function persistToNativeStorage(key: string, strValue: string) {
  try {
    if (nativeSetItem) {
      nativeSetItem(key, strValue);
    }
    if (SESSION_KEYS.has(key) && typeof window !== 'undefined') {
      window.sessionStorage.setItem(key, strValue);
    }
  } catch {
    // Ignore storage quota errors
  }
}

function dispatchLocalSyncEvent(key: string, strValue: string) {
  if (typeof window === 'undefined' || isInternalDispatching) return;
  isInternalDispatching = true;
  try {
    window.dispatchEvent(
      new StorageEvent('storage', {
        key,
        newValue: strValue
      })
    );
  } catch {
    // Ignore
  } finally {
    isInternalDispatching = false;
  }
}

async function sendSaveRequest(key: string, strValue: string, force = false): Promise<boolean> {
  if (!force && lastSentPayload.get(key) === strValue && (inFlightSaves.get(key) || 0) > 0) {
    return true;
  }

  lastSentPayload.set(key, strValue);
  lastLocalSaveTime.set(key, Date.now());
  lastGlobalSaveTime = Date.now();
  inFlightSaves.set(key, (inFlightSaves.get(key) || 0) + 1);

  try {
    const body = JSON.stringify({
      action: 'save',
      key,
      value: strValue
    });
    const res = await fetch(getApiUrl('save'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body
    });

    const data = await res.json().catch(() => null);
    lastLocalSaveTime.set(key, Date.now());
    lastGlobalSaveTime = Date.now();

    if (data && typeof data.updatedAt === 'number') {
      persistSyncMeta(key, data.updatedAt);
    }

    if (data && typeof data.mysqlConnected === 'boolean') {
      dbStatusInfo = {
        ...dbStatusInfo,
        mysqlConnected: data.mysqlConnected,
        mysqlError: data.sqlError || null
      };
      notifyStatusListeners();
    }
    return Boolean(res.ok && data && data.status === 'ok' && !data.sqlError);
  } catch (err) {
    console.error('cPanel DB Save Error:', err);
    return false;
  } finally {
    const count = (inFlightSaves.get(key) || 1) - 1;
    if (count <= 0) {
      inFlightSaves.delete(key);
    } else {
      inFlightSaves.set(key, count);
    }
  }
}

export async function saveToCpanelDb(key: string, value: any): Promise<void> {
  const strValue = typeof value === 'string' ? value : JSON.stringify(value);
  const prevValue = memoryStore.get(key);

  memoryStore.set(key, strValue);
  persistToNativeStorage(key, strValue);
  lastLocalSaveTime.set(key, Date.now());
  lastGlobalSaveTime = Date.now();

  if (prevValue !== strValue) {
    dispatchLocalSyncEvent(key, strValue);
  }

  await sendSaveRequest(key, strValue, true);
}

export async function syncAllToMysqlNow(): Promise<boolean> {
  try {
    let allOk = true;
    for (const key of SYNCED_KEYS) {
      const val = memoryStore.get(key) ?? readNativeRaw(key);
      if (val !== null && val !== undefined) {
        memoryStore.set(key, val);
        const ok = await sendSaveRequest(key, val, true);
        if (!ok) allOk = false;
      }
    }
    await pullFromServer(true);
    return allOk;
  } catch {
    return false;
  }
}

export interface AutoBackupInfo {
  hasBackup: boolean;
  savedAt: string | null;
  keyCount: number;
  keys: string[];
  counts: Record<string, number>;
}

export function getAutoBackupInfo(): AutoBackupInfo {
  try {
    const raw = readNativeRaw(AUTO_BACKUP_STORAGE_KEY);
    if (!raw) {
      return { hasBackup: false, savedAt: null, keyCount: 0, keys: [], counts: {} };
    }
    const parsed = JSON.parse(raw);
    const savedKeys =
      parsed && typeof parsed === 'object' && parsed.keys && typeof parsed.keys === 'object'
        ? (parsed.keys as Record<string, string>)
        : {};
    const keys = Object.keys(savedKeys).filter((k) => SYNCED_KEYS.has(k) && isNonEmptySerializedValue(savedKeys[k]));
    const counts: Record<string, number> = {};
    for (const k of keys) {
      counts[k] = countSerializedRecords(savedKeys[k]);
    }
    return {
      hasBackup: keys.length > 0,
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : null,
      keyCount: keys.length,
      keys,
      counts
    };
  } catch {
    return { hasBackup: false, savedAt: null, keyCount: 0, keys: [], counts: {} };
  }
}

export function exportAllAppDataJson(): string {
  const data: Record<string, any> = {};
  for (const key of SYNCED_KEYS) {
    const raw = memoryStore.get(key) ?? readNativeRaw(key);
    if (raw === null || raw === undefined) continue;
    try {
      data[key] = JSON.parse(raw);
    } catch {
      data[key] = raw;
    }
  }
  return JSON.stringify(
    {
      app: 'salma-food-corner',
      version: 1,
      exportedAt: new Date().toISOString(),
      data
    },
    null,
    2
  );
}

async function applyRestoredEntries(
  entries: Record<string, string>
): Promise<{ ok: boolean; restoredKeys: string[] }> {
  const restoredKeys: string[] = [];
  isRemoteApplying = true;
  try {
    for (const [key, serialized] of Object.entries(entries)) {
      if (!SYNCED_KEYS.has(key)) continue;
      const existing = memoryStore.get(key) ?? readNativeRaw(key);
      if (existing && existing !== serialized && isNonEmptySerializedValue(existing)) {
        capturePreOverwriteAutoBackup(key, existing);
      }
      memoryStore.set(key, serialized);
      persistToNativeStorage(key, serialized);
      lastLocalSaveTime.set(key, Date.now());
      lastGlobalSaveTime = Date.now();
      dispatchLocalSyncEvent(key, serialized);
      restoredKeys.push(key);
    }
  } finally {
    isRemoteApplying = false;
  }

  for (const key of restoredKeys) {
    const val = memoryStore.get(key);
    if (val !== undefined) {
      await sendSaveRequest(key, val, true);
    }
  }

  return { ok: restoredKeys.length > 0, restoredKeys };
}

export async function importAllAppDataJson(
  rawJson: string
): Promise<{ ok: boolean; restoredKeys: string[]; message: string }> {
  const parsed = parseBackupPayload(rawJson, SYNCED_KEYS);
  if (parsed.ok === false) {
    return { ok: false, restoredKeys: [], message: parsed.error };
  }
  const res = await applyRestoredEntries(parsed.entries);
  return {
    ok: res.ok,
    restoredKeys: res.restoredKeys,
    message: res.ok
      ? `সফলভাবে ${res.restoredKeys.length}টি ডাটা সেট রিস্টোর ও ডাটাবেসে সেভ হয়েছে!`
      : 'কোনো ডাটা রিস্টোর করা যায়নি।'
  };
}

export async function restoreFromAutoBackup(): Promise<{
  ok: boolean;
  restoredKeys: string[];
  message: string;
}> {
  try {
    const raw = readNativeRaw(AUTO_BACKUP_STORAGE_KEY);
    if (!raw) {
      return { ok: false, restoredKeys: [], message: 'কোনো অটো-ব্যাকআপ পাওয়া যায়নি।' };
    }
    const parsed = JSON.parse(raw);
    const savedKeys: Record<string, string> =
      parsed && typeof parsed === 'object' && parsed.keys && typeof parsed.keys === 'object'
        ? parsed.keys
        : {};
    const validEntries: Record<string, string> = {};
    for (const [k, v] of Object.entries(savedKeys)) {
      if (SYNCED_KEYS.has(k) && typeof v === 'string' && isNonEmptySerializedValue(v)) {
        validEntries[k] = v;
      }
    }
    if (Object.keys(validEntries).length === 0) {
      return { ok: false, restoredKeys: [], message: 'অটো-ব্যাকআপে পুনরুদ্ধারযোগ্য কোনো ডাটা নেই।' };
    }
    const res = await applyRestoredEntries(validEntries);
    return {
      ok: res.ok,
      restoredKeys: res.restoredKeys,
      message: res.ok
        ? `অটো-ব্যাকআপ থেকে ${res.restoredKeys.length}টি ডাটা সেট সফলভাবে পুনরুদ্ধার হয়েছে!`
        : 'অটো-ব্যাকআপ পুনরুদ্ধার করা যায়নি।'
    };
  } catch {
    return { ok: false, restoredKeys: [], message: 'অটো-ব্যাকআপ ডাটা পড়তে সমস্যা হয়েছে।' };
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
        action: 'upload_image',
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
        action: 'setup_db',
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

export async function pullFromServer(isInitialBoot = false): Promise<void> {
  // Do not pull while any save request is in flight or within 6 seconds of a local save
  if (!isInitialBoot) {
    if (inFlightSaves.size > 0 || Date.now() - lastGlobalSaveTime < 6000) {
      return;
    }
  }

  const pullStartedAt = Date.now();

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

    // If a save occurred while this load request was in flight, abort applying stale server data
    if (!isInitialBoot && (inFlightSaves.size > 0 || lastGlobalSaveTime >= pullStartedAt)) {
      return;
    }

    dbStatusInfo = {
      mysqlConnected: Boolean(result.mysqlConnected),
      dbName: result.dbName || null,
      mysqlError: result.mysqlError || null
    };
    notifyStatusListeners();

    const serverData: Record<string, any> =
      result.data && typeof result.data === 'object' ? result.data : {};
    const serverMeta: Record<string, number> =
      result.meta && typeof result.meta === 'object' ? result.meta : {};
    const tableCounts: Record<string, number> =
      result.tableCounts && typeof result.tableCounts === 'object' ? result.tableCounts : {};

    const keysToReconcile = new Set<string>([
      ...SYNCED_KEYS,
      ...Object.keys(serverData)
    ]);

    const keysToPush: Array<{ key: string; val: string }> = [];
    isRemoteApplying = true;
    try {
      const nowMs = Date.now();
      for (const key of keysToReconcile) {
        const keyPresentInServer =
          Object.prototype.hasOwnProperty.call(serverData, key) &&
          serverData[key] !== undefined &&
          serverData[key] !== null;

        const serverSerialized = keyPresentInServer
          ? (typeof serverData[key] === 'string'
              ? serverData[key]
              : JSON.stringify(serverData[key]))
          : undefined;
        const localSerialized = memoryStore.get(key);
        const lastKeySave = lastLocalSaveTime.get(key) || 0;
        const serverMetaTs = Number(serverMeta[key]) || 0;
        const localSyncedMetaTs = Number(syncMetaMap[key]) || 0;

        const action = resolveServerPullAction({
          keyPresentInServer,
          serverSerialized,
          localSerialized,
          isInitialBoot,
          inFlightCount: inFlightSaves.get(key) || 0,
          lastLocalSaveMs: lastKeySave,
          pullStartedAt,
          nowMs,
          serverMetaTs,
          localSyncedMetaTs
        });

        const mysqlTableIsEmpty =
          Boolean(result.mysqlConnected) &&
          Object.prototype.hasOwnProperty.call(tableCounts, key) &&
          Number(tableCounts[key]) === 0 &&
          Boolean(localSerialized && isNonEmptySerializedValue(localSerialized)) &&
          !(serverMetaTs > localSyncedMetaTs && !isNonEmptySerializedValue(serverSerialized));

        if (
          (action === 'push-local' || mysqlTableIsEmpty) &&
          localSerialized &&
          isNonEmptySerializedValue(localSerialized)
        ) {
          keysToPush.push({ key, val: localSerialized });
        } else if (action === 'apply' && serverSerialized !== undefined) {
          if (localSerialized && localSerialized !== serverSerialized) {
            capturePreOverwriteAutoBackup(key, localSerialized);
          }
          memoryStore.set(key, serverSerialized);
          persistToNativeStorage(key, serverSerialized);
          if (serverMetaTs > 0) {
            persistSyncMeta(key, serverMetaTs);
          }
          dispatchLocalSyncEvent(key, serverSerialized);
        }
      }
    } finally {
      isRemoteApplying = false;
    }

    for (const item of keysToPush) {
      await sendSaveRequest(item.key, item.val, true);
    }
  } catch {
    // Ignore transient network errors
  }
}

/**
 * Normalizes Bangladeshi mobile numbers strictly without '+88' (11 digits: '01XXXXXXXXX').
 * Converts Bengali digits '০১৭১২৩৪৫৬৭৮' and strips any '+88'/'88' or formatting characters.
 */
export function normalizeBdPhone(raw: string): string {
  if (!raw) return '';
  const bnToEnMap: Record<string, string> = {
    '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4',
    '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9'
  };
  const ascii = raw.replace(/[০-৯]/g, (d) => bnToEnMap[d] || d);
  let digits = ascii.replace(/\D/g, '');
  if (digits.startsWith('8801')) {
    digits = digits.slice(2);
  } else if (digits.startsWith('88') && digits.length > 11) {
    digits = digits.slice(2);
  } else if (digits.startsWith('1') && digits.length === 10) {
    digits = '0' + digits;
  }
  return digits.slice(0, 11);
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

/**
 * Computes a customer's net Remaining Due (অবশিষ্ট বাকি) or Advance Deposit (অগ্রীম জমা)
 * from the Due Ledger ('salma_due_ledger').
 */
export function getCustomerDueOrAdvanceBalance(
  phoneInput: string,
  customerName?: string,
  dueListOverride?: Array<any>
): { totalBill: number; totalPaid: number; remainingDue: number; advanceDeposit: number } {
  const normPhone = normalizeBdPhone(phoneInput || '');
  const cleanName = (customerName || '').trim().toLowerCase();

  let list: Array<any> = [];
  if (Array.isArray(dueListOverride)) {
    list = dueListOverride;
  } else {
    const raw = memoryStore.get('salma_due_ledger');
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) list = parsed;
      } catch {
        // ignore
      }
    }
  }

  let totalBill = 0;
  let totalPaid = 0;

  for (const item of list) {
    if (!item) continue;
    const itemPhone = normalizeBdPhone(item.customerPhone || '');
    const itemName = (item.customerName || '').trim().toLowerCase();
    const isMatch =
      (normPhone && itemPhone && normPhone === itemPhone) ||
      (!normPhone && cleanName && itemName === cleanName);

    if (isMatch) {
      totalBill += Number(item.totalAmount) || 0;
      totalPaid += Number(item.paidAmount) || 0;
    }
  }

  const diff = totalBill - totalPaid;
  return {
    totalBill,
    totalPaid,
    remainingDue: diff > 0 ? diff : 0,
    advanceDeposit: diff < 0 ? Math.abs(diff) : 0
  };
}

export function getCustomerTransactions(
  phoneInput: string,
  customerName?: string
): {
  vouchers: Array<any>;
  payments: Array<any>;
} {
  const normPhone = normalizeBdPhone(phoneInput || '');
  const cleanName = (customerName || '').trim().toLowerCase();

  let list: Array<any> = [];
  const raw = memoryStore.get('salma_due_ledger') || (typeof window !== 'undefined' ? localStorage.getItem('salma_due_ledger') : null);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) list = parsed;
    } catch {
      // ignore
    }
  }

  const vouchers: Array<any> = [];
  const payments: Array<any> = [];

  for (const item of list) {
    if (!item) continue;
    const itemPhone = normalizeBdPhone(item.customerPhone || '');
    const itemName = (item.customerName || '').trim().toLowerCase();
    const isMatch =
      (normPhone && itemPhone && normPhone === itemPhone) ||
      (!normPhone && cleanName && itemName === cleanName);

    if (isMatch) {
      vouchers.push(item);
      if (Array.isArray(item.payments)) {
        item.payments.forEach((p: any) => {
          payments.push({
            ...p,
            voucherNo: item.voucherNo
          });
        });
      }
    }
  }

  return { vouchers, payments };
}

export async function initSqlDatabaseSync(): Promise<void> {
  if (typeof window === 'undefined' || isInitialized) return;
  isInitialized = true;

  // Bind native browser localStorage methods before patching Storage.prototype
  try {
    nativeGetItem = Storage.prototype.getItem.bind(window.localStorage);
    nativeSetItem = Storage.prototype.setItem.bind(window.localStorage);
    nativeRemoveItem = Storage.prototype.removeItem.bind(window.localStorage);

    // Preload existing local data and sync meta timestamps into memoryStore so nothing is lost on refresh
    const rawMeta = nativeGetItem(SYNC_META_STORAGE_KEY);
    if (rawMeta) {
      try {
        const parsedMeta = JSON.parse(rawMeta);
        if (parsedMeta && typeof parsedMeta === 'object') {
          syncMetaMap = parsedMeta;
        }
      } catch {
        syncMetaMap = {};
      }
    }
    for (const key of SYNCED_KEYS) {
      const existingVal = nativeGetItem(key);
      if (existingVal !== null) {
        memoryStore.set(key, existingVal);
      }
    }
    for (const sKey of SESSION_KEYS) {
      const sVal = window.sessionStorage.getItem(sKey) || nativeGetItem(sKey);
      if (sVal !== null) {
        memoryStore.set(sKey, sVal);
      }
    }
  } catch {
    // Ignore
  }

  // Patch Storage.prototype so ALL calls to localStorage.getItem / setItem across all modules use memoryStore + cPanel API
  Storage.prototype.getItem = function (key: string): string | null {
    if (memoryStore.has(key)) {
      return memoryStore.get(key)!;
    }
    if (nativeGetItem) {
      try {
        const val = nativeGetItem(key);
        if (val !== null) {
          memoryStore.set(key, val);
          return val;
        }
      } catch {
        // Ignore
      }
    }
    return null;
  };

  Storage.prototype.setItem = function (key: string, value: string): void {
    const strValue = String(value);
    const previousValue = memoryStore.get(key);

    if (previousValue === strValue) {
      return;
    }

    // Skip initial mount empty default writes ('[]' or '{}') when previousValue is undefined so page load never overwrites server DB
    if (
      previousValue === undefined &&
      SYNCED_KEYS.has(key) &&
      (strValue === '[]' || strValue === '{}')
    ) {
      memoryStore.set(key, strValue);
      return;
    }
    if (
      previousValue === undefined &&
      SYNCED_KEYS.has(key) &&
      syncBootDoneAt > 0 &&
      Date.now() - syncBootDoneAt < 1200
    ) {
      memoryStore.set(key, strValue);
      persistToNativeStorage(key, strValue);
      return;
    }

    memoryStore.set(key, strValue);
    persistToNativeStorage(key, strValue);

    if (!isRemoteApplying && SYNCED_KEYS.has(key)) {
      lastLocalSaveTime.set(key, Date.now());
      lastGlobalSaveTime = Date.now();
      dispatchLocalSyncEvent(key, strValue);
      sendSaveRequest(key, strValue, false);
    }
  };

  Storage.prototype.removeItem = function (key: string): void {
    memoryStore.delete(key);
    try {
      if (nativeRemoveItem) nativeRemoveItem(key);
      if (SESSION_KEYS.has(key)) {
        window.sessionStorage.removeItem(key);
      }
    } catch {
      // Ignore
    }
  };

  Storage.prototype.clear = function (): void {
    memoryStore.clear();
  };

  // Keep memoryStore synced with genuine cross-tab StorageEvents without echoing a redundant save back to server
  window.addEventListener('storage', (e) => {
    if (isInternalDispatching || !e.key || e.newValue === null) return;
    if (SYNCED_KEYS.has(e.key)) {
      memoryStore.set(e.key, e.newValue);
      lastLocalSaveTime.set(e.key, Date.now());
      lastGlobalSaveTime = Date.now();
    }
  });

  // Load initial database state from cPanel server BEFORE mounting React app
  await pullFromServer(true);
  syncBootDoneAt = Date.now();

  // After React mounts and populates default menu/categories/location in memoryStore,
  // reconcile once so any keys missing on the server/phpMyAdmin are pushed automatically
  setTimeout(() => {
    pullFromServer(false);
  }, 1500);

  // Keep all tabs/devices synced with cPanel server (guarded against overwriting recent saves)
  window.addEventListener('focus', () => {
    pullFromServer(false);
  });
  setInterval(() => {
    pullFromServer(false);
  }, 6000);
}

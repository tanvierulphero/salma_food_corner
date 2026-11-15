export function isNonEmptySerializedValue(strVal: string | undefined | null): boolean {
  if (!strVal) return false;
  const trimmed = strVal.trim();
  return trimmed !== '' && trimmed !== '[]' && trimmed !== '{}' && trimmed !== 'null';
}

export type ServerPullAction = 'apply' | 'push-local' | 'skip';

export interface ReconcileServerPullParams {
  keyPresentInServer: boolean;
  serverSerialized: string | undefined;
  localSerialized: string | undefined;
  isInitialBoot: boolean;
  inFlightCount: number;
  lastLocalSaveMs: number;
  pullStartedAt: number;
  nowMs?: number;
  serverMetaTs?: number;
  localSyncedMetaTs?: number;
}

/**
 * Decides whether an incoming key snapshot from `/api.php?action=load` should
 * update local state (`apply`), push uninitialized local data (`push-local`),
 * or be ignored (`skip`) so recent deletes/cancels are never reverted AND
 * existing browser data is never wiped by an empty/fresh server state.
 */
export function resolveServerPullAction(params: ReconcileServerPullParams): ServerPullAction {
  const {
    keyPresentInServer,
    serverSerialized,
    localSerialized,
    isInitialBoot,
    inFlightCount,
    lastLocalSaveMs,
    pullStartedAt,
    nowMs = Date.now(),
    serverMetaTs = 0,
    localSyncedMetaTs = 0
  } = params;

  if (inFlightCount > 0) {
    return 'skip';
  }

  // If the local key was modified after this GET request started, or within 8 seconds (non-boot),
  // never let an older server snapshot overwrite the newer local mutation.
  if (lastLocalSaveMs > 0) {
    if (lastLocalSaveMs >= pullStartedAt) {
      return 'skip';
    }
    if (!isInitialBoot && nowMs - lastLocalSaveMs < 8000) {
      return 'skip';
    }
  }

  // Server has never stored this key yet -> preserve and push non-empty local data on initial boot.
  if (!keyPresentInServer) {
    if (isInitialBoot && isNonEmptySerializedValue(localSerialized)) {
      return 'push-local';
    }
    return 'skip';
  }

  if (serverSerialized === undefined || serverSerialized === localSerialized) {
    return 'skip';
  }

  // If server holds an empty [] / {} while local browser holds real non-empty data:
  // Apply the empty list ONLY when server has a newer explicit mutation timestamp (or no explicit
  // uninitialized boot mismatch) — i.e., if serverMetaTs > localSyncedMetaTs (Admin explicitly deleted orders).
  // If serverMetaTs === 0 and local has unsynced data on boot, preserve local data instead of wiping it.
  if (!isNonEmptySerializedValue(serverSerialized) && isNonEmptySerializedValue(localSerialized)) {
    if (serverMetaTs > localSyncedMetaTs) {
      return 'apply';
    }
    if (isInitialBoot && serverMetaTs === 0) {
      return 'push-local';
    }
  }

  return 'apply';
}

export function removeOrderById<T extends { id: string }>(orders: T[], orderId: string): T[] {
  return orders.filter((o) => o.id !== orderId);
}

export function setOrderStatusById<T extends { id: string; status: string }>(
  orders: T[],
  orderId: string,
  status: T['status']
): T[] {
  return orders.map((o) => (o.id === orderId ? { ...o, status } : o));
}

export function countActiveOrders<T extends { status: string }>(orders: T[]): number {
  return orders.filter((o) => o.status !== 'Delivered' && o.status !== 'Cancelled').length;
}

export function countSerializedRecords(serialized: string | undefined | null): number {
  if (!serialized) return 0;
  try {
    const parsed = JSON.parse(serialized);
    if (Array.isArray(parsed)) return parsed.length;
    if (parsed && typeof parsed === 'object') return Object.keys(parsed).length;
    return isNonEmptySerializedValue(serialized) ? 1 : 0;
  } catch {
    return isNonEmptySerializedValue(serialized) ? 1 : 0;
  }
}

export function parseBackupPayload(
  rawJson: string,
  allowedKeys: Set<string>
): { ok: true; entries: Record<string, string> } | { ok: false; error: string } {
  if (!rawJson || !rawJson.trim()) {
    return { ok: false, error: 'ব্যাকআপ ফাইলটি খালি।' };
  }
  let parsed: any;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return { ok: false, error: 'সঠিক JSON ব্যাকআপ ফাইল নয়।' };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'ব্যাকআপ ফাইলের ফরম্যাট সঠিক নয়।' };
  }

  const sourceObj: Record<string, any> =
    parsed.data && typeof parsed.data === 'object' && !Array.isArray(parsed.data)
      ? parsed.data
      : parsed;

  const entries: Record<string, string> = {};
  for (const key of allowedKeys) {
    if (!Object.prototype.hasOwnProperty.call(sourceObj, key)) continue;
    const val = sourceObj[key];
    if (val === undefined || val === null) continue;
    if (typeof val === 'string') {
      // Allow either raw string (for salma_active_offer) or already-serialized JSON
      entries[key] = val;
    } else {
      entries[key] = JSON.stringify(val);
    }
  }

  if (Object.keys(entries).length === 0) {
    return { ok: false, error: 'এই ফাইলে সালমা ফুড কর্ণারের কোনো ডাটা পাওয়া যায়নি।' };
  }

  return { ok: true, entries };
}


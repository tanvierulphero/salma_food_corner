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
}

/**
 * Decides whether an incoming key snapshot from `/api.php?action=load` should
 * update local state (`apply`), push uninitialized local data (`push-local`),
 * or be ignored (`skip`) so recent deletes/cancels are never reverted.
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
    nowMs = Date.now()
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

  // Only push local data if the server has NEVER stored this key yet (fresh server boot).
  // If the server explicitly holds '[]' or '{}', respect that authoritative state (e.g., all orders deleted)
  // so deleted orders are never resurrected from a stale browser cache or another tab.
  if (!keyPresentInServer) {
    if (isInitialBoot && isNonEmptySerializedValue(localSerialized)) {
      return 'push-local';
    }
    return 'skip';
  }

  if (serverSerialized === undefined || serverSerialized === localSerialized) {
    return 'skip';
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

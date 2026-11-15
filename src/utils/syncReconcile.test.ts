import test from 'node:test';
import assert from 'node:assert/strict';
import {
  countActiveOrders,
  countSerializedRecords,
  parseBackupPayload,
  removeOrderById,
  resolveServerPullAction,
  setOrderStatusById
} from './syncReconcile';

test('explicit empty array [] from server with newer serverMetaTs overwrites stale local orders instead of resurrecting them', () => {
  const action = resolveServerPullAction({
    keyPresentInServer: true,
    serverSerialized: '[]',
    localSerialized: '[{"id":"SF-1","status":"Placed"}]',
    isInitialBoot: false,
    inFlightCount: 0,
    lastLocalSaveMs: 0,
    pullStartedAt: 20000,
    nowMs: 20100,
    serverMetaTs: 15000,
    localSyncedMetaTs: 10000
  });
  assert.equal(action, 'apply');
});

test('explicit empty array [] on initial boot applies when serverMetaTs is newer than localSyncedMetaTs', () => {
  const action = resolveServerPullAction({
    keyPresentInServer: true,
    serverSerialized: '[]',
    localSerialized: '[{"id":"SF-1","status":"Placed"}]',
    isInitialBoot: true,
    inFlightCount: 0,
    lastLocalSaveMs: 0,
    pullStartedAt: 1000,
    nowMs: 1050,
    serverMetaTs: 900,
    localSyncedMetaTs: 500
  });
  assert.equal(action, 'apply');
});

test('empty server [] with no serverMetaTs (0) on initial boot preserves and pushes local browser data', () => {
  const action = resolveServerPullAction({
    keyPresentInServer: true,
    serverSerialized: '[]',
    localSerialized: '[{"id":"SF-1","status":"Placed"}]',
    isInitialBoot: true,
    inFlightCount: 0,
    lastLocalSaveMs: 0,
    pullStartedAt: 1000,
    nowMs: 1050,
    serverMetaTs: 0,
    localSyncedMetaTs: 0
  });
  assert.equal(action, 'push-local');
});

test('pushes local data on initial boot ONLY when server has never stored the key', () => {
  const action = resolveServerPullAction({
    keyPresentInServer: false,
    serverSerialized: undefined,
    localSerialized: '[{"id":"SF-1","status":"Placed"}]',
    isInitialBoot: true,
    inFlightCount: 0,
    lastLocalSaveMs: 0,
    pullStartedAt: 1000,
    nowMs: 1050
  });
  assert.equal(action, 'push-local');
});

test('skips server snapshot if a local save occurred after the GET request started', () => {
  const action = resolveServerPullAction({
    keyPresentInServer: true,
    serverSerialized: '[{"id":"SF-1","status":"Placed"}]',
    localSerialized: '[]',
    isInitialBoot: false,
    inFlightCount: 0,
    lastLocalSaveMs: 5050,
    pullStartedAt: 5000,
    nowMs: 15000,
    serverMetaTs: 4000,
    localSyncedMetaTs: 3000
  });
  assert.equal(action, 'skip');
});

test('skips server snapshot while a save request is in flight', () => {
  const action = resolveServerPullAction({
    keyPresentInServer: true,
    serverSerialized: '[{"id":"SF-1","status":"Placed"}]',
    localSerialized: '[]',
    isInitialBoot: false,
    inFlightCount: 1,
    lastLocalSaveMs: 1000,
    pullStartedAt: 20000,
    nowMs: 20100
  });
  assert.equal(action, 'skip');
});

test('removeOrderById and setOrderStatusById update orders cleanly and countActiveOrders excludes Delivered and Cancelled', () => {
  const initial = [
    { id: 'SF-1', status: 'Placed' },
    { id: 'SF-2', status: 'Preparing' },
    { id: 'SF-3', status: 'Delivered' }
  ];
  assert.equal(countActiveOrders(initial), 2);

  const cancelled = setOrderStatusById(initial, 'SF-1', 'Cancelled');
  assert.equal(cancelled[0].status, 'Cancelled');
  assert.equal(countActiveOrders(cancelled), 1);

  const deleted = removeOrderById(cancelled, 'SF-2');
  assert.deepEqual(deleted.map((o) => o.id), ['SF-1', 'SF-3']);
  assert.equal(countActiveOrders(deleted), 0);

  const empty = removeOrderById([{ id: 'SF-1', status: 'Placed' }], 'SF-1');
  assert.deepEqual(empty, []);
});

test('parseBackupPayload validates structured export and flat server JSON while rejecting invalid payloads', () => {
  const allowed = new Set(['salma_orders', 'salma_customers', 'salma_due_ledger']);

  const structured = parseBackupPayload(
    JSON.stringify({
      app: 'salma-food-corner',
      version: 1,
      data: {
        salma_orders: [{ id: 'SF-10' }],
        salma_customers: { '01700000000': { name: 'Abid' } },
        ignored_key: 123
      }
    }),
    allowed
  );
  assert.equal(structured.ok, true);
  if (structured.ok) {
    assert.equal(countSerializedRecords(structured.entries.salma_orders), 1);
    assert.equal(countSerializedRecords(structured.entries.salma_customers), 1);
    assert.equal(structured.entries.ignored_key, undefined);
  }

  const flat = parseBackupPayload(
    JSON.stringify({ salma_due_ledger: [{ id: 'd1' }, { id: 'd2' }] }),
    allowed
  );
  assert.equal(flat.ok, true);
  if (flat.ok) {
    assert.equal(countSerializedRecords(flat.entries.salma_due_ledger), 2);
  }

  const invalid = parseBackupPayload('not-json', allowed);
  assert.equal(invalid.ok, false);

  const unrelated = parseBackupPayload(JSON.stringify({ foo: 'bar' }), allowed);
  assert.equal(unrelated.ok, false);
});


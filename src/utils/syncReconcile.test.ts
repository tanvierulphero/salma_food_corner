import test from 'node:test';
import assert from 'node:assert/strict';
import {
  countActiveOrders,
  removeOrderById,
  resolveServerPullAction,
  setOrderStatusById
} from './syncReconcile';

test('explicit empty array [] from server overwrites stale local orders instead of resurrecting them', () => {
  const action = resolveServerPullAction({
    keyPresentInServer: true,
    serverSerialized: '[]',
    localSerialized: '[{"id":"SF-1","status":"Placed"}]',
    isInitialBoot: false,
    inFlightCount: 0,
    lastLocalSaveMs: 0,
    pullStartedAt: 20000,
    nowMs: 20100
  });
  assert.equal(action, 'apply');
});

test('explicit empty array [] on initial boot also applies server empty list instead of pushing stale local cache', () => {
  const action = resolveServerPullAction({
    keyPresentInServer: true,
    serverSerialized: '[]',
    localSerialized: '[{"id":"SF-1","status":"Placed"}]',
    isInitialBoot: true,
    inFlightCount: 0,
    lastLocalSaveMs: 0,
    pullStartedAt: 1000,
    nowMs: 1050
  });
  assert.equal(action, 'apply');
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
    nowMs: 15000
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

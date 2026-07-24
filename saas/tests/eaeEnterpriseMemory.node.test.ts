import assert from 'node:assert/strict';
import test from 'node:test';
import {
  InMemoryEnterpriseMemoryStore,
  buildEnterpriseMemorySnapshot,
  createEnterpriseMemoryRecord,
} from '../lib/autonomous-systems/index.ts';

const tenant = { tenantId: 'acme', environmentId: 'prod', region: 'us' };
const otherTenant = { tenantId: 'other', environmentId: 'prod', region: 'us' };

function record(overrides: Record<string, unknown> = {}) {
  return createEnterpriseMemoryRecord({
    tenant,
    kind: 'decision',
    subject: 'launch-product',
    occurredAt: '2026-07-24T10:00:00.000Z',
    recordedAt: '2026-07-24T10:01:00.000Z',
    source: 'eae',
    evidenceRefs: ['evidence-1'],
    tags: ['strategy', 'approved'],
    payload: { outcome: 'recommended', confidence: 0.9 },
    ...overrides,
  } as Parameters<typeof createEnterpriseMemoryRecord>[0]);
}

test('creates deterministic immutable memory records', () => {
  const first = record();
  const second = record();
  assert.equal(first.memoryId, second.memoryId);
  assert.ok(Object.isFrozen(first));
  assert.doesNotThrow(() => JSON.stringify(first));
});

test('rejects secrets, executable values, non-finite numbers, and invalid timestamps', () => {
  assert.throws(() => record({ payload: { apiKey: 'no' } }), /secret/);
  assert.throws(() => record({ payload: { run: () => undefined } }), /executable/);
  assert.throws(() => record({ payload: { score: Infinity } }), /non_finite/);
  assert.throws(() => record({ occurredAt: 'invalid' }), /invalid_timestamp/);
});

test('isolates tenants and filters deterministically', async () => {
  const store = new InMemoryEnterpriseMemoryStore();
  await store.append(record());
  await store.append(record({
    tenant: otherTenant,
    subject: 'other-subject',
    occurredAt: '2026-07-24T11:00:00.000Z',
  }));
  await store.append(record({
    kind: 'lesson',
    occurredAt: '2026-07-24T12:00:00.000Z',
    tags: ['strategy', 'learned'],
  }));

  const results = await store.query({ tenant, subject: 'launch-product', kinds: ['lesson'], tags: ['learned'], limit: 10 });
  assert.equal(results.length, 1);
  assert.equal(results[0]?.kind, 'lesson');
  assert.equal(results[0]?.tenant.tenantId, 'acme');
});

test('rejects duplicate ids and unbounded queries', async () => {
  const store = new InMemoryEnterpriseMemoryStore();
  const item = record();
  await store.append(item);
  await assert.rejects(() => store.append(item), /duplicate_memory_id/);
  await assert.rejects(() => store.query({ tenant, limit: 257 }), /unbounded/);
});

test('builds deterministic bounded memory snapshots', async () => {
  const store = new InMemoryEnterpriseMemoryStore();
  await store.append(record());
  const input = { store, query: { tenant, limit: 1 }, generatedAt: '2026-07-24T13:00:00.000Z' } as const;
  const first = await buildEnterpriseMemorySnapshot(input);
  const second = await buildEnterpriseMemorySnapshot(input);
  assert.equal(first.snapshotId, second.snapshotId);
  assert.equal(first.truncated, true);
  assert.ok(Object.isFrozen(first));
});

// The governing property under test: ignorance never revokes. Most of these
// prove that a broken, slow or stale revocation source cannot take a paying
// deployment offline — while still making the ignorance visible.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createCachingRevocationSource,
  createStaticRevocationList,
  mergeRevocationSources,
} from '../portable-license/revocation.ts';

const clockAt = (ref: { ms: number }) => ({ now: () => new Date(ref.ms) });

test('a static list answers from what the buyer already has', async () => {
  const source = createStaticRevocationList(['lic-a', 'lic-b']);
  assert.equal(await source.isRevoked('lic-a'), true);
  assert.equal(await source.isRevoked('lic-z'), false);
});

test('a successful check is cached for the ttl, then refreshed', async () => {
  const ref = { ms: 1_000_000 };
  let calls = 0;
  const source = createCachingRevocationSource({
    fetchRevoked() {
      calls += 1;
      return false;
    },
    ttlMs: 60_000,
    clock: clockAt(ref),
  });

  await source.isRevoked('lic-a');
  await source.isRevoked('lic-a');
  assert.equal(calls, 1);
  ref.ms += 61_000;
  await source.isRevoked('lic-a');
  assert.equal(calls, 2);
});

test('concurrent checks for the same licence share one fetch', async () => {
  let calls = 0;
  const source = createCachingRevocationSource({
    async fetchRevoked() {
      calls += 1;
      await new Promise((r) => setTimeout(r, 5));
      return false;
    },
  });
  await Promise.all([source.isRevoked('lic-a'), source.isRevoked('lic-a'), source.isRevoked('lic-a')]);
  assert.equal(calls, 1);
});

test('a throwing check does not revoke, and reports the ignorance', async () => {
  const stale: unknown[] = [];
  const source = createCachingRevocationSource({
    fetchRevoked() {
      throw new Error('endpoint down');
    },
    onStale: (info) => stale.push(info),
  });
  assert.equal(await source.isRevoked('lic-a'), false);
  assert.equal(stale.length, 1);
});

test('a hanging check is abandoned rather than blocking the caller', async () => {
  const source = createCachingRevocationSource({
    fetchRevoked() {
      return new Promise<boolean>(() => {});
    },
    timeoutMs: 20,
  });
  const started = Date.now();
  assert.equal(await source.isRevoked('lic-a'), false);
  assert.ok(Date.now() - started < 1000);
});

test('last-known-good is served when the source goes away', async () => {
  const ref = { ms: 5_000_000 };
  let mode: 'ok' | 'down' = 'ok';
  const source = createCachingRevocationSource({
    fetchRevoked() {
      if (mode === 'down') throw new Error('down');
      return true;
    },
    ttlMs: 1_000,
    clock: clockAt(ref),
  });
  assert.equal(await source.isRevoked('lic-a'), true);
  mode = 'down';
  ref.ms += 10_000;
  assert.equal(await source.isRevoked('lic-a'), true);
});

test('a stale cached answer is still served, but reported', async () => {
  const ref = { ms: 9_000_000 };
  let mode: 'ok' | 'down' = 'ok';
  const stale: Array<{ ageMs: number | null }> = [];
  const source = createCachingRevocationSource({
    fetchRevoked() {
      if (mode === 'down') throw new Error('down');
      return false;
    },
    ttlMs: 1_000,
    maxStalenessMs: 60_000,
    onStale: (info) => stale.push(info),
    clock: clockAt(ref),
  });
  await source.isRevoked('lic-a');
  mode = 'down';
  ref.ms += 10_000;
  await source.isRevoked('lic-a');
  assert.equal(stale.length, 0);
  ref.ms += 120_000;
  assert.equal(await source.isRevoked('lic-a'), false);
  assert.equal(stale.length, 1);
  assert.ok((stale[0].ageMs ?? 0) >= 60_000);
});

test('an onStale callback that throws cannot become the outage', async () => {
  const source = createCachingRevocationSource({
    fetchRevoked() {
      throw new Error('down');
    },
    onStale() {
      throw new Error('monitoring is also down');
    },
  });
  assert.equal(await source.isRevoked('lic-a'), false);
});

test('merged sources: any one revocation wins', async () => {
  const merged = mergeRevocationSources(
    createStaticRevocationList([]),
    createStaticRevocationList(['lic-b']),
  );
  assert.equal(await merged.isRevoked('lic-b'), true);
  assert.equal(await merged.isRevoked('lic-a'), false);
});

test('merged sources: a broken source cannot veto a working one', async () => {
  const broken = {
    isRevoked() {
      throw new Error('broken');
    },
  };
  const merged = mergeRevocationSources(broken, createStaticRevocationList(['lic-b']));
  assert.equal(await merged.isRevoked('lic-b'), true);
  assert.equal(await merged.isRevoked('lic-a'), false);
});

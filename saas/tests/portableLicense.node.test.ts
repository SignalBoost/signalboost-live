// saas/tests/portableLicense.node.test.ts
//
// Most of these are negative by intent. A licence check that only proves the
// happy path is a licence check that has never been tested.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createEntitlementGate,
  createUnlicensedDevelopmentGate,
  EntitlementError,
  generateIssuerKeyPair,
  issueLicense,
  verifyLicense,
  canonicalize,
  TOKEN_PREFIX,
  type PortableLicenseClaims,
} from '../portable-license/index.ts';

const ISSUER = 'test-issuer';
const PRODUCT = 'self-healing-supervisor';

const keys = generateIssuerKeyPair();
const otherKeys = generateIssuerKeyPair();

const DAY = 86_400_000;

function claimsAt(overrides: Partial<PortableLicenseClaims> = {}): PortableLicenseClaims {
  const now = Date.now();
  return {
    schema: 'portable-license/1',
    licenseId: 'lic-0001',
    issuer: ISSUER,
    licensee: 'Buyer GmbH',
    productId: PRODUCT,
    edition: 'enterprise',
    features: ['repair.dispatch', 'siem.export'],
    seats: 25,
    maxExecutions: null,
    issuedAt: new Date(now - DAY).toISOString(),
    notBefore: new Date(now - DAY).toISOString(),
    expiresAt: new Date(now + 30 * DAY).toISOString(),
    graceDays: 14,
    ...overrides,
  };
}

const clockAt = (ms: number) => ({ now: () => new Date(ms) });

async function verdictFor(token: string | null, extra: Record<string, unknown> = {}) {
  return verifyLicense({
    token,
    productId: PRODUCT,
    issuer: ISSUER,
    publicKeysPem: [keys.publicKeyPem],
    ...extra,
  } as Parameters<typeof verifyLicense>[0]);
}

test('a well-formed licence verifies', async () => {
  const v = await verdictFor(issueLicense(claimsAt(), keys.privateKeyPem));
  assert.equal(v.state, 'valid');
  assert.equal(v.entitled, true);
  assert.equal(v.claims?.licensee, 'Buyer GmbH');
  assert.ok(Object.isFrozen(v));
});

test('a missing token is reported, not thrown', async () => {
  const v = await verdictFor(null);
  assert.equal(v.state, 'missing');
  assert.equal(v.entitled, false);
});

test('garbage in the token position does not throw', async () => {
  for (const bad of ['nonsense', TOKEN_PREFIX, TOKEN_PREFIX + 'onlyonepart', TOKEN_PREFIX + '!!!.???']) {
    const v = await verdictFor(bad);
    assert.equal(v.entitled, false, `expected refusal for ${JSON.stringify(bad)}`);
    assert.ok(['malformed', 'bad_signature'].includes(v.state), `unexpected state ${v.state}`);
  }
  assert.equal((await verdictFor('')).state, 'missing');
});

test('a tampered claim invalidates the signature', async () => {
  const token = issueLicense(claimsAt({ seats: 5 }), keys.privateKeyPem);
  const [payload, sig] = token.slice(TOKEN_PREFIX.length).split('.');
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  claims.seats = 5000;
  const forged = TOKEN_PREFIX + Buffer.from(canonicalize(claims), 'utf8').toString('base64url') + '.' + sig;
  const v = await verdictFor(forged);
  assert.equal(v.state, 'bad_signature');
  assert.equal(v.entitled, false);
});

test('a signature from another key is refused', async () => {
  const v = await verdictFor(issueLicense(claimsAt(), otherKeys.privateKeyPem));
  assert.equal(v.state, 'bad_signature');
});

test('key rotation works: several accepted keys, one matching', async () => {
  const token = issueLicense(claimsAt(), otherKeys.privateKeyPem);
  const v = await verifyLicense({
    token,
    productId: PRODUCT,
    issuer: ISSUER,
    publicKeysPem: ['not a key at all', keys.publicKeyPem, otherKeys.publicKeyPem],
  });
  assert.equal(v.state, 'valid');
});

test('a licence for another product cannot license this one', async () => {
  const v = await verdictFor(issueLicense(claimsAt({ productId: 'press-media' }), keys.privateKeyPem));
  assert.equal(v.state, 'wrong_product');
  assert.equal(v.entitled, false);
});

test('a licence from an unexpected issuer is refused', async () => {
  const v = await verdictFor(issueLicense(claimsAt({ issuer: 'someone-else' }), keys.privateKeyPem));
  assert.equal(v.state, 'wrong_issuer');
});

test('a not-yet-valid licence is refused', async () => {
  const now = Date.now();
  const token = issueLicense(
    claimsAt({ notBefore: new Date(now + 5 * DAY).toISOString(), expiresAt: new Date(now + 40 * DAY).toISOString() }),
    keys.privateKeyPem,
  );
  const v = await verdictFor(token, { clock: clockAt(now) });
  assert.equal(v.state, 'not_yet_valid');
});

test('expiry moves to grace, then to expired', async () => {
  const now = Date.now();
  const expiresAt = new Date(now + DAY).toISOString();
  const token = issueLicense(claimsAt({ expiresAt, graceDays: 10 }), keys.privateKeyPem);

  assert.equal((await verdictFor(token, { clock: clockAt(now) })).state, 'valid');

  const inGrace = await verdictFor(token, { clock: clockAt(now + 5 * DAY) });
  assert.equal(inGrace.state, 'grace');
  assert.equal(inGrace.entitled, true);
  assert.equal(inGrace.graceDaysRemaining, 6);
  assert.ok((inGrace.daysRemaining ?? 0) < 0);

  const after = await verdictFor(token, { clock: clockAt(now + 20 * DAY) });
  assert.equal(after.state, 'expired');
  assert.equal(after.entitled, false);
});

test('a perpetual licence never expires', async () => {
  const token = issueLicense(claimsAt({ expiresAt: null }), keys.privateKeyPem);
  const v = await verdictFor(token, { clock: clockAt(Date.now() + 4000 * DAY) });
  assert.equal(v.state, 'valid');
  assert.equal(v.daysRemaining, null);
});

test('revocation is honoured', async () => {
  const token = issueLicense(claimsAt(), keys.privateKeyPem);
  const v = await verdictFor(token, { revocation: { isRevoked: (id: string) => id === 'lic-0001' } });
  assert.equal(v.state, 'revoked');
  assert.equal(v.entitled, false);
});

test('a revocation source that fails does not revoke', async () => {
  const token = issueLicense(claimsAt(), keys.privateKeyPem);
  const v = await verdictFor(token, {
    revocation: {
      isRevoked() {
        throw new Error('revocation service unreachable');
      },
    },
  });
  assert.equal(v.state, 'valid');
});

test('issueLicense refuses invalid claims', () => {
  assert.throws(() => issueLicense(claimsAt({ graceDays: -1 }), keys.privateKeyPem), /graceDays/);
  assert.throws(() => issueLicense(claimsAt({ issuedAt: 'whenever' }), keys.privateKeyPem), /issuedAt/);
  assert.throws(
    () => issueLicense(
      claimsAt({ notBefore: new Date(Date.now() + DAY).toISOString(), expiresAt: new Date(Date.now()).toISOString() }),
      keys.privateKeyPem,
    ),
    /after notBefore/,
  );
});

test('canonicalization is order-independent and stable', () => {
  const a = canonicalize({ b: 1, a: [3, 2, 1], c: { z: null, y: 'x' } });
  const b = canonicalize({ c: { y: 'x', z: null }, a: [3, 2, 1], b: 1 });
  assert.equal(a, b);
  assert.notEqual(canonicalize({ a: [1, 2] }), canonicalize({ a: [2, 1] }));
});

function gateFor(token: string | null, over: Record<string, unknown> = {}) {
  return createEntitlementGate({
    productId: PRODUCT,
    issuer: ISSUER,
    publicKeysPem: [keys.publicKeyPem],
    token,
    ...over,
  } as Parameters<typeof createEntitlementGate>[0]);
}

test('the gate blocks execution when unlicensed, and says why', async () => {
  const gate = gateFor(null);
  await assert.rejects(
    () => gate.assertEntitled('dispatch repair step', 'execute'),
    (err: unknown) => {
      assert.ok(err instanceof EntitlementError);
      assert.equal(err.state, 'missing');
      assert.equal(err.action, 'dispatch repair step');
      assert.match(err.message, /was not executed/);
      return true;
    },
  );
});

test('reading and observing survive an expired licence', async () => {
  const now = Date.now();
  const token = issueLicense(
    claimsAt({
      notBefore: new Date(now - 400 * DAY).toISOString(),
      expiresAt: new Date(now - 100 * DAY).toISOString(),
      graceDays: 0,
    }),
    keys.privateKeyPem,
  );
  const gate = gateFor(token, { clock: clockAt(now) });

  assert.equal((await gate.status()).state, 'expired');
  await gate.assertEntitled('read incident history', 'read');
  await gate.assertEntitled('emit audit event', 'observe');
  await assert.rejects(() => gate.assertEntitled('dispatch repair step', 'dispatch'), EntitlementError);
});

test('a feature outside the licence is refused', async () => {
  const gate = gateFor(issueLicense(claimsAt({ features: ['siem.export'] }), keys.privateKeyPem));
  assert.equal(await gate.hasFeature('siem.export'), true);
  assert.equal(await gate.hasFeature('repair.dispatch'), false);
  const result = await gate.check('dispatch repair step', 'execute', 'repair.dispatch');
  assert.equal(result.allowed, false);
});

test('describe is safe to log and never leaks the token', async () => {
  const token = issueLicense(claimsAt(), keys.privateKeyPem);
  const line = await gateFor(token).describe();
  assert.match(line, /self-healing-supervisor/);
  assert.match(line, /enterprise/);
  assert.ok(!line.includes(token));
  assert.ok(!line.includes(TOKEN_PREFIX));
});

test('the gate caches and invalidate drops the cache', async () => {
  let calls = 0;
  const revocation = { isRevoked() { calls += 1; return false; } };
  const gate = gateFor(issueLicense(claimsAt(), keys.privateKeyPem), { revocation });
  await gate.status();
  await gate.status();
  assert.equal(calls, 1);
  gate.invalidate();
  await gate.status();
  assert.equal(calls, 2);
});

test('concurrent status calls share one verification', async () => {
  let calls = 0;
  const revocation = {
    async isRevoked() {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return false;
    },
  };
  const gate = gateFor(issueLicense(claimsAt(), keys.privateKeyPem), { revocation });
  await Promise.all([gate.status(), gate.status(), gate.status()]);
  assert.equal(calls, 1);
});

test('the gate refuses construction without an issuer key', () => {
  assert.throws(
    () => createEntitlementGate({ productId: PRODUCT, issuer: ISSUER, publicKeysPem: [], token: null }),
    /public key/,
  );
});

test('the development gate is permissive and names itself as such', async () => {
  const gate = createUnlicensedDevelopmentGate(PRODUCT);
  await gate.assertEntitled('dispatch repair step', 'dispatch');
  assert.match(await gate.describe(), /enforcement disabled/);
});

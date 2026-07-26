import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createEntitlementGate,
  createUnlicensedDevelopmentGate,
  EntitlementError,
  generateIssuerKeyPair,
  issueLicense,
  type PortableLicenseClaims,
} from '../portable-license/index.ts';
import { guardWithEntitlement, unmatchedGuards, type EntitlementRefusal } from '../portable-license/guard.ts';

const ISSUER = 'test-issuer';
const PRODUCT = 'self-healing-supervisor';
const keys = generateIssuerKeyPair();
const DAY = 86_400_000;

function claims(over: Partial<PortableLicenseClaims> = {}): PortableLicenseClaims {
  const now = Date.now();
  return {
    schema: 'portable-license/1',
    licenseId: 'lic-guard',
    issuer: ISSUER,
    licensee: 'Buyer GmbH',
    productId: PRODUCT,
    edition: 'enterprise',
    features: ['repair.dispatch'],
    seats: null,
    maxExecutions: null,
    issuedAt: new Date(now - DAY).toISOString(),
    notBefore: new Date(now - DAY).toISOString(),
    expiresAt: new Date(now + 30 * DAY).toISOString(),
    graceDays: 14,
    ...over,
  };
}

function gateWith(token: string | null) {
  return createEntitlementGate({
    productId: PRODUCT,
    issuer: ISSUER,
    publicKeysPem: [keys.publicKeyPem],
    token,
  });
}

class FakeDispatcher {
  calls: string[] = [];
  label = 'dispatcher';

  async dispatch(planId: string) {
    this.calls.push(`dispatch:${planId}`);
    return `dispatched ${planId}`;
  }

  async status() {
    this.calls.push('status');
    return { pending: 2 };
  }

  async unnamedThing() {
    this.calls.push('unnamedThing');
    return 'ran';
  }
}

const CLASSIFY = {
  dispatch: { actionClass: 'dispatch' as const, feature: 'repair.dispatch' },
  status: 'read' as const,
};

test('a licensed call passes through with its arguments and result intact', async () => {
  const target = new FakeDispatcher();
  const guarded = guardWithEntitlement(target, {
    gate: gateWith(issueLicense(claims(), keys.privateKeyPem)),
    classify: CLASSIFY,
  });
  assert.equal(await guarded.dispatch('plan-7'), 'dispatched plan-7');
  assert.deepEqual(target.calls, ['dispatch:plan-7']);
});

test('an unlicensed call is refused and never reaches the implementation', async () => {
  const target = new FakeDispatcher();
  const guarded = guardWithEntitlement(target, { gate: gateWith(null), classify: CLASSIFY });
  await assert.rejects(() => guarded.dispatch('plan-7'), EntitlementError);
  assert.deepEqual(target.calls, [], 'the refusal must happen before the side effect');
});

test('a read stays available when the licence is missing', async () => {
  const target = new FakeDispatcher();
  const guarded = guardWithEntitlement(target, { gate: gateWith(null), classify: CLASSIFY });
  assert.deepEqual(await guarded.status(), { pending: 2 });
});

test('a licence without the named feature refuses the method that needs it', async () => {
  const target = new FakeDispatcher();
  const guarded = guardWithEntitlement(target, {
    gate: gateWith(issueLicense(claims({ features: ['siem.export'] }), keys.privateKeyPem)),
    classify: CLASSIFY,
  });
  await assert.rejects(
    () => guarded.dispatch('plan-7'),
    (err: unknown) => {
      assert.ok(err instanceof EntitlementError);
      assert.match(err.message, /repair\.dispatch/);
      return true;
    },
  );
});

test('an unnamed method is left alone by default', async () => {
  const target = new FakeDispatcher();
  const guarded = guardWithEntitlement(target, { gate: gateWith(null), classify: CLASSIFY });
  assert.equal(await guarded.unnamedThing(), 'ran', 'silently gating what nobody declared is how a licence check becomes an outage');
});

test('strict mode refuses an unnamed method when unlicensed', async () => {
  const target = new FakeDispatcher();
  const guarded = guardWithEntitlement(target, { gate: gateWith(null), classify: CLASSIFY, strict: true });
  await assert.rejects(() => guarded.unnamedThing(), EntitlementError);
  assert.deepEqual(target.calls, []);
});

test('non-function properties pass through untouched', () => {
  const target = new FakeDispatcher();
  const guarded = guardWithEntitlement(target, { gate: gateWith(null), classify: CLASSIFY });
  assert.equal(guarded.label, 'dispatcher');
  assert.ok(Array.isArray(guarded.calls));
});

test('`this` still resolves inside the guarded method', async () => {
  const target = new FakeDispatcher();
  const guarded = guardWithEntitlement(target, {
    gate: gateWith(issueLicense(claims(), keys.privateKeyPem)),
    classify: CLASSIFY,
  });
  await guarded.dispatch('a');
  await guarded.dispatch('b');
  assert.deepEqual(target.calls, ['dispatch:a', 'dispatch:b']);
});

test('a refusal is reported for audit, with no token in it', async () => {
  const events: EntitlementRefusal[] = [];
  const target = new FakeDispatcher();
  const token = issueLicense(claims({ features: [] }), keys.privateKeyPem);
  const guarded = guardWithEntitlement(target, {
    gate: gateWith(token),
    classify: CLASSIFY,
    onRefusal: (e) => events.push(e),
  });
  await assert.rejects(() => guarded.dispatch('plan-7'));
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, 'entitlement.refused');
  assert.equal(events[0].method, 'dispatch');
  assert.equal(events[0].actionClass, 'dispatch');
  assert.equal(events[0].feature, 'repair.dispatch');
  assert.equal(events[0].licenseId, 'lic-guard');
  assert.ok(!JSON.stringify(events[0]).includes(token));
});

test('an onRefusal that throws does not change the refusal', async () => {
  const guarded = guardWithEntitlement(new FakeDispatcher(), {
    gate: gateWith(null),
    classify: CLASSIFY,
    onRefusal() {
      throw new Error('audit sink is down');
    },
  });
  await assert.rejects(() => guarded.dispatch('plan-7'), EntitlementError);
});

test('no refusal event is emitted when the call is allowed', async () => {
  const events: EntitlementRefusal[] = [];
  const guarded = guardWithEntitlement(new FakeDispatcher(), {
    gate: gateWith(issueLicense(claims(), keys.privateKeyPem)),
    classify: CLASSIFY,
    onRefusal: (e) => events.push(e),
  });
  await guarded.dispatch('plan-7');
  assert.equal(events.length, 0);
});

test('the development gate lets everything through, including strict mode', async () => {
  const guarded = guardWithEntitlement(new FakeDispatcher(), {
    gate: createUnlicensedDevelopmentGate(PRODUCT),
    classify: CLASSIFY,
    strict: true,
  });
  assert.equal(await guarded.dispatch('plan-7'), 'dispatched plan-7');
  assert.equal(await guarded.unnamedThing(), 'ran');
});

test('unmatchedGuards names a rule that guards nothing', () => {
  const target = new FakeDispatcher();
  assert.deepEqual(unmatchedGuards(target, CLASSIFY), []);
  assert.deepEqual(
    unmatchedGuards(target, { dispatch: 'dispatch', dispatchh: 'dispatch', label: 'read' }),
    ['dispatchh', 'label'],
    'a typo is a control that silently does nothing',
  );
});

test('the guard refuses to be constructed with a non-gate', () => {
  assert.throws(
    () => guardWithEntitlement(new FakeDispatcher(), { gate: {} as never, classify: CLASSIFY }),
    /EntitlementGate/,
  );
});

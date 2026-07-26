// saas/tests/pressMediaAcceptance.node.test.ts
//
// Negative by intent. A harness that stays green while the portable invents a
// quote, accepts an unverified contact, or fabricates a proof URL is worse than
// no harness — it converts an unproven deployment into a signed-off one.

import test from 'node:test';
import assert from 'node:assert/strict';

import { runPressAcceptance } from '../press-media-core/acceptance-harness.ts';
import { createRegistry } from '../press-media-core/registry.ts';
import { createFreeSubmissionAdapter } from '../press-media-core/adapters/free-submission.ts';
import type { MediaProviderAdapter, PortBundle } from '../press-media-core/types.ts';

const ADDRESS = 'owner@buyer.example';

const CLEAN_COPY = [
  'ACME GMBH ANNOUNCES AVAILABILITY',
  'Acme GmbH today announced that [PRODUCT NAME] is available to trade customers.',
  'About Acme GmbH: Acme GmbH builds industrial controls.',
].join('\n\n');

interface Recorder {
  sent: Array<{ to: string; subject: string }>;
  notified: string[];
  audited: number;
}

function makePorts(over: Partial<PortBundle> = {}, rec?: Recorder): PortBundle {
  const r = rec ?? { sent: [], notified: [], audited: 0 };
  const base: PortBundle = {
    ai: {
      async generate() {
        return { creative: CLEAN_COPY };
      },
    },
    email: {
      async send(input) {
        r.sent.push({ to: input.to, subject: input.subject });
        return { ok: true };
      },
    },
    notify: {
      async notifyOwner(stage) {
        r.notified.push(stage);
      },
    },
    company: {
      async load() {
        return { brandName: 'Acme GmbH', legalName: 'Acme GmbH', forbiddenClaims: ['market leader'] };
      },
    },
  };
  return { ...base, ...over };
}

function checkFor(result: { checks: Array<{ id: string; passed: boolean; detail: string }> }, id: string) {
  const found = result.checks.find((c) => c.id === id);
  assert.ok(found, `expected a "${id}" check`);
  return found;
}

test('a correctly wired deployment passes every check', async () => {
  const rec: Recorder = { sent: [], notified: [], audited: 0 };
  const result = await runPressAcceptance({ ports: makePorts({}, rec), selfAddress: ADDRESS });

  assert.equal(result.passed, true, result.summary);
  assert.equal(rec.sent.length, 1);
  assert.equal(rec.sent[0].to, ADDRESS, 'the real send must go to the address the caller controls');
  assert.deepEqual(rec.notified, ['submitted']);
  assert.deepEqual(result.placeholdersFound, ['[PRODUCT NAME]']);
});

test('the result is frozen and JSON-serializable — it is evidence', async () => {
  const result = await runPressAcceptance({ ports: makePorts(), selfAddress: ADDRESS });
  assert.ok(Object.isFrozen(result));
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(result)));
  assert.equal(result.schema, 'press-media-acceptance/1');
});

test('it refuses to run without an address the caller controls', async () => {
  const rec: Recorder = { sent: [], notified: [], audited: 0 };
  for (const bad of ['', '   ', 'not-an-address']) {
    const result = await runPressAcceptance({ ports: makePorts({}, rec), selfAddress: bad });
    assert.equal(result.passed, false);
    assert.match(checkFor(result, 'dispatch_delivered').detail, /will not guess a recipient/);
  }
  assert.equal(rec.sent.length, 0, 'nothing may be sent when no recipient was supplied');
});

test('an unregistered provider fails before anything is sent', async () => {
  const rec: Recorder = { sent: [], notified: [], audited: 0 };
  const result = await runPressAcceptance({ ports: makePorts({}, rec), selfAddress: ADDRESS, providerId: 'pr_wire' });
  assert.equal(result.passed, false);
  assert.equal(checkFor(result, 'provider_registered').passed, false);
  assert.equal(rec.sent.length, 0);
});

test('a missing CompanyProfilePort is reported, not tolerated silently', async () => {
  const ports = makePorts();
  delete (ports as Record<string, unknown>).company;
  const result = await runPressAcceptance({ ports, selfAddress: ADDRESS });
  assert.equal(result.passed, false);
  assert.match(checkFor(result, 'buyer_identity_used').detail, /does not know whose company/);
});

test('a CompanyProfilePort that throws does not take the harness down', async () => {
  const result = await runPressAcceptance({
    ports: makePorts({
      company: {
        async load() {
          throw new Error('company record unavailable');
        },
      },
    }),
    selfAddress: ADDRESS,
  });
  assert.equal(checkFor(result, 'buyer_identity_used').passed, false);
  assert.match(checkFor(result, 'buyer_identity_used').detail, /company record unavailable/);
});

test('an invented attributed quote fails — this is the failure that already happened', async () => {
  const result = await runPressAcceptance({
    ports: makePorts({
      ai: {
        async generate() {
          return {
            creative:
              'Acme GmbH today announced availability. "This release changes everything for our customers," said Jane Doe, Chief Executive.',
          };
        },
      },
    }),
    selfAddress: ADDRESS,
  });
  assert.equal(result.passed, false);
  const c = checkFor(result, 'unapproved_quote_absent');
  assert.equal(c.passed, false);
  assert.match(c.detail, /invented/);
});

test('a declared forbidden claim appearing in the copy fails', async () => {
  const result = await runPressAcceptance({
    ports: makePorts({
      ai: {
        async generate() {
          return { creative: 'Acme GmbH, the market leader in industrial controls, announced availability.' };
        },
      },
    }),
    selfAddress: ADDRESS,
  });
  assert.equal(checkFor(result, 'forbidden_claim_absent').passed, false);
});

test('the approved quote used verbatim passes; a different one does not', async () => {
  const company = {
    async load() {
      return { brandName: 'Acme GmbH', approvedQuote: 'We are pleased to serve our customers.' };
    },
  };
  const good = await runPressAcceptance({
    ports: makePorts({
      company,
      ai: {
        async generate() {
          return { creative: 'Acme GmbH announced availability. "We are pleased to serve our customers," said the company.' };
        },
      },
    }),
    selfAddress: ADDRESS,
  });
  assert.equal(checkFor(good, 'unapproved_quote_absent').passed, true);

  const bad = await runPressAcceptance({
    ports: makePorts({
      company,
      ai: {
        async generate() {
          return { creative: 'Acme GmbH announced availability. "A different sentence entirely here," said Jane Doe.' };
        },
      },
    }),
    selfAddress: ADDRESS,
  });
  assert.equal(checkFor(bad, 'unapproved_quote_absent').passed, false);
});

test('an adapter that accepts an unverified contact fails the check', async () => {
  const permissive: MediaProviderAdapter = {
    ...createFreeSubmissionAdapter(),
    async validateTarget() {
      return { ok: true };
    },
  };
  const result = await runPressAcceptance({
    ports: makePorts(),
    selfAddress: ADDRESS,
    registry: createRegistry(permissive),
  });
  assert.equal(checkFor(result, 'unverified_target_refused').passed, false);
  assert.equal(checkFor(result, 'invalid_contact_refused').passed, false);
});

test('a transport that rejects the message fails dispatch and says so', async () => {
  const result = await runPressAcceptance({
    ports: makePorts({
      email: {
        async send() {
          return { ok: false };
        },
      },
    }),
    selfAddress: ADDRESS,
  });
  assert.equal(checkFor(result, 'dispatch_delivered').passed, false);
});

test('a transport that throws is reported, not propagated', async () => {
  const result = await runPressAcceptance({
    ports: makePorts({
      email: {
        async send() {
          throw new Error('SMTP refused the connection');
        },
      },
    }),
    selfAddress: ADDRESS,
  });
  assert.equal(checkFor(result, 'dispatch_delivered').passed, false);
  assert.match(checkFor(result, 'dispatch_delivered').detail, /SMTP refused/);
});

test('delivery is recorded only after the buyer transport accepts it', async () => {
  // The false-pass this project has already built once: recording before
  // awaiting the real send makes an unreachable recipient look reached.
  let resolveSend: (v: { ok: boolean }) => void = () => {};
  const pending = new Promise<{ ok: boolean }>((r) => {
    resolveSend = r;
  });
  const run = runPressAcceptance({
    ports: makePorts({
      email: {
        async send() {
          return pending;
        },
      },
    }),
    selfAddress: ADDRESS,
  });
  resolveSend({ ok: false });
  const result = await run;
  assert.equal(checkFor(result, 'dispatch_delivered').passed, false);
});

test('a fabricated proof URL fails', async () => {
  const fabricating: MediaProviderAdapter = {
    ...createFreeSubmissionAdapter(),
    async fetchProof() {
      return { proofType: 'maybe_url', payload: { url: 'https://example.com/published' }, pending: false };
    },
  };
  const result = await runPressAcceptance({
    ports: makePorts(),
    selfAddress: ADDRESS,
    registry: createRegistry(fabricating),
  });
  const c = checkFor(result, 'proof_not_fabricated');
  assert.equal(c.passed, false);
  assert.match(c.detail, /before any publication was confirmed/);
});

test('the shipped adapter keeps proof pending', async () => {
  const result = await runPressAcceptance({ ports: makePorts(), selfAddress: ADDRESS });
  assert.equal(checkFor(result, 'proof_not_fabricated').passed, true);
});

test('an owner notification that never happens fails', async () => {
  const silent: MediaProviderAdapter = {
    ...createFreeSubmissionAdapter(),
    async dispatch(campaign, ports) {
      await ports.email.send({ to: String(campaign.target.editorEmail), subject: 's', html: 'h' });
      return { state: 'submitted', ref: 'x' };
    },
  };
  const result = await runPressAcceptance({
    ports: makePorts(),
    selfAddress: ADDRESS,
    registry: createRegistry(silent),
  });
  assert.equal(checkFor(result, 'owner_notified').passed, false);
});

test('no audit sink is a supported configuration; a broken one is not', async () => {
  const none = await runPressAcceptance({ ports: makePorts(), selfAddress: ADDRESS });
  assert.equal(checkFor(none, 'audit_sink_reachable').passed, true);

  const broken = await runPressAcceptance({
    ports: makePorts({
      audit: {
        async record() {
          throw new Error('collector unreachable');
        },
      },
    }),
    selfAddress: ADDRESS,
  });
  assert.equal(checkFor(broken, 'audit_sink_reachable').passed, false);

  let recorded = 0;
  const working = await runPressAcceptance({
    ports: makePorts({
      audit: {
        async record() {
          recorded += 1;
        },
      },
    }),
    selfAddress: ADDRESS,
  });
  assert.equal(checkFor(working, 'audit_sink_reachable').passed, true);
  assert.equal(recorded, 1);
});

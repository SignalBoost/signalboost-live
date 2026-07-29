<!-- docs/portables/self-healing-technical-walkthrough.md -->

# Self-Healing Supervisor — hands-on walkthrough

**For an engineer who wants to run it rather than read about it.**
**Time: about 30 minutes. Offline. Nothing touches your infrastructure.**

By the end you will have installed the package, written a host adapter, watched a
consequential step refuse to execute, and — most usefully — **watched the product catch you
when you deliberately break its safety property.**

Nothing here calls a provider, sends an email, or writes to a database unless you make it.

---

## What you are testing

The claim: **no consequential step executes without a named human approving it.** Everything
else this product does is in service of that.

The design that makes it testable: the portable supplies behaviour, you supply infrastructure
through a `HostContext`. There is no vendor service in the path, so a full run happens on your
laptop with no account anywhere.

---

## Prerequisites

Node 22 or newer. That is the whole list.

```bash
node --version   # v22 or above
```

---

## Step 1 — build the package

From the repository:

```bash
cd saas
node scripts/build-portable.mjs
cd dist/portable && npm pack
```

You get `signalboost-self-healing-supervisor-1.0.0.tgz`, roughly 116KB.

The build prints its own boundary check. Note the last line: **external dependencies: none**.
The payload uses Node built-ins only. If that ever reports a third-party package, the build
fails rather than shipping it — a payload needing someone else's runtime is not portable, and
the script treats that as an error rather than a warning.

## Step 2 — install it somewhere scratch

```bash
mkdir /tmp/supervisor-trial && cd /tmp/supervisor-trial
npm init -y
npm pkg set type=module
npm install /path/to/signalboost-self-healing-supervisor-1.0.0.tgz
```

## Step 3 — write the host adapter

This is the entire integration surface. In production these point at your vault, your
datastore, your Slack or ServiceNow, your identity provider. For the trial they print to the
console.

Create `host.mjs`:

```js
// host.mjs — the buyer-supplied boundary, trial version
import { createStaticApproverDirectory } from '@signalboost/self-healing-supervisor'

const secrets = new Map([['provider-token', 'not-a-real-token']])

export const host = {
  secrets: {
    async resolve(ref) {
      const value = secrets.get(ref)
      if (!value) throw new Error(`unknown secret: ${ref}`)
      return value
    },
  },

  // In production: email, Slack, Teams, ServiceNow, PagerDuty.
  notifications: {
    async notify(notification) {
      console.log('\n--- NOTIFICATION ---')
      console.log('to:      ', notification.recipient?.address ?? '(directory default)')
      console.log('title:   ', notification.title)
      console.log('category:', notification.category)
      console.log('reason:  ', notification.reason)
      console.log('--------------------\n')
    },
  },

  // In production: Okta, Entra, or your own directory.
  approvers: createStaticApproverDirectory({
    fallback: [{ id: 'oncall', address: 'oncall@example.test', displayName: 'On-call' }],
  }),

  branding: {
    productName: 'Trial Supervisor',
    locale: 'en',   // try 'pt-BR', 'es', 'pl' or 'ru' at step 6
  },
}
```

## Step 4 — run the acceptance scenario

This is the product's own conformance test, and it runs against **your** adapter rather than a
mock. Create `run.mjs`:

```js
import { runAcceptanceScenario } from '@signalboost/self-healing-supervisor'
import { host } from './host.mjs'

const result = await runAcceptanceScenario({ host, dangerousCategory: 'credential_security' })

console.log('passed:', result.passed)
for (const check of result.checks) {
  console.log(check.passed ? 'PASS' : 'FAIL', check.title, '—', check.detail)
}
```

```bash
node run.mjs
```

Expect five checks, all passing, and one notification printed to your console. Read them:

- a safe step executed without asking anyone
- **a consequential step paused instead of executing**
- the right approver was notified through your channel
- the notification carries your product name, not the vendor's
- the run produced an audit trail

## Step 5 — the test that actually matters

A passing test proves little unless you have seen it fail. So break the safety property on
purpose and confirm the harness catches you.

**There is deliberately no option to make the dangerous step execute.** The harness exposes a
`safeStepRunner` and nothing equivalent for the consequential step, because a supported switch
for "run the dangerous thing anyway" would be a supported way to defeat the product. So the
negative control is a source edit.

In your checkout of the repository, weaken the gate — in `lib/supervisor/policy-engine.ts`,
make the classifier return a non-consequential verdict for the credential-security category —
then rebuild the package and re-run step 4.

Expect `passed: false`, with the failing check naming the property that was violated: a
consequential step executed instead of pausing. Then revert.

We ran this exercise against the entitlement layer while building it: disabling the refusal
branch turned seven of ten licence tests red. A test suite that stays green when you remove
the thing it tests is measuring nothing, and that applies to ours as much as anyone's.

This is also the check we would most like you to attempt independently, without our
instructions: **find any path where a consequential step executes without a named human.**
If you find one, that finding is worth more to us than the rest of this evaluation.

## Step 6 — change the language

Set `locale: 'pt-BR'` in `host.mjs` and re-run step 4. The notification, the reason, the
category label and the step descriptions come back in Portuguese. `es`, `pl` and `ru` likewise.

Then confirm the part that matters to your SIEM: **the audit event types and step ids are
unchanged.** Translation applies to what people read, never to what machines parse.

## Step 7 — send a real incident through the intake path

The scenario above starts from a synthetic incident. To exercise authentication, deduplication
and triage, post a signed envelope instead:

```js
import { signIntakeRequest, SIGNATURE_HEADER, TIMESTAMP_HEADER } from '@signalboost/self-healing-supervisor'

const secret = 'a-secret-at-least-16-chars'
const body = JSON.stringify({
  schemaVersion: 'supervisor-incident-intake-v1',
  provider: 'trial',
  errorMessage: 'Checkout service returning 503',
  environment: 'staging',
  severity: 'critical',
  detectedAt: new Date().toISOString(),
  dedupeKey: 'trial-1',
})
const timestamp = Math.floor(Date.now() / 1000)
const headers = {
  'content-type': 'application/json',
  [TIMESTAMP_HEADER]: String(timestamp),
  [SIGNATURE_HEADER]: signIntakeRequest(secret, timestamp, body),
}
```

Worth attacking here: replay the same request with a fresh timestamp (the timestamp is inside
the signed material, so it should fail), tamper with one byte of the body, send a stale
timestamp beyond the 300-second window, and send the same `dedupeKey` twice.

---

## What you will not see, and why

**No repair executes.** The product ships no execution runner — repair steps run through code
your team supplies. Without one, a run receives, diagnoses, gates, verifies and audits, then
reports honestly that nothing was repaired rather than claiming a fix. That is deliberate: we
do not ship code that touches your systems.

**Deduplication is in-memory by default.** The trial adapter uses the in-memory stores. On a
host that starts a fresh process per request, deduplication will not survive between them.
`DedupeStore` and `IncidentRecordStore` are exported interfaces; a durable implementation is
yours to supply, and that is the same substitution you would make for the dispatch ledger.

---

## Where to look in the source

| Path | What it is |
| --- | --- |
| `lib/supervisor/portable/host-context.ts` | The whole injection surface, in one file |
| `lib/supervisor/policy-engine.ts` | Where a step becomes "consequential" |
| `lib/supervisor/portable/acceptance-harness.ts` | The scenario you just ran |
| `portable-license/enforce.ts` | Entitlement at the execution boundary, not at a UI |
| `self-healing-host/` | A full reference adapter — what your production version replaces |

## Then read

`self-healing-integration-guide.md` for the interfaces in production terms, and
`self-healing-evaluation-brief.md` for what we would most like you to attack and where we
already know the product is weak.

<!-- docs/portables/press-media-integration-guide.md -->
# Press & Media — Enterprise Integration Guide

**Release:** `1.0.0-rc.1` design-partner evaluation
**Package:** `@portable/press-media`
**Payload:** three roots — `press-media-core` (the portable), `portable-kernel` (company identity and factual discipline), `portable-audit` (the SIEM event shape). All three ship together; the core reaches the other two by relative path.

The portable runs inside the buyer's environment. It supplies bounded product behaviour — provider registry, five adapter shapes, and the factual-discipline kernel. The buyer supplies AI, email, notification, HTTP, execution, company identity, audit transport, publication discovery, and every provider account.

Nothing in the archive contains or requires a build-platform account, and the graph walk that produces the release reports **zero** host fallbacks: the buyer surface has no bare or aliased imports at all. Everything it needs arrives through ports.

---

## 1. Canonical buyer entry point

```ts
import {
  createDefaultMediaRegistry,
  createPrWireAdapter,
  createMediaDatabaseAdapter,
  findPublications,
  leadToTarget,
  runPressAcceptance,
} from '@portable/press-media'
```

`createDefaultMediaRegistry()` returns a registry with the free-submission adapter already registered. Paid adapters are added by the host:

```ts
const registry = createDefaultMediaRegistry()
registry.register(createPrWireAdapter())
registry.register(createMediaDatabaseAdapter())
```

Two subpath entries exist for the shared layers: `@portable/press-media/kernel` and `@portable/press-media/audit`.

## 2. Buyer-provided boundaries

| Port | Required | Buyer implementation |
| --- | --- | --- |
| `ai` | yes | `generate(brief, spec)` against the buyer's own model and key |
| `email` | yes | `send({ to, subject, html })` through the buyer's transport |
| `notify` | yes | `notifyOwner(stage, campaign, proof?)` — two-stage: submitted/scheduled now, published when the provider confirms |
| `http` | for API adapters | `fetchJson(url, init?)` |
| `runner` | for paid providers | `run(providerId, action, variables)` and `loadConfig(providerId)` against the buyer's provider registry and secret store |
| `company` | strongly recommended | `CompanyProfilePort` — whose facts the AI is permitted to state |
| `audit` | for SOC 2 / ISO 27001 | `PortableAuditSink` — omitted means no audit trail |
| `discovery` | optional | `findPublications(query)` — omitted means targets must be supplied by hand |
| `config` | per provider | the buyer's connected credentials for that provider |

An omitted optional port is reported honestly and never simulated. Discovery in particular refuses with a message naming what to connect rather than returning an empty list that reads like "no publications exist".

## 3. Providers are categories, not vendor SDKs

The portable ships **five adapter shapes**, not integrations:

| Adapter | Covers | Behaviour |
| --- | --- | --- |
| `free_submission` | editorial submission by email or web form | requires a supplied editor address; refuses a target without one |
| `pr_wire` | Business Wire, PR Newswire, EIN Presswire, GlobeNewswire, PRWeb | distribution with a report as proof |
| `media_database` | Cision, Muck Rack, Meltwater, Prowly, Agility PR | **verifies** a contact it is handed; deliberately does not dispatch |
| `ad_platform` | paid placement | insertion-order cost model |
| `direct_io` | a publication the buyer already has a relationship with | |

**An adapter never hand-rolls HTTP and never touches a credential.** It names a registered action — `submit_release`, `fetch_report`, `verify_contact` — and the host runs it through the runner port with the buyer's provider configuration and secret resolution.

The practical consequence for procurement: **adding a wire brand is a registry row, not code.** The answer to "which vendors do you support?" is "whichever you already pay for."

Note for buyers whose PR is agency-run: the licence for Cision or Meltwater frequently sits with the agency rather than the brand. That is expected, and it is why `free_submission` is a first-class adapter rather than a fallback.

## 4. The factual-discipline kernel

This portable's risk is **reputational, not operational**. A fabricated product name or invented quote goes out under the buyer's name to a real editor, and there is no rollback. The kernel exists for that specific failure, and it has fired on a real one — an invented product name reached generated copy during development.

Three rules the engine enforces regardless of what the model produces:

1. **Only declared company facts may be stated.** The employer comes from `CompanyProfilePort`; the engine never assumes one.
2. **Declared forbidden claims are matched exactly** — deterministic string matching, not a judgement about tone.
3. **No approved quote means no quote at all.** A quote attributed to a named person requires an `approvedQuote`; absent one, none is emitted.

Proof is never fabricated. When a provider has not confirmed publication, `fetchProof` stays pending and returns no URL.

## 5. Discovery

```ts
const result = await findPublications(ports, {
  region: 'United States',
  targetType: 'trade_press',
  topic: 'industrial automation',
  limit: 20,
})
```

Leads are normalised and deduplicated by contact. A lead with an `email` method and no valid address, or an `online_form` method and no http(s) URL, is **rejected at validation** rather than failing later with a confusing provider error.

`leadToTarget(lead)` converts a lead into a dispatchable target. The separation is deliberate: **a lead is a suggestion, a target is something the engine will actually email, and a person decides which leads cross that line.** Discovery contacts nobody and queues nothing.

`paid` defaults to false — editorial desks only (`editor@`, `newsroom@`, `press@`, `submissions@`), with advertising, sponsorship and sales addresses excluded.

## 6. Sender identity

The buyer sets their own; nothing about the build platform's addressing reaches a buyer install.

| Variable | Purpose |
| --- | --- |
| `RESEND_FROM_EMAIL` | the From identity (or the equivalent for the buyer's transport) |
| `PRESS_REPLY_TO` | preferred reply address |
| `PRESS_CONTACT_EMAIL` | address printed in the media-contact block |

Every press email ends with a **media contact block** — brand name, a monitored reply address, and the website — appended before the signature and skipped when the copy already contains that address. Reply-To and the printed contact always point at the same inbox.

One operational warning worth stating plainly, because it has already caused a rejected send: **the From address must be verified with the mail provider.** A plausible-looking alias that was never verified fails outright at send time, not at configuration time.

## 7. Acceptance

```ts
const record = await runPressAcceptance({ ports, selfAddress, registry })
```

Eleven independently reported checks against the buyer's own port bundle: provider registered, buyer identity used, unverified target refused, invalid contact refused, generation used buyer AI, forbidden claim absent, unapproved quote absent, dispatch delivered, owner notified, proof not fabricated, audit sink reachable. It never throws, and returns a frozen, JSON-serialisable `press-media-acceptance/1` record.

Two safety properties:

- It sends **one real email** to a `selfAddress` the buyer controls, and **refuses to run without one.** It never reads a target from a media database. The send is real because a stubbed transport proves nothing about whether the buyer's mail actually leaves.
- Delivery is recorded only **after** the buyer's `EmailPort` resolves. Recording first and delivering second produces a green record for mail that never left, which is a failure this project has seen and pinned with a test.

A CLI runner is included for pipelines:

```
node scripts/run-press-acceptance.mjs <ports-module> --self <address>
```

Exit 0 only when every check passes. It supplies no default ports — a default would test the vendor's wiring instead of the buyer's.

## 8. What is not included

- Any press, wire, media-database or advertising account. The portable knows the shape of those providers; the relationship is the buyer's.
- An AI provider or model. Generation happens through the buyer's `AiPort`.
- An email transport. The payload composes; the buyer's `EmailPort` delivers.
- A datastore. Campaign persistence belongs to the buyer's host layer.
- Any credential.

## 9. Boundary enforcement

The release is built by walking the real import graph from the declared entry points — not from a hand-written file list — and **refuses to ship** if the graph reaches anything the spec did not declare. `hostFallbacks` and `knownNamingExceptions` are both empty and verified empty by that walk. If either ever reports an entry, something host-coupled has been added to the core and the release stops.

Each release carries `SHA256SUMS`, a CycloneDX 1.5 SBOM, and release notes.

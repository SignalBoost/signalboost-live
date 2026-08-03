<!-- docs/portables/browser-agent-integration-guide.md -->
# Browser Agent Ecosystem — Enterprise Integration Guide

**Release:** `1.0.0-rc.1` design-partner evaluation
**Package:** `@portable/browser-agent`
**Payload:** one root, `lib/portable-browser` — 102 modules, two entry points, zero dependencies.

Bring your own browser stack. Twenty-six vendor adapters run over one audited path; four of them
work on credentials alone. You supply the vendor account and the credential, and for the
WebDriver family you supply nothing else.

---

## 1. Entry points

```ts
import {
  createBrowserStackTransport,
  createBrowserstackSessionFactory,
  createBrowserActivitySink,
  runBrowserAcceptance,
} from '@portable/browser-agent'

import { denyAllBrowserPolicyPort } from '@portable/browser-agent/testing'
```

Two entries. `.` is the product. `./testing` holds test doubles, kept separate so nothing
production-bound reaches them by accident. Start from the deny-all ports: a policy that refuses
everything makes your first act an explicit *allow*, rather than discovering later that nothing
was ever refused.

## 2. The four vendors that need only credentials

BrowserStack, Sauce Labs, LambdaTest and any Selenium Grid all speak **W3C WebDriver**, so one
shipped transport covers them — and a fifth the day you stand up your own grid.

```ts
const transport = createBrowserStackTransport({
  hubEndpoint: 'https://hub.browserstack.com/wd/hub',
  username: 'your_account_user',
  browserName: 'chrome',
})

const factory = createBrowserstackSessionFactory({
  configuration: { hubEndpoint: 'https://hub.browserstack.com/wd/hub' },
  approvedOrigins: ['https://app.yourcompany.com'],
  credentialBroker: yourVaultBroker,   // resolves the access key per launch
  transport,
})
```

Three behaviours worth knowing, because each one is a defect we have already seen elsewhere:

- **Ending a session is reported, never swallowed.** A remote session bills by the minute and
  outlives your process. A silent close failure is a line on your invoice.
- **The page address is read back from the browser** after navigation, not remembered locally.
  If the site redirected, you see where the browser actually is — which is what an approval
  decision turns on.
- **Filling a field clears it first.** WebDriver appends; filling a pre-populated field twice
  otherwise produces a silently doubled value.

`createSeleniumGridTransport` takes no username, because an internal grid usually has no
authentication and demanding a credential where none exists blocks an integration rather than
securing it.

## 3. The other twenty-two vendors

Browserbase, Steel, Browserless, Hyperbrowser, Firecrawl, Notte, Skyvern, Stagehand,
browser-use, agent-browser, Apify, Bright Data, Oxylabs, AWS AgentCore, Azure Playwright,
UiPath, Power Automate, Automation Anywhere, Playwright MCP, a private fleet, and a custom
adapter for anything unlisted.

For these you implement one interface:

```ts
const transport = {
  async openSession({ configuration, credential }) {
    // your call to the vendor, returning a session with a page and a close()
  },
}
```

**Stated plainly rather than buried:** those protocols are partner-gated or undocumented, and
inventing twenty-two vendor clients we could not verify against a real account would be worse
than asking for a transport. The governance around the call — configuration validation,
per-launch credential resolution, origin enforcement, scope checks, error sanitisation — is
ours and applies identically to all twenty-six.

Playwright and Puppeteer are **local engines**, served by `playwright-local-adapter` rather than
a remote adapter. They are not a gap.

## 4. What every adapter enforces

| Rule | Behaviour |
| --- | --- |
| Scope | The launch request's provider and adapter must match this adapter |
| Mode | `execute_change` is refused. Observation and preparation only |
| Origins | Allowlist non-empty, exact origins only — no wildcards, paths, or embedded credentials |
| Transport | Plaintext `http` confined to loopback, so a production origin cannot be downgraded |
| Credentials | Resolved from your vault per launch, never retained, never in configuration |
| Errors | Every failure passes through a sanitiser with the live credential registered |

Failures throw stable `<adapter>_*` codes. Read them as a set in `remote-adapter-kit.ts` — they
are the contract with your integration team.

**A wildcard origin is refused.** `https://*.yourcompany.com` parses as a valid URL, so it used
to be accepted and then matched nothing — you would believe a domain was covered while no
request was ever approved against it. It now refuses at configuration time.

## 5. Where activity is recorded

A declared catalog, not a hardcoded vendor. Eleven destinations are pre-staged:

**PostgreSQL, MySQL/MariaDB, SQL Server, Oracle, Snowflake, Supabase, Splunk HEC, Datadog,
Elasticsearch/OpenSearch, a generic webhook, and in-memory** for evaluation.

```ts
const sink = createBrowserActivitySink('postgres', { table: 'browser_activity' }, { sql: yourSqlPort })
```

You supply one of two primitives — `http.send` or `sql.execute` — so the payload contains no
database driver, no HTTP client and no SDK. Something unlisted? `registerBrowserActivitySink()`
declares your own, and it may override one of ours.

Every SQL value is a bound parameter; the table name is validated against a strict pattern
because it is the one identifier that cannot be bound. Endpoints must be https, and a non-2xx
response throws rather than being swallowed — a sink that fails quietly reads as an absence of
activity.

## 6. Acceptance

```ts
const record = await runBrowserAcceptance({
  adapterId: 'browserstack',
  buildSessionFactory: createBrowserstackSessionFactory,
  configuration: { hubEndpoint: 'https://hub.browserstack.com/wd/hub' },
  transport,
  credentialBroker,
  probeOrigin: 'https://app.yourcompany.com',
})
```

Fourteen checks against **your** stack. Nine assert a refusal — the harness hands the adapter
material it must reject and fails if it is accepted.

The one to point a security reviewer at: it builds a factory whose transport throws **with a
live credential in the message**, and fails if that credential appears in the error. That proves
the sanitiser is in the path rather than in a document.

For pipelines:

```
node scripts/run-browser-acceptance.mjs ./your-ports.mjs --adapter browserstack --probe https://app.yourcompany.com
```

Exit 0 all pass, 1 a check failed, 2 could not run. It prints a separate **STOP** line if the
credential check fails, because that one means live credentials would reach your log aggregator.

## 7. What is not included

- Any browser vendor account, subscription or credential.
- A browser engine, a driver, an HTTP client or a database driver. No runtime dependency at all.
- `execute_change` execution. This release observes and prepares.
- A hosted database, vault, network transport or SIEM.
- Transports for the twenty-two vendors whose protocols are not publicly documented.

## 8. Boundary enforcement

The release is built by walking the real import graph from both entry points and **fails if the
graph reaches anything undeclared**. Host fallbacks and vendor-name exceptions are both empty
and verified empty by that walk: **no external package, no environment read, no import above the
portable root.**

Each release carries `SHA256SUMS`, a CycloneDX 1.5 SBOM, and release notes. Node.js 20 and 22
LTS, TypeScript 5.x, no native modules. The payload owns no schema and holds no state, so an
upgrade migrates nothing and a rollback restores an archive.

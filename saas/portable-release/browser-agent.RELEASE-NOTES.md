<!-- saas/portable-release/browser-agent.RELEASE-NOTES.md -->

# Browser Agent Ecosystem — `1.0.0-rc.1`

Design-partner evaluation release. Packaging and boundary integrity are verified; buyer
deployment acceptance is not, and that is what keeps this at `-rc`.

## What this release is

A buyer brings whichever browser stack they already own — a testing grid, an RPA platform, a
managed session vendor, an agent-loop tool, or a fleet they run themselves — and this portable
supplies the part that has to be right around it: configuration validated against each vendor's
declared contract, a credential resolved from their vault per launch and never retained, an
origin allowlist they declare, read-only execution, and error text with every credential
stripped out of it.

**Twenty-six vendor adapters** over one audited path. The twenty-seventh catalog entry is the
Playwright/Puppeteer local-engine pair, served by the local adapter rather than the remote kit.

## What changed to make it packageable

This release exists because the portable could not previously have been installed by anyone.

**Four things reached outside the folder the packager copies**, and every one was removed
rather than declared as a dependency:

- A Supabase SDK import and three environment reads, in the module that recorded activity. The
  destination is now a **declared catalog of eleven** — PostgreSQL, MySQL/MariaDB, SQL Server,
  Oracle, Snowflake, Supabase over REST, Splunk HEC, Datadog, Elasticsearch/OpenSearch, a
  generic webhook, and in-memory for evaluation — reached through the buyer's own `http.send` or
  `sql.execute` primitive. A buyer with something else registers their own declaration, and it
  may override a pre-staged one.
- Two modules in `lib/browser-runtime` that **ten adapters** imported. Moved in; the old paths
  re-export them, so the host depends on the portable and never the reverse.
- One wide type imported for a single string field. Replaced with the shape actually used.

The payload now has **no external package, no environment read, and no import above its own
root**.

## Two corrections worth reading before you evaluate

**`executionBoundary` said `sandbox_loopback_only`.** It had said so since the origin posture
changed in July, while the code accepted buyer production origins the whole time. A reviewer
reading that field would have concluded the adapters can only drive localhost — which would
make the product useless to them — and concluded it from our own metadata. It now reads
`buyer_declared_origins`.

**Nine adapters were four-line stubs** whose `create()` returned `never` and whose status
published `requiredPorts: []` — a claim that a buyer needed nothing, which was false and
unhelpful at once. All nine were rebuilt on the shared kit, and eight further catalog vendors
that had no adapter file at all were built.

## What every adapter enforces

| Rule | Behaviour |
| --- | --- |
| Scope | The launch request's provider and adapter must match this adapter |
| Mode | `execute_change` is refused. Observation and preparation only |
| Origins | Allowlist non-empty, exact origins only, no wildcards, paths or embedded credentials |
| Transport security | Plaintext `http` confined to loopback, so a production origin cannot be downgraded |
| Credentials | Resolved per launch from the buyer's vault, never retained, never in configuration |
| Errors | Every failure passes through the sanitizer with the live credential registered |

Failures throw stable `<adapter>_*` codes. Those codes are the contract with an integration
team and are worth reading as a set in `remote-adapter-kit.ts`.

## Verification in this release

- Import graph walked from both entry points: **103 modules, zero external specifiers**.
- Twenty-six adapter factories and twenty-six status objects exported and counted.
- A buyer production origin opens; undeclared origin, `execute_change`, wrong adapter scope,
  plaintext non-loopback origin, each missing required key, and a missing credential broker each
  refuse by name.
- The three credential-optional vendors open with no credential and report
  `requiredPorts: ['transport']`.
- A transport error containing a live credential came back as `token [redacted] rejected`.
- Eleven activity destinations build; a table name of `activity; DROP TABLE users`, a plaintext
  endpoint, and credentials embedded in a URL are each refused.

## Known limitations

- **No acceptance harness yet.** Every other finished portable here ships one that runs against
  the buyer's own ports and produces a retained record. This is the gap that keeps the release
  at `-rc`, and it is the next thing to build.
- Adapters are configuration and governance around a call the buyer implements. The vendor HTTP
  request is theirs by design — inventing twenty-six vendor protocols we could not verify would
  be worse than asking for a transport.
- `execute_change` is disabled in this release for every vendor.
- No buyer document set yet: no integration guide, presentation, runbook, support framework or
  security statement.

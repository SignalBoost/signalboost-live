<!-- docs/portables/buyer-package/browser-agent-presentation.md -->

# Browser Automation Governor Software — Buyer Evaluation

**Release:** `1.0.0-rc.1` design-partner evaluation
**Package:** `@portable/browser-agent`

> **Before sending this document, fill in:** [SET price], [SET pilot length], [SET pilot fee],
> and the contact line at the end.

---

## 1. The problem

Browser automation inside an enterprise fails in a particular way: **it works, and then nobody
can say what it did.**

A script drives a browser against an internal application. It holds a credential. It can reach
any address the network allows. It runs unattended. And when someone asks — six months later,
usually during an audit or an incident — *which systems did it touch, with whose credential, and
who approved that* — the honest answer is a log file, if anyone kept one.

Meanwhile the credential is in the script, the allowed destinations are wherever the code
happens to navigate, and the person who wrote it has left.

## 2. What it is

The governed layer around whichever browser stack you already own. It does not replace
BrowserStack or your Selenium Grid — it puts a boundary around them:

- the destinations a session may reach, declared by you and enforced on every launch
- the credential, resolved from your vault per launch and never retained
- a read-only execution posture
- error text with every credential stripped out of it
- an activity record written to a destination you choose

**Twenty-six vendors are pre-staged. Four work on credentials alone.**

## 3. Four vendors, one protocol, no code from you

BrowserStack, Sauce Labs, LambdaTest and any Selenium Grid all speak the same open standard —
W3C WebDriver. So a single shipped implementation covers all four, and a fifth the day you stand
up your own grid.

You type a hub address, a user name, and point it at your vault. Nothing else.

**The other twenty-two require you to supply the vendor call**, and we would rather say so here
than have you find it during integration. Their protocols are partner-gated or undocumented, and
a vendor client we could not verify against a real account would be worse than an honest gap.
Everything around the call — validation, credentials, origin enforcement, sanitisation — is ours
either way.

## 4. The rule the design turns on

> **The allowlist is the cage.**

You declare the exact addresses a session may reach. Not a pattern, not a domain — exact
origins. Anything else is refused before the browser starts.

That includes wildcards, and there is a story behind it. `https://*.yourcompany.com` parses as a
valid URL, so it was accepted and then matched nothing — a buyer writing it would believe a whole
domain was covered while no request was ever approved against it. Our own acceptance harness
found that on its first run. It now refuses at configuration time, which is when you can do
something about it.

## 5. What your security review will ask, answered

| Question | Answer |
| --- | --- |
| Where do credentials live? | Your vault. Resolved per launch, never retained, never in configuration. |
| Can a session reach something we did not approve? | No. Non-empty allowlist of exact origins, checked on every launch. |
| Can it write? | No. `execute_change` is refused by every adapter in this release. |
| Can a credential end up in a log? | Every failure passes through a sanitiser, and acceptance proves it with a live credential. |
| Where does the audit trail go? | A destination you choose from eleven, or one you declare. |
| What does the payload depend on? | Nothing. No package, no environment variable, no import outside its own folder. |

## 6. Activity records go where you already look

Eleven destinations pre-staged: **PostgreSQL, MySQL, SQL Server, Oracle, Snowflake, Supabase,
Splunk, Datadog, Elasticsearch/OpenSearch, a generic webhook**, and in-memory for evaluation.

You supply one primitive — send a request, or run a statement — so the product carries no
database driver and no SDK. Anything unlisted, you declare, and your declaration can override
ours.

## 7. Acceptance runs in your environment, against your stack

Fourteen checks. **Nine assert a refusal** — the harness hands the adapter material it must
reject and fails if it is accepted: an empty allowlist, a wildcard, an origin carrying a path or
credentials, a plaintext address, a missing configuration key, a missing vault broker, an
undeclared origin at launch, a write attempt, and a request addressed to a different adapter.

The rest come from one real session on a stack you nominate: your transport was used, your vault
was called exactly once for that launch, and — the one to watch — **a live credential does not
survive into an error message.** The harness deliberately makes the vendor fail with the key in
the message and checks it comes back redacted.

Result: a signed, JSON-serialisable record with its own hash. Keep it. That is your acceptance
evidence.

## 8. What it does not do

- No browser vendor account, subscription or credential is included.
- No writes, in any mode, in this release.
- No transports for the twenty-two vendors whose protocols are not published.
- Playwright and Puppeteer are local engines served by the local adapter, not remote vendors.
- No database, vault, network transport or SIEM.

## 9. The portability claim, verified rather than asserted

Each release is built by walking the real import graph from both entry points and **fails if it
reaches anything undeclared**. Verified empty: no external package, no environment read, no
import above the portable's own folder.

Every archive carries `SHA256SUMS`, a CycloneDX 1.5 SBOM and release notes. The payload owns no
schema and holds no state, so an upgrade migrates nothing and a rollback is restoring the
previous archive.

## 10. Editions and commercials

| | Evaluation | Production |
| --- | --- | --- |
| Vendor adapters | 26 | 26 |
| Credential-only vendors | 4 | 4 |
| Activity destinations | 11 + your own | 11 + your own |
| Acceptance harness and CLI | included | included |
| `execute_change` | disabled | on roadmap, not shipped |
| Price | [SET price] | [SET price] |

**Pilot:** [SET pilot length] at [SET pilot fee] — installation into one environment, one
acceptance run against a stack and origin you nominate, and one live session against an internal
application you choose.

Source delivery makes licence enforcement contractual rather than technical. We state that
plainly rather than implying a protection that does not exist.

## 11. Next steps

1. A technical session against the integration guide — about an hour with whoever owns your
   browser tooling and your secret store.
2. Installation into one non-production environment.
3. An acceptance run against your stack. Fourteen checks, one record.
4. One live session against an application you choose, on origins you declare.

Contact: [SET name, title, email]

<!-- docs/portables/provider-hub-operations-runbook.md -->

# Provider Hub — operations runbook

Written for the team that will install this and be on the hook for it. Every step
is something you can do from the archive you were given; where a step depends on
your own infrastructure, it says so.

## What you are installing

Four TypeScript modules that run inside your environment: connection metadata,
a bounded live-data read adapter, the evidence record those reads produce, and
an acceptance harness. No server of ours, no account with us, no network
destination it chooses for itself.

## 1. Verify what you received

```
sha256sum -c SHA256SUMS
grep -rn "process\.env" payload/            # expect: no results
grep -rniE "https?://" payload/             # expect: no destination of ours
```

`manifest.json` records the source commit, every payload file's SHA-256, every
dependency, and what is deliberately not included. The release is built by
walking the real imports from the declared entry point and **fails if the graph
reaches anything undeclared**. Host fallbacks and vendor-name exceptions are both
empty.

Those three commands are the whole portability claim and they cost nothing. If
one returns something, stop and raise it.

## 2. Install

Extract the archive and point your build at the payload. One entry point:

```ts
import {
  createProviderConnectionMetadata,
  executeProviderLiveDataRead,
  runProviderHubAcceptance,
} from '@portable/provider-hub'
```

Then implement two ports:

| Port | Method | Yours to decide |
| --- | --- | --- |
| `ProviderLiveDataReadTransport` | `get({ url, timeoutMs })` | credentials, proxy, TLS, egress policy |
| `ProviderLiveDataDigestPort` | `sha256(value)` | which implementation, and where it runs |

A third, `ProviderConnectionPersistencePort`, is needed only if you read stored
connection metadata back through the portable rather than from your own store
directly.

**Everything else is yours and is not in the payload at all**: vault, identity,
approval, quota, spend, audit transport, deployment controls.

## 3. Prove it works — before you rely on it

```
node scripts/run-provider-hub-acceptance.mjs ./your-ports.mjs \
  --probe https://status.yourcompany.com/health
```

`--probe` is required and must be https. It performs **one real GET** through
your transport, to a URL you nominate and control. The harness will not choose a
destination for you, and will not substitute its own ports for missing ones — a
substituted transport produces a green result that says nothing about whether
your egress policy, proxy and TLS actually let the call out.

Twelve checks are reported independently. Seven of them assert a refusal: the
harness hands the portable material it must reject — production mode, a plaintext
URL, a credential-shaped query string, embedded basic-auth, an oversized timeout,
a secret-shaped metadata field name, an unsafe masked value — and fails if any of
it is accepted.

Exit codes: `0` all passed, `1` a check failed, `2` it could not run.

**Keep the printed record and its SHA-256.** It is your acceptance evidence, and
the hash is how two people confirm they are discussing the same run. Re-run after
every upgrade and after any change to your own port implementations — the harness
tests your wiring, so a change on your side is exactly when it earns its keep.

## 4. Day-to-day operation

**Creating connection metadata.** Call
`createProviderConnectionMetadata(...)` at the point the record is created, not
later. It throws on a secret-shaped field name and on any masked value that is
not `saved`, `configured`, or `••••` plus a short safe suffix. That throw is the
feature: this record is the one most likely to be logged, cached, rendered and
shipped to a SIEM, and it should be safe in all four places.

**Performing a read.** `executeProviderLiveDataRead(request, options)` with
`executionMode` of `test` or `staging`. It refuses before any transport call if
the URL is not https, carries embedded credentials, has a credential-shaped path
or query, or if the timeout is not a positive integer at or under 30 seconds.

**Handling failure.** A transport that throws does **not** propagate. You get
evidence with `failureCode: 'transport_failure'` and HTTP 503. Treat an absent
exception as normal; the record is the outcome.

**Retaining evidence.** The record carries an origin, timestamps, status, a
result count, a SHA-256 of the body, an ETag and rate-limit figures — never the
body, the full URL, or a credential. Retention is entirely your decision; the
payload stores nothing.

## 5. Upgrade

Install the new payload alongside the old, run acceptance against it, and switch
entry points only once it passes. Within 1.x the buyer-facing interfaces are
additive only. **The payload owns no schema and holds no state**, so an upgrade
migrates nothing.

One upgrade note specific to this release: `networkAccessPerformed` on the
evidence record used to be a hardcoded `false` and is now derived from whether
the transport was actually invoked. If any of your tooling asserted that field
was always false, it will now see `true` after a real read. That is the field
becoming correct, not a regression.

## 6. Roll back

Point your build back at the previous payload. Nothing to migrate, no state to
reconcile. Keep the previous archive and its `SHA256SUMS` until the new one has
completed a real read in your environment.

## 7. Backup and restore

Nothing of ours to back up. What matters is yours: your connection store, your
retained evidence records, your acceptance records, your vault, and the archives
themselves so a restore can reproduce a known-good version.

Restore is: extract, verify checksums, re-run acceptance.

## 8. Removing it

Delete the payload and the ports you wrote for it. Nothing else of ours remains,
because nothing else was ever installed.

## 9. When something is wrong

| Symptom | Cause |
| --- | --- |
| `production-live-data-read-disabled` | `executionMode` was `production`. Production reads are refused in this release, by design and by acceptance check one. |
| `invalid-source-url` | Not https, or embedded basic-auth credentials, or a URL fragment. |
| `invalid-source-path` | The path contains characters outside the safe set. |
| `credential-shaped-source` | The path or query looks like it carries a key or token. Rewrite the call so the credential travels in a header your transport adds. |
| `invalid-timeout` | Not a positive integer, or above the 30-second ceiling. |
| `secret-shaped public field rejected: <name>` | Connection metadata was given a field *named* like a secret. Rename it; the value is irrelevant to this check. |
| `unsafe masked value rejected: <name>` | The masked value is not a recognised placeholder. Use `saved`, `configured`, or `••••` plus a short suffix. |
| Evidence has `state: 'blocked'` and a `blockers` list | The record failed its own validation. The list names each reason; nothing was silently accepted. |
| A read returns evidence instead of throwing | Correct behaviour. Check `failureCode`. |

## 10. One property worth knowing

The provider's ETag is retained verbatim, subject to a length limit and a
credential-shape check. **A provider that echoes response content into its ETag
header will echo it into your evidence.** The acceptance harness detects exactly
this — if `evidence_excludes_payload` ever fails against a real provider, that is
what it has found, and the remedy is to strip or drop the ETag in your transport
before the adapter sees it.

For anything reproducible in unmodified payload code with your ports replaced by
trivial stubs, raise it through the channel named in the support framework, with
the acceptance record attached.

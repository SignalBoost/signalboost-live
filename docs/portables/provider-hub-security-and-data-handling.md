<!-- docs/portables/provider-hub-security-and-data-handling.md -->

# Provider Hub — security and data handling

Written for a security reviewer filling in a vendor questionnaire. Every claim is
checkable against the archive you were given; where something has not been done,
it says so rather than being left out.

## The short version

The product is four TypeScript modules that run inside your environment. No
server of ours, no account with us, no telemetry, no network destination it
chooses for itself. None of your data reaches us, because there is no path by
which it could.

Unusually for this category, the product's entire purpose is refusing to hold
things: it stores no credential, performs no write, and produces records
designed so that a secret or a payload has no field to occupy.

## Data flow

**Data we receive: none.** The payload makes no outbound connection of its own.
Every read goes through the transport you implement, using your credentials,
your proxy and your egress policy.

**Data at rest: none required by the product.** It owns no schema and ships no
migration. Connection records and evidence records are returned to you as frozen
objects; where they go and how long they live is entirely your decision.

**Data in transit:** whatever your transport transmits. The payload opens no
socket.

**Telemetry, analytics, crash reporting, licence check-in: none.**

## Verifying that

```
grep -rn "process\.env" payload/            # expect: no results
grep -rniE "https?://" payload/             # expect: no destination of ours
grep -rn "fetch(\|http\.request\|net\." payload/   # expect: no direct network calls
sha256sum -c SHA256SUMS
```

The release is built by walking the real import graph from the declared entry
point rather than from a hand-written file list, and **the build fails if the
graph reaches anything the spec did not declare.** Host fallbacks and vendor-name
exceptions are both empty, verified by that walk. Four modules, zero host
imports.

## Credentials and secrets

The product holds none, reads no environment variable, and has no code path that
transmits one. Every credential your reads use arrives inside the transport you
wrote, resolved from your vault on your terms.

We have no ability to read, rotate or recover any credential in your deployment,
and no support process that asks you to send one. A request to do so is not
coming from us.

Two enforcements exist specifically to stop a credential reaching a record that
outlives the request:

- **A secret-shaped field name in connection metadata throws at construction.**
  `api_key`, `token`, `password`, `secret`, `private_key`, `credential`,
  `access_key` — the field *name* is sufficient, whatever the value.
- **A masked value that is not a recognised placeholder throws.** Only `saved`,
  `configured`, or `••••` plus a short safe suffix survive.

And on the read path, a URL is refused before any call if it is plaintext,
carries embedded basic-auth credentials, or has a credential-shaped path or
query string.

The check is at construction rather than at review, so nothing downstream can be
the place it was supposed to be caught.

## Personal data

The product's own records contain no personal data: a connection record holds
tenant, environment, connection and provider identifiers plus masked
placeholders; an evidence record holds an origin, timestamps, a status, a count
and a digest.

Two qualifications, stated because a reviewer should not have to infer them:

- **If your own identifiers encode personal data** — a connection ID built from
  an email address, for example — then that data is in the record because you
  put it there. The product does not inspect identifier contents.
- **What your transport fetches is your business.** A provider response may
  contain personal data. It is never stored in the evidence record — only its
  SHA-256 — but it passes through your transport, and whatever you do with the
  body afterwards is outside this product entirely.

We are not a controller or a processor of any of it, because we receive none of
it.

## Provider writes

There is no mutation path in the payload. The adapter issues `GET` and nothing
else, and `providerMutationPerformed` on every evidence record is a literal
`false` because it is true by construction, not because something checked it
afterwards.

Production-mode reads are refused outright in this release. That is a limitation
as much as a control, and it is stated as both.

## What the evidence record can and cannot contain

Carried: identity quadruple, capability, **source origin only**, fetched and
observed timestamps, freshness, HTTP status, result count, SHA-256 of the body,
ETag, rate-limit figures, failure code, and a blockers list when validation found
problems.

Not carried: the response body, the full URL, any query string, any credential.
There is no field one could occupy.

**One honest correction rather than a claim.** The record ends with four
assertion fields. Three — no provider mutation, no credentials exposed, no raw
payload stored — are literal because they are structurally true. The fourth,
whether network access occurred, **was a hardcoded `false` in earlier archives**,
which meant evidence for a completed read asserted that no network access had
taken place. It is now derived from whether the transport was actually invoked,
including when that transport threw. If you are reviewing an archive older than
`1.0.0-rc.1`, that field cannot be relied on.

**One residual property.** The provider's ETag is retained verbatim, subject to a
length limit and a credential-shape check. A provider that echoes response
content into its ETag header will echo it into your evidence. The acceptance
harness detects this; the remedy is to strip the ETag in your transport.

## Audit

The payload emits no audit events of its own and ships no audit transport. The
evidence record is the audit artefact, and exporting it to your SIEM is your
integration. Identity, approval and audit *contracts* exist in the source tree as
host-composition references but are not part of the payload — see the scope note
in the integration guide.

## Subprocessors

None for this product. We process none of your data, so there is no subprocessor
chain to disclose. Your provider accounts and your egress path are your
contracts.

## Software supply chain

Every release carries a CycloneDX 1.5 SBOM, `SHA256SUMS` over every payload file,
and release notes, and is reproducible from the recorded source commit. No native
modules. Supported on Node.js 20 and 22 LTS with TypeScript 5.x.

## Data retention and deletion

The product retains nothing. Retention and deletion are operations in your store.
There is no copy on our side to delete and no request to make of us.

Worth deciding deliberately: how long you keep evidence records. They are small,
they are useful to auditors, and they will therefore accumulate — which makes
them exactly the kind of record that outlives the reason it was created.

## Business continuity

There is no service of ours to be unavailable. If we disappeared tomorrow your
deployment would run unchanged, because nothing in it depends on us at runtime.
Keep the archives and their checksums so a restore needs nothing from us.

## Compliance posture — stated plainly

We hold no SOC 2 report and no ISO 27001 certificate for this product, and will
not imply otherwise. What we offer instead is that the product sits inside
**your** certified environment: it stores nothing, transmits nothing of its own,
holds no credential, and performs no write — so it inherits your controls rather
than asking you to trust ours.

Source delivery makes licence enforcement contractual rather than technical.

## Questions this document cannot answer

Anything about how *your* deployment is configured: which providers you read,
what your transport sends, where evidence records are stored, how long you keep
them, and who is permitted to create a connection. Those questions belong inside
your organisation, and the design puts them there on purpose.

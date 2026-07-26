<!-- docs/portables/self-healing-security-and-data-handling.md -->

# Self-Healing Supervisor — security and data handling

Written for a security reviewer filling in a vendor questionnaire. Every claim
here is checkable against the archive you were given; where something has not
been done, it says so rather than being left out.

## The short version

The product is source code that runs inside your environment. It has no server
of ours, no account with us, no telemetry, and no network destination it chooses
for itself. None of your data reaches us, because there is no path by which it
could.

That single fact answers most of a standard questionnaire, and it is verifiable:
grep the payload.

## Data flow

**Data we receive: none.** The payload makes no outbound connection of its own.
It reaches your systems only through interfaces you implement, and it calls what
your code tells it to call.

**Data at rest:** one table in your database, whose DDL is in the integration
guide. It records what was proposed, what was approved, by whom, and what ran.
Nothing else persists.

**Data in transit:** whatever your implementations transmit, over whatever
transport you chose. The product does not open sockets.

**Telemetry, analytics, crash reporting, licence check-in: none.** Licence
verification is a local Ed25519 signature check. It is offline by design; an
air-gapped deployment behaves identically to a connected one.

## Verifying that

From the extracted archive:

```
grep -rn "process\.env" payload/          # expect: no results
grep -rni "<vendor name>" payload/        # expect: no results
grep -rniE "https?://" payload/           # expect: no destination of ours
sha256sum -c SHA256SUMS
```

`manifest.json` records the source commit, every file's SHA-256, every runtime
dependency, and what is deliberately not included. The build pipeline runs an
independent verifier over the artifact that fails the release if the payload
contains an environment read, a credential-shaped string, our name, or a file
the manifest does not list.

## Credentials and secrets

The product holds none. It never reads an environment variable. Every credential
it uses arrives through your `SecretsProvider`, which reads from your vault, on
your terms.

We have no ability to read, rotate, or recover any credential in your
deployment, and no support process that asks you to send one. A request to do so
would not be from us.

Your licence token is configuration, not a credential. It identifies your
organisation and grants nothing beyond running software you bought.

## Access control and approvals

The product's central safety property is that consequential steps do not
execute. Steps classified as financial, destructive or credential-affecting are
halted and routed to a named human in your `ApproverDirectory`.

The directory validates when your deployment is wired, not when an incident
arrives: a category with no approver, an unroutable address, or a duplicate id
fails at construction. This is deliberate — the notification path swallows
delivery errors so a failed notification cannot become a second incident, which
means a directory that broke at runtime would break silently.

Classification is by policy over the step's own text and method, not by a flag
on the plan, so a step cannot opt itself out of review.

## Audit

Every dispatch, approval, refusal and entitlement decision emits an audit event
through your `SiemTransport`, formatted as ECS-JSON or CEF. It goes to your SIEM.
There is no second copy anywhere.

Audit and incident history remain available even when a licence has lapsed or
been revoked. Your operational record is not something a commercial dispute can
take from you.

## Subprocessors

**For the product itself: none.** It is code running in your environment.

Any third party involved is one your own implementations call — your cloud, your
identity provider, your notification channel, your SIEM, and whatever provider
your `ApiStepRunner` reaches. Those are your subprocessor relationships, under
your contracts.

## Software supply chain

Each release ships a CycloneDX 1.5 SBOM and per-file SHA-256 checksums. The
manifest names the exact commit the archive was built from.

The payload's runtime dependencies are listed in `manifest.json` under
`runtime.externalDependencies`; entries marked `hostFallback` are not shipped
and are things you supply.

Releases are built by an automated pipeline that refuses to publish if the
buyer-facing import graph reaches anything undeclared.

**Not yet in place, stated plainly:** release artifacts are not cryptographically
signed by a published vendor key, and there is no reproducible-build attestation.
Integrity today rests on the checksums and the recorded source commit.

## Vulnerability handling

Report to the security contact in the support terms, not through ordinary
support. Vulnerabilities are handled on the Severity 1 path whether or not they
are being exploited, and fixes ship as a patch version with release notes naming
the issue and the affected versions.

Because the payload holds no state, applying a security patch is replacing files
and re-running acceptance. There is no migration and no downtime we impose.

**Not yet in place:** no third-party penetration test has been performed against
this product, and there is no published coordinated-disclosure policy with a
committed timeline. Both are known gaps, not oversights in this document.

## Data retention and deletion

We retain nothing, so there is nothing for us to delete.

In your environment, the ledger table follows your own retention policy.
Removing the product is: stop calling it, delete the payload directory, export
and drop the table, remove the licence token, remove your wiring. Nothing needs
to be deauthorised on our side, because nothing was ever on our side.

## Business continuity

There is no vendor-operated service whose availability affects yours. If we
disappeared tomorrow, your deployment would keep running: the code is in your
possession, the licence verifies offline, and no check-in exists to fail.

## Compliance posture

**No SOC 2 report and no ISO 27001 certification.** Stated first because it is
usually the first question, and a hedge here would be a lie by omission.

What exists instead is architectural: your data never leaves your environment,
we hold no credentials of yours, every consequential action requires a named
human, and every decision is audited into your SIEM. For a component that runs
entirely inside your boundary, that is a materially different risk profile from
a hosted service — but it is not a substitute for a certification, and a reviewer
who requires one should treat this as not meeting that bar.

## Questions this document cannot answer

Anything about **your** implementations — how your vault is configured, who is
in your approver directory, how your SIEM retains events. Those are your
controls. We can review your wiring on request, but we cannot attest to it.

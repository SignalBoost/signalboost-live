<!-- docs/portables/press-media-security-and-data-handling.md -->

# Press & Media Engine Software — security and data handling

Written for a security reviewer filling in a vendor questionnaire. Every claim
here is checkable against the archive you were given; where something has not
been done, it says so rather than being left out.

## The short version

The product is source code that runs inside your environment. It has no server
of ours, no account with us, no telemetry, and no network destination it chooses
for itself. None of your data reaches us, because there is no path by which it
could.

That answers most of a standard questionnaire, and it is verifiable: grep the
payload.

## The one thing worth reading before the rest

**This product handles personal data, and you are the controller of it.**

Journalist and editor contact details — names, email addresses, publication
affiliations, and whatever your discovery source returns alongside them — are
personal data under GDPR, UK GDPR, and comparable regimes. The portable
processes those records inside your environment on your instruction. It does not
transmit them anywhere except through the ports you implement, and it never
sends them to us.

We are not a processor of that data, because we receive none of it. But the
obligations are real and they are yours: lawful basis for processing journalist
contact data, response to access and erasure requests, and retention limits.
Section *Data retention and deletion* below states what the product does and does
not do about it.

## Data flow

**Data we receive: none.** The payload makes no outbound connection of its own.
It reaches your systems only through interfaces you implement, and it calls what
your code tells it to call.

**Data at rest: none required by the product.** Campaign persistence belongs to
your host layer. The payload defines no table and ships no migration. What you
store, where, and for how long is entirely your schema decision.

**Data in transit:** whatever your implementations transmit, over whatever
transport you chose. The product does not open sockets. Outbound press email
leaves through your `EmailPort`; provider calls go through your `RunnerPort`
against your registry and your secrets; discovery reaches the web only through
the `DiscoveryPort` you supply, if you supply one.

**Telemetry, analytics, crash reporting, licence check-in: none.**

## Verifying that

From the extracted archive:

```
grep -rn "process\.env" payload/            # expect: no results
grep -rni "<vendor name>" payload/          # expect: no results
grep -rniE "https?://" payload/             # expect: no destination of ours
sha256sum -c SHA256SUMS
```

`manifest.json` records the source commit, every payload file's SHA-256, every
runtime dependency, and what is deliberately not included. The release is built
by walking the real import graph from the declared entry points rather than from
a hand-written file list, and **the build fails if the graph reaches anything the
spec did not declare.** Host fallbacks and vendor-name exceptions are both
empty, and verified empty by that walk.

## Credentials and secrets

The product holds none. The payload never reads an environment variable — the
grep above is the check. Every credential it uses arrives through your runner
port, which resolves against your vault, on your terms.

We have no ability to read, rotate, or recover any credential in your
deployment, and no support process that asks you to send one. A request to do so
is not coming from us.

Your press, wire, media-database and advertising accounts are yours. Nothing is
pre-integrated per vendor, and no credential ships in the archive.

## What the product will not assert

This matters to a reviewer because the risk in this product category is
reputational rather than operational. Generated copy is constrained by three
enforcements that run regardless of what the model produces:

1. Only declared company facts may be stated. The engine asks your host who it
   works for; it never assumes an employer.
2. Declared forbidden claims are matched exactly — deterministic string
   matching, not a judgement about tone that varies between runs.
3. A quote attributed to a named person requires an approved quote. Absent one,
   no quote is emitted.

Publication proof is never fabricated. Until the provider confirms, the record
stays pending and returns no URL.

These are checked by the acceptance harness — `forbidden_claim_absent`,
`unapproved_quote_absent`, `proof_not_fabricated` — against your own ports, and
the result is a signed, JSON-serialisable record you keep.

## Sending behaviour

The acceptance harness sends exactly one real email, to an address you supply,
and refuses to run without one. It never reads a target from a media database.

In operation, a lead returned by discovery is not a recipient. Converting a lead
into a target the engine will email is a separate, deliberate step taken by a
person. The product does not decide who to contact.

## Audit

The audit sink is a port. Wire it to your SIEM and every consequential action is
exported in your format; omit it and there is no audit trail, which the product
reports rather than hides. `audit_sink_reachable` is one of the eleven
acceptance checks precisely so an omission surfaces during evaluation rather
than during a review.

## Subprocessors

None for this product. We process none of your data, so there is no
subprocessor chain to disclose. Your own subprocessors — model provider, mail
transport, media database, wire service — are your contracts, and the product
does not add to them.

## Software supply chain

Every release carries a CycloneDX 1.5 SBOM listing external and runtime
dependencies, `SHA256SUMS` over every payload file, and release notes. The
archive is reproducible from the recorded source commit.

## Data retention and deletion

**The product retains nothing.** It has no store. Retention is a property of the
schema you wrote, and deletion is an operation you perform there.

Two things that follow, stated because a reviewer will ask:

- An erasure request from a journalist is satisfied in **your** database. There
  is no copy on our side to delete, and no request to make of us.
- Contact records accumulated through discovery should have a retention limit
  you set deliberately. The product will not impose one, and will not warn you
  that a contact list has aged.

## Business continuity

There is no service of ours to be unavailable. If we disappeared tomorrow, your
deployment would continue running unchanged, because nothing in it depends on us
at runtime. Keep the archives and their checksums so a restore can reproduce a
known-good version without us.

## Compliance posture — stated plainly

We hold no SOC 2 report and no ISO 27001 certificate for this product, and we
are not going to imply otherwise. What we offer instead is that the product sits
inside **your** certified environment: it stores nothing, transmits nothing of
its own, and holds no credential, so it inherits your controls rather than
asking you to trust ours.

Source delivery also makes licence enforcement contractual rather than
technical. We state that plainly rather than implying a protection that does not
exist.

## Questions this document cannot answer

Anything about how *your* deployment is configured: which model you point it at,
whose mail transport carries the send, what your discovery source returns, how
long you keep contact records, and who at your organisation approves a target.
Those are the questions a reviewer should be asking internally, and the design
puts them there on purpose.

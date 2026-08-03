<!-- docs/portables/press-media-support-terms.md -->

# Press & Media Engine Software — proposed support framework

**Status: commercial draft for counsel and capacity review. Not an SLA, not incorporated into any agreement, and not ready to sign.**

No response target in this document is binding unless a signed order form or pilot agreement identifies the vendor legal entity, customer, supported version, support period, channels, hours, staffing model, fees, exclusions, escalation path, and remedies.

## 1. Current evaluation support

Version `1.0.0-rc.1` is a design-partner evaluation release. Release candidates are not supported for production use and carry no 24/7 response commitment.

During an authorized evaluation, support is limited to reasonable-effort assistance with:

- installation of the exact archived package;
- interpretation of manifest, SBOM, checksums, and acceptance results;
- defects reproducible in unmodified package code;
- clarification of the public interfaces and documented boundaries;
- security reports concerning the package itself.

The evaluator and vendor must agree on the working contact channel before the evaluation starts. A personal message or an unacknowledged email does not create a contractual support ticket.

## 2. Potential production scope

A future production support agreement may cover product behaviour in a supported, unmodified release:

- provider registry and adapter contract behaviour;
- factual-discipline enforcement — declared facts, forbidden claims, approved quotes;
- target validation and refusal behaviour;
- discovery normalisation, deduplication and lead rejection;
- dispatch and two-stage owner notification;
- proof handling, including pending states;
- package audit events;
- the packaged acceptance harness and its CLI runner.

Production support cannot begin until production `1.0.0` is earned through external acceptance and a signed agreement defines the service commitment.

## 3. Buyer-controlled components

The following are buyer infrastructure and are excluded unless an order form expressly adds integration services:

- `AiPort`, `EmailPort`, `OwnerNotifyPort`, `HttpPort` and `RunnerPort` implementations;
- `CompanyProfilePort` and the declared company facts, forbidden claims and approved quotes;
- `DiscoveryPort` and whatever source backs it;
- `PortableAuditSink` and the SIEM behind it;
- campaign, lead and approval persistence — the product defines no schema;
- provider registry rows, action definitions and secret resolution;
- model, mail transport, media database, wire service and advertising accounts;
- databases, cloud accounts, identity providers, secret managers, and networks.

**A defect is ours only if it reproduces in unmodified payload code with your ports replaced by trivial stubs.** That test exists to be fair in both directions: it stops us blaming your wiring for our bug, and it stops a misconfigured transport becoming a vendor incident.

## 4. Severity definitions for future contracting

| Severity | Definition |
| --- | --- |
| S1 | The product asserts something it was not permitted to assert — a fact outside the declared set, a forbidden claim, a quote with no approval, or fabricated proof. Reputational and unrecoverable once sent. |
| S2 | Dispatch fails, or succeeds while reporting failure, in unmodified package code. |
| S3 | Discovery, validation, cost estimation or proof retrieval behaves incorrectly without misstating a fact. |
| S4 | Documentation, ergonomics, or a question about intended behaviour. |

S1 is defined first and deliberately narrowly. It is this product's characteristic failure: a wrong claim reaches a named editor under the buyer's name, and there is no rollback. Any report that plausibly falls in S1 should be raised as S1 and downgraded later if it does not hold.

## 5. Response targets are intentionally unset

We have not committed to numbers because we cannot yet staff them honestly. A target published before the capacity exists to meet it is a claim of the kind this product refuses to make about anything else.

What we will commit to at signing: named severity definitions, named channels, named hours, and a named escalation path — with the numbers filled in only when the staffing behind them is real.

## 6. Security reports

Security reports concerning the package take precedence over the ordering above, regardless of severity classification. Report them through the channel named in the agreement, with the affected version, the archive checksum, and reproduction steps.

Because the payload holds no credential, opens no socket, and reads no environment variable, the realistic report categories are: a dependency advisory, a defect in the factual-discipline enforcement, or an error in the boundary claim itself. All three are worth a fast path.

## 7. Supported versions — proposed policy

The current release and the one before it. A defect found in an older archive will be assessed against the current release first; if it no longer reproduces, the remedy is an upgrade.

Because the payload persists nothing, an upgrade touches no data and a rollback reconciles no state. That is what makes a two-version window reasonable rather than harsh.

## 8. Buyer responsibilities

- Run the acceptance harness against your own ports before relying on a version, and after every upgrade. Keep the record.
- Verify the sender identity with your mail provider before the first live send. An unverified alias fails at send time, not at configuration time.
- Declare your company facts, forbidden claims and approved quotes, and keep them current. The enforcement is only as good as the declaration behind it.
- Decide who approves a target. The product proposes; it does not decide who to contact.
- Set a retention limit for accumulated contact records. The product will not impose one.

## 9. Known commercial limitations

- Source delivery makes licence enforcement contractual rather than technical.
- No vendor account is included. The portable knows the shape of wire services, media databases and advertising platforms; the relationship is yours.
- Coverage is not guaranteed, by us or by anyone. The product puts a factually constrained pitch in front of the right desk.
- If your PR licence sits with your agency rather than with you, some adapters will have nothing to connect to. Free submission is a first-class path for exactly that reason.

## 10. Required approvals before use

Before a live campaign, the buyer should have:

1. an acceptance record showing eleven passes against their own ports;
2. a verified sender identity and a monitored reply address;
3. declared company facts, forbidden claims, and any approved quotes;
4. a named person who approves a target before it is contacted;
5. a decision on retention for contact records.

None of these is enforced by the product. All five are the difference between an evaluation and a campaign somebody's name is on.

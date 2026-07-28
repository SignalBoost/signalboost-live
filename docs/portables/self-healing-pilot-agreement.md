<!-- docs/portables/self-healing-pilot-agreement.md -->

# Pilot Agreement — Self-Healing Supervisor

**This is a structural draft for counsel, not legal advice and not ready to sign.** It exists
so a qualified lawyer starts from a document that already reflects how the product actually
works, rather than from a blank page or from a template written for hosted software. Every
value in **[SET]** is a commercial decision only the vendor can make. Every clause is subject
to counsel's revision or deletion.

Companion documents, referenced rather than repeated here:
[self-healing-support-terms.md](./self-healing-support-terms.md),
[self-healing-security-and-data-handling.md](./self-healing-security-and-data-handling.md),
[self-healing-license-installation.md](./self-healing-license-installation.md).

---

## 1. Parties and term

This Agreement is between **[SET — vendor legal entity, jurisdiction of incorporation,
registered address]** ("Vendor") and the customer identified on the signature page
("Customer"), effective on the last signature date.

The pilot runs for **[SET — 60 or 90 days suggested]** from the effective date. It ends
automatically at that point unless both parties agree in writing to extend or to convert it
under section 9.

## 2. Purpose

The purpose is evaluation. Customer deploys the Self-Healing Supervisor in its own
environment, connects it to its own monitoring, and determines whether it is fit for its
operations. Vendor obtains feedback from real use.

Nothing in this Agreement obliges either party to enter a longer-term agreement.

## 3. What is provided

Vendor provides the Self-Healing Supervisor portable in the **[SET — standard or
enterprise]** edition, together with a licence token valid for the pilot term, and the
documentation set referenced above.

**The software runs entirely inside Customer's environment.** Vendor operates no service on
Customer's behalf, holds no account, and receives no telemetry. Vendor has no access to
Customer's systems, credentials, or data at any point during the pilot, and no support
process asks for them. The consequences of this are set out in the security and
data-handling statement.

## 4. Licence

Vendor grants Customer a non-exclusive, non-transferable, non-sublicensable licence to
install and use the software for its own internal operations for the pilot term only.

Customer will not resell, distribute, or make the software available to third parties;
remove or alter licensing, audit, or approval mechanisms; or use it to provide a service to
anyone other than itself. Reverse engineering is prohibited except to the extent that
prohibition is unenforceable under applicable law.

Vendor retains all intellectual property in the software. Customer retains all rights in its
own data, configuration, and any implementations it writes against the software's
interfaces.

**Seat counts and execution limits recorded in a licence token are contract terms, not
technical controls. The software does not enforce them.**

## 5. What each party does

**Customer** deploys the software, supplies the infrastructure it depends on, connects its
own monitoring sources, names the approvers who will receive gated steps, and provides
reasonable feedback during the pilot.

**Vendor** supplies the licence token, and provides support in accordance with
[self-healing-support-terms.md](./self-healing-support-terms.md), including its severity
definitions and response targets. Those targets — **[SET — the four response targets,
whether Severity 1 is 24/7, the business-hours definition and time zone, the support
channel, and the security contact]** — are incorporated by reference and are commitments for
the pilot term.

## 6. Approval gating

The software routes consequential steps to a named human approver before they execute. This
behaviour is not configurable off, and is not an edition feature. Customer is responsible
for designating competent approvers and for the consequences of approvals its personnel
give.

## 7. Fees

The pilot fee is **[SET — a figure, or "none"]**, payable **[SET — terms, if any]**.

## 8. Confidentiality

Each party will protect the other's non-public information disclosed in connection with the
pilot with at least reasonable care, use it only for the purposes of this Agreement, and
disclose it only to personnel who need it and are bound by comparable obligations. The
obligation survives for **[SET — 3 years suggested]** after the pilot ends. It does not
apply to information that is public through no fault of the recipient, independently
developed, or lawfully received from a third party, or where disclosure is legally
compelled.

## 9. Feedback

Customer may give feedback. Vendor may use it without restriction or obligation. Feedback
does not transfer any of Customer's confidential information or intellectual property, and
Customer is not required to give any.

## 10. Warranty and liability during a pilot

**The software is provided for evaluation on an "as is" basis, without warranties of any
kind, express or implied**, including merchantability, fitness for a particular purpose, and
non-infringement. This is stated plainly because it is what a pilot is: the parties are
finding out whether it works.

Neither party is liable for indirect, incidental, consequential, special, or punitive
damages, or for lost profits or lost data. Each party's total aggregate liability arising
out of this Agreement is limited to **[SET — a figure; fees paid, or a fixed cap if the
pilot is unpaid]**.

These limits do not apply to a party's breach of the licence restrictions in section 4, to
breach of confidentiality, or to liability that cannot be limited under applicable law.

## 11. Known limitations, disclosed before signature

Stated here rather than discovered during the pilot:

- Vendor holds no SOC 2 report, ISO 27001 certification, or third-party penetration test.
- The monitoring vendor adapters are staged. Customer's first alert is the first time a
  given mapping meets live traffic from Customer's account.
- The software has no attempt-counter for unattended retry, so recovery actions require a
  human to initiate them.

## 12. Termination

Either party may terminate for convenience on **[SET — 10 days suggested]** written notice,
or immediately for material breach that is not cured within **[SET — 15 days suggested]** of
notice.

On expiry or termination, Customer stops using the software and deletes its copies. The
licence token ceases to be valid at the end of the pilot term. Customer's incident records,
audit trail, and configuration remain Customer's, in Customer's systems; Vendor cannot
delete or retrieve them because Vendor never held them.

Sections 4 (as to restrictions), 8, 9, 10, and 13 survive.

## 13. General

Neither party may use the other's name, logo, or the existence of this pilot publicly
without prior written consent.

This Agreement is governed by the laws of **[SET — governing law]**, and the parties submit
to the exclusive jurisdiction of the courts of **[SET — venue]**.

This Agreement is the entire agreement on its subject matter, supersedes prior discussions,
and may be amended only in writing signed by both parties. Neither party may assign it
without the other's consent, except to a successor of all or substantially all of its
business. If a provision is unenforceable, the rest remains in effect.

## 14. Conversion

If both parties wish to continue, they will negotiate a subsequent agreement in good faith.
Indicative terms for that agreement — **[SET — price, edition, term, and whether pilot fees
credit against it]** — are not binding until executed. Absent a signed successor agreement,
this pilot ends on its expiry date.

---

## Signatures

| | Vendor | Customer |
|---|---|---|
| Entity | **[SET]** | |
| Name | | |
| Title | | |
| Date | | |
| Signature | | |

---

## Note to counsel

Three things in this draft are unusual for software and are deliberate rather than
oversights. First, the software runs wholly in Customer's environment with no vendor-side
service, so the usual hosted-software provisions — uptime, service credits, data processing,
subprocessors, breach notification for vendor-held data — have no subject matter. A DPA is
likely unnecessary for the product itself, and the reasoning is set out in the security and
data-handling statement. Second, the approval-gating clause in section 6 describes a safety
property of the product and should not be softened into a configurable feature. Third,
section 11 discloses gaps most vendors omit; leaving them in is the intent, since a buyer's
security review finds them regardless and the disclosure is worth more than the omission.

<!-- docs/portables/buyer-package/README.md -->

# Buyer package — Self-Healing Supervisor

Everything a prospective buyer receives, what each document answers, and the four things that
must be done before the package goes out.

---

## Before you send anything

**1. Fill in the five support values.** `../self-healing-support-terms.md` contains blanks
marked **SET**: the four response targets and whether Severity 1 is 24/7, the business-hours
definition and time zone, the support channel, the security contact address, and the
version-support window. Conservative defaults sit beside each one; adopting them as written
is a legitimate answer. A support document sent with visible blanks reads as unfinished.

**2. Decide the price.** It appears in the cover letter and in the pilot agreement's
conversion clause. A package that dodges the number invites the prospect to assume it is
expensive.

**3. Strip the vendor section from the licence installation guide.**
`../self-healing-license-installation.md` ends with a section marked
`VENDOR SECTION — remove this section before handing this document to a buyer.` It describes
how licences are minted and revoked. Delete it from the copy you send.

**4. Fill in the pilot agreement's bracketed values** — your legal entity, term, edition,
fee, liability cap, notice periods, governing law and venue — and have counsel read it. It is
a structural draft, not a signable contract.

---

## What to send, and in what order

### First contact — send two things only

| Document | What it answers |
| --- | --- |
| Cover email (`cover-letter.md`) | Why you are writing and what this is |
| `../self-healing-integration-guide.md` | What it does and what the buyer has to supply |

Resist sending the full set at first contact. Eight documents in an opening email reads as
volume rather than substance, and the security statement answers questions nobody has asked
yet.

### After interest — the technical set

| Document | Who reads it |
| --- | --- |
| `../self-healing-integration-guide.md` | Their engineers — the interfaces, the dispatch ledger schema, reference wiring, and what "live" requires |
| `../self-healing-incident-intake-guide.md` | Their engineers — the incident contract and payload |
| `../self-healing-monitoring-connections.md` | Whoever owns their monitoring — the endpoint, per-vendor field mapping for eight vendors, and a verification procedure |
| `../self-healing-operations-runbook.md` | Whoever will run it day to day |

### After the security questionnaire arrives — the review set

| Document | Who reads it |
| --- | --- |
| `../self-healing-security-and-data-handling.md` | Their security reviewer. Written for someone filling in a vendor questionnaire, and it names the gaps rather than hiding them |
| `../self-healing-license-installation.md` (vendor section removed) | Their platform team — where the licence goes and what it controls |

### When the conversation turns commercial

| Document | Who reads it |
| --- | --- |
| `../self-healing-support-terms.md` | Their procurement and service owner |
| `../self-healing-pilot-agreement.md` | Their counsel and yours |

---

## What is NOT in the buyer package

- **`../self-healing-evaluation-brief.md`** — written for engineers doing an adversarial
  review. It tells the reader what to attack and where the product is weakest. That is the
  right document for a technical partner or a design partner who has already engaged; it is
  the wrong opening move with a prospect who has not.
- **The vendor section of the licence installation guide** — see step 3 above.
- **Anything under `saas/app/`, `saas/components/` or `saas/app/api/`** — that is the
  SignalBoost operator console and demo surface. It is a test rig, not what a buyer receives.

---

## The demo

Two things can be shown live, on demand, and neither is staged:

- **A rehearsal run** — one scripted incident per risk category against real wiring. A
  consequential step is required to pause, a real approval notification is sent, and an audit
  trail is produced. If the dangerous step ever executed, the run reports FAILED.
- **An incident drill** — a synthetic incident through the real intake path: authentication,
  deduplication, storage, triage and policy classification.

Say plainly which is which. Both are labelled as rehearsals on screen, and they should be
described that way out loud too. The product being sold is a trustworthy audit trail; a
demonstration presented as production history would undo the entire proposition.

Production repair history is the third panel and cannot be triggered. It fills in only after
a real deployment failure has been detected and repaired.

---

## Claims that must not drift

These are the sentences that appear in more than one document. If one changes, all of them
change together.

1. No consequential step executes without a named human approving it — in any edition,
   including with no licence installed.
2. The product runs entirely in the buyer's environment. No vendor service, no vendor
   account, no telemetry, no data leaving their network.
3. Seats and execution limits are contract terms. The software does not enforce them.
4. The monitoring vendor adapters are staged. A buyer's first alert is the first time that
   mapping meets live traffic from their account.
5. No repair executes without an execution runner the buyer supplies. Without one, the
   product diagnoses, gates and audits, then reports honestly that nothing was repaired.
6. No SOC 2 report, no ISO 27001, no third-party penetration test.

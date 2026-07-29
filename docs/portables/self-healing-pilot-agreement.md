<!-- docs/portables/self-healing-pilot-agreement.md -->

# Pilot Agreement — Self-Healing Supervisor

**Structural draft for qualified counsel. Not legal advice, not an offer, and not ready to sign.**

No pilot may begin under this draft until every bracketed item is completed and approved, including the vendor legal entity, customer, release checksum, licence term, fees, governing law, venue, liability cap, confidentiality period, termination periods, support framework, security contact, and signature authority.

## 1. Parties and effective date

This agreement would be between **[VENDOR LEGAL ENTITY, JURISDICTION, REGISTERED ADDRESS]** (“Vendor”) and **[CUSTOMER LEGAL ENTITY, JURISDICTION, ADDRESS]** (“Customer”), effective on the last signature date.

## 2. Evaluation purpose and term

The purpose is technical and operational evaluation of the Self-Healing Supervisor inside Customer's environment. The pilot term is **[60/90 DAYS OR OTHER TERM]**. Neither party is obligated to enter a production agreement.

The software supplied for the pilot is the exact archived release identified on the signature page by package version, source commit, tarball filename, and SHA-256 checksum. The present engineering candidate is `1.0.0-rc.2`; it is not production `1.0.0`.

## 3. Buyer-hosted model

The software runs inside Customer's environment. Vendor does not operate a control plane in the execution path and does not receive telemetry by default.

Customer supplies and controls:

- credentials and secret storage;
- incident sources and durable records;
- dispatch ledger and approval nonce store;
- approver identity and authorization;
- provider capability registrations and parameter validators;
- provider runners and verification runners;
- approval signing keys and public-key directory;
- notification channels and SIEM transport;
- backup, upgrade, rollback, and retention procedures.

No statement in this draft eliminates Customer's security review or Vendor's disclosure obligations.

## 4. Evaluation licence

Subject to signature and any agreed fees, Vendor would grant Customer a limited, non-exclusive, non-transferable, non-sublicensable right to install and evaluate the identified release for Customer's internal evaluation during the pilot term.

The draft grants no production, resale, redistribution, public-hosting, service-provider, or sublicensing right. Production use requires a separate signed agreement.

Customer would not remove or represent as Vendor-approved any modification to licensing, capability validation, approval continuation, audit, or package-integrity controls. Any reverse-engineering restriction remains subject to applicable law and counsel review.

Customer retains its data, configurations, adapters, and buyer-written boundary implementations. Ownership and licence treatment for feedback, fixes, and jointly developed integration code must be stated in the final agreement.

Because Customer receives source, licence enforcement is contractual rather than tamper-proof. Seat counts and aggregate execution limits in a token are contract terms unless a future release expressly implements technical counters.

## 5. Technical safety boundary

The evaluation package uses explicit provider/action capability registration. Unknown API actions pause by default.

A consequential action may resume only after a signed approval continuation validates the incident, plan, fresh dispatch ID, exact ordered step scope, named approver, time window, one-time nonce, signing key, and prior pause audit event.

Customer is responsible for approver competence, authorization, key custody, capability review, runner behavior, and the business consequences of an approval. Vendor remains responsible for defects in the unmodified package code, subject to the final warranty and liability terms.

No clause should describe the approval boundary as configurable off.

## 6. Pilot activities and acceptance record

Customer would:

1. verify the archive checksum, manifest, and SBOM;
2. install the exact tarball in a clean environment;
3. use only public package imports;
4. test missing, invalid, and valid entitlement through the packaged licensed factory;
5. test all three consequential categories;
6. test exact registered routine capabilities;
7. test signed continuation and failure cases;
8. confirm five-language notification behavior and stable machine identifiers;
9. connect only reviewed staging runners;
10. test read-only verification, audit delivery, upgrade, and rollback;
11. retain the resulting evidence.

The acceptance record should identify the package version, source commit, archive checksum, configuration version, tests run, results, limitations, approvers, and sign-off participants.

Passing a pilot does not create a production licence unless a successor agreement is signed.

## 7. Vendor activities

Vendor would provide:

- the identified evaluation archive and package evidence;
- an evaluation licence token for the agreed term;
- the technical documentation set;
- reasonable-effort evaluation assistance under the separately approved support framework;
- fixes or documented workarounds for reproducible package defects where commercially reasonable;
- disclosure of known material limitations.

Vendor does not administer Customer systems, hold Customer credentials, approve Customer actions, or operate Customer's provider runner.

## 8. Fees and expenses

Pilot fees: **[AMOUNT OR NO-COST TERMS]**.  
Payment schedule: **[TERMS]**.  
Taxes: **[ALLOCATION]**.  
Travel or third-party expenses: **[PRE-APPROVAL AND REIMBURSEMENT TERMS]**.

No price, discount, or future production credit is binding until completed here and signed.

## 9. Support and security contacts

The proposed support framework is not an SLA until expressly incorporated into the signed agreement.

The final agreement must identify:

- covered hours and time zone;
- named support and security channels;
- primary and backup responders;
- response targets by severity;
- exclusions and cooperation requirements;
- escalation path;
- remedies, if any.

No 24/7 or four-hour Severity 1 commitment is included by default.

## 10. Confidentiality and security reporting

Each party's confidentiality obligations, exclusions, compelled-disclosure process, duration, standard of care, permitted recipients, and return/destruction obligations are **[TO BE COMPLETED BY COUNSEL]**.

Security reports must not include production credentials, licence tokens, approval signatures, private keys, or unnecessary Customer data.

## 11. Warranties and disclaimers

The evaluation software is expected to be supplied “as is” for technical evaluation, but the exact disclaimer, non-infringement language, authority warranties, malware warranty, and any security commitments are **[TO BE COMPLETED BY COUNSEL]**.

This draft makes no production availability, automated-remediation success, compliance certification, or fitness representation.

## 12. Liability and indemnity

The liability cap, excluded damages, confidentiality and IP carve-outs, security carve-outs, indemnities, defence control, and claims procedure are **[TO BE COMPLETED BY COUNSEL]**.

Do not send this draft for signature with those terms unresolved.

## 13. Known limitations disclosed before signature

At minimum, the final pilot agreement should disclose:

- `1.0.0-rc.2` is evaluation-only and has not earned external production acceptance;
- production runners and capabilities are buyer-supplied;
- monitoring adapters remain staged until accepted against buyer traffic;
- in-memory stores are not production durable boundaries;
- licence enforcement in source delivery is contractual rather than tamper-proof;
- seats and aggregate execution limits are not technical counters;
- no SOC 2 report, ISO 27001 certification, or third-party penetration test is represented;
- no production SLA or 24/7 staffing is represented;
- repository visibility and the long-term source-licensing model require a commercial decision.

## 14. Termination and end of pilot

Convenience notice: **[PERIOD]**.  
Breach notice and cure: **[PERIOD]**.  
Immediate termination events: **[EVENTS]**.  
Post-termination licence and deletion obligations: **[TERMS]**.  
Evidence and Customer-owned records retained by Customer: **[TERMS]**.

Vendor cannot delete Customer records held only in Customer systems.

## 15. Governing law and general terms

Governing law: **[JURISDICTION]**.  
Venue/dispute process: **[COURTS, ARBITRATION, OR OTHER]**.  
Assignment, publicity, notices, force majeure, export controls, sanctions, severability, waiver, order of precedence, and entire-agreement terms: **[TO BE COMPLETED BY COUNSEL]**.

## 16. Production conversion

Any production relationship requires a separate signed agreement identifying the production release, supported environments, licence scope, price, term, support commitment, security terms, warranty, liability, and acceptance criteria.

Absent that successor agreement, the pilot ends on its stated date and no production right is implied.

---

## Signature page — incomplete draft

| Field | Vendor | Customer |
| --- | --- | --- |
| Legal entity | **[REQUIRED]** | **[REQUIRED]** |
| Authorized signer | **[REQUIRED]** | **[REQUIRED]** |
| Title | **[REQUIRED]** | **[REQUIRED]** |
| Date | **[REQUIRED]** | **[REQUIRED]** |
| Signature | **[REQUIRED]** | **[REQUIRED]** |
| Package version | `1.0.0-rc.2` | |
| Source commit | **[REQUIRED]** | |
| Tarball SHA-256 | **[REQUIRED]** | |
| Pilot term | **[REQUIRED]** | |
| Pilot fee | **[REQUIRED]** | |

**Do not sign while any required field or material clause remains unresolved.**

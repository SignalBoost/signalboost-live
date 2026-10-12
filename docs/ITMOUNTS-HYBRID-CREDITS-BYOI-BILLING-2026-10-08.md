# iTMounts commercial credit wallet — Phase 4 design (2026-10-08)

Status: **DESIGN + NON-EXECUTABLE STORAGE FOUNDATION ONLY; NO CUSTOMER BILLING**.

## Product contract
- Default: pay-as-you-go, one-time purchases; no mandatory subscription or auto-top-up.
- Optional Pro: recurring subscription with a distinct monthly promotional entitlement, plus optional purchased credits.
- Enterprise: explicit commercial agreement, configurable hosting and BYOI controls.
- Launch price hypotheses (not approved prices): Free, $25+ top-ups, optional $39/month Pro; never hardcode these into financial logic.
- Customers own and pay their AI providers and compute. iTMounts sells software metering, orchestration, exams, reporting, storage when explicitly charged.
- No charge for provider GPU/teacher tokens by iTMounts in BYOI mode; surface provider-side reported spend *separately* and flag verified, estimated, delayed or unavailable state.

## Dual-balance launch requirement
- Paid University operations must require both (a) sufficient purchased/promotional iTMounts credit authorization for the platform charge and (b) sufficient quota/funds at each customer-owned external AI and compute provider used by the workload.
- An exhausted iTMounts wallet must prevent **new** billable platform operations. Exhausted provider funds, provider 402/429 or confirmed insufficient quota must stop further dependent calls/jobs, record the reason, preserve artifacts and release unused authorized reserves where applicable.
- Do not confuse the LAB experiment budget ledger with spendable purchased credit. Until the commercial wallet-to-authorization transaction path is live, the dual-balance runtime gate is **not verified** and paid University billing must not be presented as operational.
- Warn customers before paid work that platform credits and external provider funds are separate; depleted accounts interrupt service. A previously submitted external job might continue billing after iTMounts credit depletion, so enforce provider-side limits, cancellation, reconciliation and cleanup instead of implying a guaranteed instantaneous stop.
- Show the current state separately: platform balance, provider quota/credit when APIs expose it, and \'unknown—check provider\' otherwise. Never fabricate an external balance.

## Three distinct accounting domains
1. **Commercial liability wallet** (NEW): value sold to customers as paid credits; refunds, chargebacks, purchased lots, promotional and subscription grants, source-of-truth signed payment events. All amounts integer-denominated in a versioned published denomination; avoid ambiguity with existing microcredits.
2. **Experiment budget ledger** (EXISTING `lab.credit_*`): internal authorization reserve, capture, release, eligible platform-fault refund against tenant experiment budgets. These are NOT paid customer money and must never be interpreted as USD or a Stripe balance.
3. **Customer BYOI expenses** (NEW usage reporting): vendor-specific evidence, usage units and provider currency, costs and provenance, customer-owned credentials, no iTMounts wallet debit for external providers.

Never merge accounting domains merely because they have similar 'credit' names. A bridge converting wallet units to software-use authorizations requires an approved immutable price version, spend decision, atomic reservation, settlement journal, and independent replay protection.

## Financial invariants
- No live Stripe product IDs or credits until pricing is approved and all acceptance tests pass.
- Stripe webhook signature verification and durable exactly-once processing; nonunique or transient database errors must retry rather than fail-open. The existing `saas/app/api/webhook/route.ts` currently has a fail-open warning in `claimStripeEvent`; this is a blocker for commercial wallet integration and MUST be repaired with replay/error regression tests *before* any wallet event handling is connected.
- Never credit wallet from an unverified client callback, Checkout success redirect, invoice draft, or unverified payment metadata. Always resolve authorized organization identity on the server and bind to payment provider account and full event payload identity.
- Purchased credits, subscription credits, promotional grants and chargeback reversals are separate lot types, with distinct consumer disclosures; chargebacks must not fabricate negative availability or silently redistribute another tenant's funds.
- Reserve before governed execution, reject insufficient available credits, settle actual software usage and release leftovers; do not authorize extra credit spend on retry. Provider execution remains subject to the customer's separate BYOI budget/permissions.
- No expiration of purchased credits by default. Expiry of granted credits must be explicitly disclosed and jurisdiction reviewed. Never silently convert paid to expiring promotional credits.
- A user may cancel Pro without losing purchased credits. Subscriber entitlements and subscription credit expiry must not alter previously purchased lots.
- Audit trace: customer/tenant, service, approved rate revision, Stripe event or grant authority, experiment, Harness authority, reservation, immutable journal, reconciliation, refund/chargeback, independent verification status.
- Never claim actual BYOI invoicing proof from synthetic measurements or a provider estimate. External provider spend outside governed iTMounts cannot be guaranteed capped.

## Engineering order
1. Read ONBOARD + inspect existing Stripe webhook, render-credit wallets and Lab credit ledger. No parallel second billing implementation should activate.
2. Implement safe, isolated schema and closed-by-default integration contracts. No client table privileges and no live webhook writes.
3. Reconcile commercial journal and lot balances; immutable grants and debit/release/refund movement via transactional SQL, idempotency, tenant binding and independent failure tests.
4. Add isolated Stripe test-mode event consumer, verified account-to-tenant binding, atomic event claim+ledger entry transaction, dispute/refund reversal, concurrent webhook replay, restart and network-timeout tests. Keep live mode disabled until approved.
5. Add independent payment/invoice settlement reconciliation and controlled one-tenant test-mode checkout; verify exactly-once and correct customer disclosures.
6. Exercise end-to-end BYOI Lab factory with capped test-owned provider/compute identities; measure vendor spend separately from iTMounts credits and report evidence gaps.
7. Only then separately approve publishing pricing and enabling real customer collections, with legal/tax review.

## Acceptance: fail closed
- No paid wallet mutation with absent or invalid Stripe signature, unknown product/version, unverified tenant, stale or reused event, unauthorized refund or mismatch.
- Concurrent top-up replay = exactly one grant; two concurrent experiments cannot overspend; cancellation does not erase paid credits.
- External BYOI usage changes *only* expense reporting, never the commercial wallet.
- Public UI makes two financial categories unmistakably distinct. No auto-recharge without explicit opt-in.
- Exact artifact, privacy, Referee and Harness authorization still govern all AI work.
- Production financial certification requires real signed payment event records and independent reviewer signoff, not just local tests.

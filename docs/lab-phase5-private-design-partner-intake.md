# Phase 5 private enterprise design-partner intake (initial implementation)

Scope: candidate readiness **for independent human review**, not certification or partner onboarding.

- The typed intake evaluator at `saas/lib/ai/cos/labPhase5PartnerIntake.ts` refuses missing partner or tenant identity, missing private BYOI designation, missing signed scope/acceptance references, missing teacher-output or training-data rights, missing retention/deletion/privacy evidence, security/penetration/recovery/audit/support/legal/rollback evidence, and unapproved Phase 3 or 4 acceptance.
- It accepts 2–3 distinct candidate partner/tenant records for *independent signoff consideration*. No actual partners, signed contracts, pen tests, rights grants, or environment acceptance are asserted by these tests.
- The reference shape check only rejects absent/malformed evidence locators. It **does not** verify signatures, legal validity, permission scope, artifact provenance, tenant isolation, or provider terms. Do not expose this pure evaluator as an authorization bypass.
- Integration into a durable authenticated evidence registry, independent document/signature verification, actual private customer evaluations, cross-tenant red-team testing, and owner/legal launch decision remain **blocked pending real evidence and production integration**.
- No marketplace, public onboarding, production authorization, spend, or worker deployment is enabled.

Execute `node --import tsx --test tests/labPhase5PartnerIntake.node.test.ts` from `saas/` where tsx is available. Check the existing required CI gates separately. Record actual evidence against `docs/lab-enterprise-phase3-4-5-acceptance.md`.

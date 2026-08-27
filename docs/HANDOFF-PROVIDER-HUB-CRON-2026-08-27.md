# 2026-08-27 — Provider Hub capability reuse + owner-directed promotion cron acceptance

Read this with the root `ONBOARD.md`. This file records the live acceptance evidence for two changes completed on 2026-08-27. It does not widen any provider, learning, or execution authority.

## Owner-directed knowledge-promotion cron — repaired in Production

Observed failure before repair:

- `/api/cron/cos-directed-study-promotion` was being invoked by Vercel on schedule but returned HTTP 503;
- the COS/Qwen reasoner itself completed successfully before the failure;
- the promotion log degraded the thrown Supabase object to `[object Object]`, hiding the database cause;
- Production had 264 pending owner-directed records plus 5 retryable failed records at diagnosis time.

Root cause:

- `saas/lib/ai/cos/cognitiveFactConsolidation.ts` records contradictions and fact-memory changes in `public.cos_knowledge_fact_revisions`;
- the repository already contained `saas/supabase/migrations/20260816_cos_knowledge_fact_revisions.sql`;
- that migration had never been applied to the Production Supabase project, so a promotion batch could extract/embed facts and then fail when contradiction/audit persistence reached the missing table.

Repair and proof:

- applied the existing `cos_knowledge_fact_revisions` migration to Production;
- verified the table exists with RLS enabled;
- the 13:38 UTC scheduled run returned HTTP 200, completed 1 document and wrote 11 grounded facts with 0 document failures;
- the next 13:53 UTC scheduled run also returned HTTP 200, completed 3 documents and wrote 35 grounded facts with 0 document failures;
- the owner-directed pending queue moved from 264 to 260 and completed owner-directed records reached 25;
- the new fact-revision table began receiving real audit rows;
- no grounding threshold, source-quality rule, owner-directed provenance requirement, retry limit, or promotion/evidence gate was lowered.

A separate concurrent `main` change added a structured thrown-value formatter so future Supabase-shaped failures do not collapse to `[object Object]`. Do not duplicate or remove that diagnostic hardening.

## Provider Hub — reuse existing Marketing + Sales adapters

PR #1536 merged as:

`99c8d6dddf5937c170138b3abfa332714909d156`

Exact accepted Preview:

`dpl_CxR4VWLfBeFT3wshhFpEw84v1jP6` — READY

Accepted Production deployment:

`dpl_J9o8sG69kWgHKZH4jRs8VTUyme7p` — READY, `saas.signalboostapp.com` attached

Exact acceptance:

- mandatory Vercel suite: **458/458 tests passed, 0 failed** on Preview and reran successfully on Production;
- the 8 new Provider Hub / Marketing + Sales capability-reuse regressions passed;
- route-config, strip-safety, EN/ES/PT/PL/RU i18n guards, optimized Next.js compile, TypeScript and full build passed;
- Onboarding Enforcement, Relative Import Extensions, Pipeline Integrity, Outreach portables, QA Scan, COS Council Deterministic Regression, Audit Remediation Regression, Mission 001 Coordination Security, SaaS CI, Repo Targeting QA, V1 Red Diagnostics and Playwright all passed before merge.

### What is reused

Provider Hub now projects the provider adapters already owned by Marketing + Sales rather than creating parallel Facebook/Google/LinkedIn/etc. integrations.

Organic/social built-ins reused:

- YouTube Channels;
- TikTok;
- Instagram Business;
- LinkedIn Company;
- LinkedIn Profile/member;
- Facebook Pages;
- X/Twitter;
- Reddit.

Paid-ad network setup/adapters reused:

- Meta Ads;
- LinkedIn Ads;
- TikTok Ads;
- Reddit Ads;
- Pinterest Ads;
- Snapchat Ads;
- X Ads;
- Google Ads;
- Microsoft Advertising;
- Amazon Ads.

### Capability model

Examples exposed from the existing adapters include:

```text
social.<platform>.destinations.read   -> read
social.<platform>.publish             -> write + approval required
ads.<network>.account.read            -> read
ads.<network>.spend.read              -> read
ads.<network>.campaign.create         -> consequential + approval required
ads.<network>.campaign.pause          -> consequential + approval required
```

Cross-portable visibility is deny-by-default. The source Marketing + Sales portable may discover the capabilities it already owns; another known portable sees an exact capability only after an explicit host-side grant.

Production migration `provider_hub_portable_capability_grants` is applied. It stores authorization metadata only. Production verification found:

- RLS enabled;
- zero direct `anon` / `authenticated` table privileges;
- no access-token, refresh-token, client-secret, API-key or other provider-secret column.

The admin-gated API is:

`/api/provider-hub/marketing-sales-capabilities`

It can list the canonical Marketing + Sales capability catalog and grant/revoke only exact capabilities that are actually backed by that catalog.

### Critical execution boundary

This phase is **capability discovery + authorization reuse, not shared mutation execution**.

Provider Hub does not directly call the social publisher or paid-ad campaign mutation functions through the generic Portable Connector Runtime in this phase. Existing Marketing + Sales execution remains authoritative for actual publishing and spend because it already owns the content approval, spend approval, cap, provider-confirmation, reconciliation, pause and audit boundaries.

The historical generic Portable Connector Runtime has unresolved mutation-hardening concerns around invocation-bound approval verification, cancellation/idempotency after timeouts, and preserving completed outcomes when post-execution audit persistence fails. Those must be closed and independently accepted before social publishing or financial mutations are delegated through that shared runtime.

Do not report `executionDelegated=true` for this bridge until that later hardening is complete.

## Google Sheets acceptance clarification

The Google Workspace connector has progressed beyond the older ONBOARD wording:

- real Production OAuth completed;
- both required read-only scopes were observed in encrypted server-side persistence;
- the Production discovery repair automatically found one real native Google Sheet after refresh;
- SignalBoost listing is therefore live-account accepted;
- an actual SignalBoost `read_range` POST has not yet been separately observed as live acceptance, so do not claim the entire Sheets range-read path externally accepted merely from the listing proof.

The Drive permission remains metadata-only. Google Drive auto-RAG still requires a separate explicit content-read scope and governed ingestion extension.

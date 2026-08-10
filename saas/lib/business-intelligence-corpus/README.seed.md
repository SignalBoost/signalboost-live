# Existing COS company seed

The Business Intelligence Corpus reuses intelligence SignalBoost already paid to discover before any new provider or AI spend.

Primary source: the full durable `outreach_queue` history that powers `/dashboard/outreach/contacts`.

Owner-only primary seed endpoint:

`POST /api/admin/business-intelligence-corpus/seed-outreach-history`

The seed reads the complete outreach queue in database pages, converts every reusable company/domain into a corpus record, deduplicates multiple outreach rows by canonical domain, merges known contacts and analysis metadata, preserves all queue ids as provenance, and upserts the resulting records into the durable Business Intelligence Corpus.

The seed makes **zero external provider calls and zero external AI calls**. It exists specifically to reuse discovery/analyzer work already purchased by SignalBoost.

The 23 READY records in `saas/data/prospects.json` remain available as a small curated supplemental seed through:

`POST /api/admin/business-intelligence-corpus/seed-curated`

After seeding, `/api/admin/business-intelligence-corpus/status` reports the durable corpus count toward the 5,000-record target. External enrichment remains governed by the existing confidence/freshness fallback policy and should occur only when reused internal intelligence is insufficient.

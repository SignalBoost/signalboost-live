# Existing COS company seed

The Business Intelligence Corpus starts with company intelligence COS already curated in `saas/data/prospects.json`.

Current seed size: 23 READY companies.

Use the owner-only endpoint:

`POST /api/admin/business-intelligence-corpus/seed-curated`

The seed is idempotent because records are upserted by canonical domain. Each record preserves its curated prospect id as provenance, maps the known contact email into corpus contacts, carries technical-fit and revenue-potential metadata, and receives a confidence score derived from the existing COS evaluation.

After execution, `/api/admin/business-intelligence-corpus/status` reports the durable corpus count toward the 5,000-record target.

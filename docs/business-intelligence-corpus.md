# Business Intelligence Corpus

Status: implementation batch
Target: ~5,000 curated company records

## Purpose

SignalBoost should reuse business intelligence it already owns before purchasing or regenerating the same information. The corpus is the internal-first company intelligence layer shared by COS, Prospect Intelligence, Enterprise Memory, the Knowledge Graph, Revenue Intelligence and future Portables.

## Execution flow

```text
Business/company lookup
        ↓
Business Intelligence Corpus
        ↓
confidence + freshness sufficient?
   ├─ yes → return internal record (no provider call)
   └─ no
        ↓
queue refresh / enrichment
        ↓
configured external prospect providers
        ↓
normalize + validate + confidence score
        ↓
Corpus upsert
        ↓
Enterprise Memory snapshot
        ↓
Knowledge Graph facts
        ↓
reuse on future requests
```

## Initial corpus

The target is 5,000 reusable company records. Bootstrap is internal-first:

1. import existing Enterprise Memory organizations;
2. ingest curated records in bounded batches;
3. enrich only missing, stale or low-confidence records through configured providers;
4. preserve provider provenance and verification timestamps;
5. stop paying for the same company intelligence once sufficient internal evidence exists.

The status API reports actual record count and completion against the 5,000 target. The architecture does not claim that 5,000 records exist until the stored count reaches 5,000.

## Confidence and freshness

Default sufficient confidence is 0.78. Records also carry explicit expiry dates. A provider fallback is permitted only when the internal record is missing, stale, or below the required confidence threshold.

## Background learning and refresh

Corpus maintenance is folded into the existing daily COS mining/learning execution rather than creating a second daily Vercel cron. Each daily run identifies stale/low-confidence records and, when live prospect-provider execution is enabled, processes a bounded refresh batch.

Successful enrichment is persisted back to the corpus and Enterprise Memory. This makes provider results durable corporate knowledge rather than one-use responses.

## Cost model

The intended order of operations is:

```text
Internal corpus → Enterprise Memory / Knowledge reuse → external data provider → AI escalation only when required
```

This reduces repeated commercial data-provider lookups. By improving the amount of structured internal context available to COS before reasoning, it also reduces unnecessary OpenAI/Anthropic research, summarization and rediscovery calls.

## Governance

The corpus tables use RLS and are accessed through trusted server-side/service-role boundaries. Refresh jobs are bounded, deduplicated per active domain, provenance is retained, and provider execution remains subject to the existing prospect-provider feature gate.

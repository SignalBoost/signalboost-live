# Business Intelligence Corpus

> Read `ONBOARD.md` first. Current subsystem status and cross-system handoff: `docs/marketing-sales-current-state.md`.

**Status:** architecture/workflow complete; corpus population is ongoing operational data growth.
**Target:** ~5,000 curated reusable company records.
**Last production observation (2026-08-10):** 461 unique companies / 5,000 = 9.22%. This count is dated; use the live dashboard/status endpoint for the current value.

## Purpose

SignalBoost reuses business intelligence it already owns before purchasing or regenerating the same information. The corpus is the internal-first company intelligence layer shared by COS, Prospect Intelligence, Enterprise Memory, the Knowledge Graph, Revenue Intelligence and future Portables.

The 5,000 target is a **data-population target, not an architecture-completion target**. The lookup, fallback, persistence, refresh and reuse workflow is implemented even while the stored population continues to grow.

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
configured external prospect providers, when permitted
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

`resolveBusinessIntelligence()` implements this order. Provider enrichers are not consulted when the internal record is sufficient. If an internal record exists but is stale or low-confidence, a bounded refresh is queued before/alongside any permitted provider fallback.

## Initial corpus and “never pay twice” rule

Bootstrap is internal-first:

1. reuse existing outreach history and already-discovered companies;
2. import existing Enterprise Memory organizations where applicable;
3. ingest curated records in bounded batches;
4. deduplicate by canonical company/domain identity;
5. enrich only missing, stale or low-confidence records through configured providers;
6. preserve provider provenance and verification timestamps;
7. persist successful enrichment back into internal stores so future requests do not buy the same intelligence again.

The outreach-history recovery path proved the intended pattern in production: historical rows were normalized into unique company identities and persisted without paid provider or external-AI rediscovery. A row count is never substituted for a company count.

## Storage and integration

Corpus persistence is durable and integrated into SignalBoost-owned intelligence:

- canonical corpus storage when available;
- Enterprise Memory fallback/persistence under the dedicated corpus profile namespace;
- Knowledge Graph facts for reusable structured company knowledge;
- refresh queue for stale/low-confidence records;
- provenance, verified/refreshed/expiry timestamps and confidence.

Enterprise Memory writes must preserve the corpus namespace rather than overwrite it during later enrichment.

## Confidence and freshness

Default sufficient corpus confidence is defined by the corpus contracts (currently 0.78 unless a lookup supplies a stricter threshold). Records carry explicit expiry/freshness state.

External-provider fallback is permitted only when the internal record is missing, stale, or below the required confidence threshold. The owner status API exposes this policy as:

- `internalFirst: true`
- `providerFallbackPolicy: confidence_or_freshness_insufficient_only`

## Automatic use

Consumers should call the corpus resolver/policy boundary rather than manually deciding when to use provider data. The expected behavior is automatic:

```text
Need company intelligence
→ internal corpus
→ Enterprise Memory / Knowledge reuse
→ provider fallback only if internal evidence is insufficient
→ persist successful enrichment internally
→ reuse next time
```

COS and Prospect Intelligence should not require an operator to say “use the corpus.”

## Background learning and refresh

Corpus maintenance is folded into COS learning/refresh execution rather than creating uncontrolled independent provider spend. Each run can identify stale/low-confidence records and process a bounded refresh batch when provider execution is configured and permitted.

Successful enrichment becomes durable corporate knowledge. Background learning must remain bounded, deduplicated, confidence-scored and provenance-aware.

## Cost model

Preferred order:

```text
Internal corpus
→ Enterprise Memory / Knowledge Graph / reuse
→ configured commercial data provider only when needed
→ external AI escalation only when required
```

This reduces repeated commercial-data lookups and unnecessary OpenAI/Anthropic research, summarization and rediscovery calls.

## Operator surface

Owner/admin dashboard:

`/dashboard/data/business-intelligence-corpus`

Status API:

`/api/admin/business-intelligence-corpus/status`

The dashboard reports actual stored company count, 5,000 target and percentage completion. Percentage must be calculated as `count / target * 100` (for example 461/5000 = 9.22%).

## Governance

Corpus tables use RLS and trusted server/service-role boundaries. Refresh jobs are bounded and deduplicated, provenance is retained, provider execution stays behind the prospect-provider feature/policy gate, and paid/provider calls must never be triggered simply to inflate the corpus count.

See also:

- `docs/marketing-sales-current-state.md`
- `saas/lib/business-intelligence-corpus/`
- `saas/lib/prospect-intelligence/corpus-policy.ts`
- `saas/lib/prospect-intelligence/corpus-telemetry.ts`

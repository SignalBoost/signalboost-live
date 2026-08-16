# COS Fresh-Data Routing Handoff — 2026-08-16

## Status

The canonical current-fact failure is fixed and production-verified.

For external facts whose truth depends on current world state, COS must not let pretrained model knowledge, exact/semantic answer cache, Enterprise Memory, Knowledge Graph, learned corpus, prior conversation, or local Qwen reasoning establish the current answer.

Canonical route:

```text
user question
→ classify as fresh external-world state
→ fresh/no-cache external retrieval on this turn
→ authority + evidence validation
→ Gemini synthesis constrained to only the retrieved evidence
→ server validation of evidence citations
→ provenance
```

For this route, Qwen/RunPod is not a precursor, fallback, or verifier. If live evidence or grounded synthesis is insufficient, fail closed.

## Why this rule exists

A local/pretrained model can remember facts from training, but it has no independent knowledge that those facts remain true now. Current officeholders, breaking news, market data, weather, sports status, outages, elections, laws/regulations, and similar facts can change after training and sometimes within seconds. Model fluency must never be confused with current verification.

The normal COS preference for durable/local intelligence therefore has an explicit freshness exception: freshness-sensitive external truth requires current external evidence before any answer can be accepted.

## Merged implementation

### PR #1232 — Make fresh COS facts live-data-first and skip RunPod

Merged application SHA:

`264ac358465961973af47337533578ba5b1e122b`

Production deployment verified READY:

`dpl_AnLNrzcCAcGbbZsTpUFGvjTqoLiP`

Key behavior:

- `saas/app/api/cos-primary/route.ts` intercepts fresh external-world questions before the normal cache/local path.
- retrieval uses `getExternalInfo(..., { bypassCache: true })`;
- volatile retrieval does not read or write the normal web-search cache;
- insufficient authority fails closed before model synthesis;
- fresh synthesis prefers Gemini;
- the grounded synthesis contract explicitly prohibits filling gaps from model memory;
- local fresh synthesis is not imported/called by this route;
- provenance reports `local_model_invoked: false` and `fresh_local_synthesis.attempted: false`;
- public officeholder answers require independent corroboration and must actually cite the government/authoritative source;
- provider-reported source publication/update time is preserved separately from retrieval time so an old page retrieved now cannot masquerade as newly published evidence.

Freshness routing tests cover natural wording including:

- `Who is the current President of the United States?`
- `Who is the President of the United States?`
- `Who is currently the president of the United States?”`
- `Is Donald Trump still the President of the United States?`

The classifier also avoids hijacking internal business state. Requests such as campaign results, sales-team availability, internal inventory, pricing strategy, or marketing creation belong to their owning system/connector, not public web search.

## Production acceptance

### PR #1233 — Add COS production freshness acceptance

Merged repository SHA:

`672da8156a9f47d5b6fb7058163bb5e88d97a42d`

This PR adds `.github/workflows/cos-production-freshness-acceptance.yml`. It is an acceptance harness only; it does not alter COS application logic.

Production acceptance run:

- workflow: `COS Production Freshness Acceptance`
- run ID: `31921872453`
- job ID: `95102882591`
- conclusion: `success`
- request window: `2026-08-16T02:25:59Z` through `2026-08-16T02:26:05Z`
- endpoint: `POST https://saas.signalboostapp.com/api/concierge`
- exact prompt: `Who is currently the president of the United States?”`
- HTTP: `200`

Observed response/runtime facts:

- source: `external_fresh_grounded`
- documents acquired: `6`
- evidence selected: `4`
- authority satisfied: `true`
- Gemini invoked: `true`
- provider: `gemini`
- model: `gemini-3.6-flash`
- local model invoked: `false`
- fresh local synthesis attempted: `false`
- answer origin from cache: `false`
- live external evidence used: `true`
- knowledge/memory/corpus factual inputs used: `false`
- volatile answer cache written: `false`
- route telemetry latency: `5239 ms`
- evidence stopping reason: `fresh_live_data_external_synthesis_accepted`

Accepted answer cited the authoritative sources actually used, including USAGov and the White House, plus an independent source. A conflicting/stale-looking CNN result present in the candidate evidence set was not cited in the accepted answer.

## RunPod proof

The production `/api/concierge` request intentionally carried same-origin browser headers. Runtime telemetry therefore showed:

```text
cos-browser-runpod-wake-permission: allowed=true
reason=same_origin_browser_turn
```

This proves an important distinction: permission to wake RunPod is only eligibility, not an instruction to wake it.

For the exact acceptance window, Vercel runtime logs showed:

- `fresh_external_evidence_result ... local_model_invoked=false`
- direct `providerRouter: calling gemini`
- `fresh_external_synthesis_result ... provider=gemini ... local_model_invoked=false`
- `cos-live-telemetry ... localModelInvoked=false`
- no `cos-runpod-lifecycle` entry
- no `cos-local-inference-telemetry` entry

Therefore the canonical current-officeholder request did not resume RunPod and did not invoke Qwen.

## Regression gate

`.github/workflows/saas-ci.yml` now contains a dedicated `COS fresh-data routing policy` job that runs:

```text
node --test \
  tests/cosFreshnessPolicy.node.test.ts \
  tests/cosFreshLiveRouting.node.test.ts \
  tests/cosFreshGrounding.node.test.ts
```

The exact PR #1232 head passed this gate, TypeScript, and the production Next.js build before merge.

Do not remove or weaken this gate to restore a generic local-first interpretation. The current-fact exception is intentional architecture.

## Important remaining distinction: high-frequency structured data

Do not overstate generic web retrieval as ticker-grade or sensor-grade real-time data.

For officeholders/current public facts, authoritative pages plus independent live retrieval are the implemented and production-verified path described above.

For high-frequency verticals such as stock/crypto prices, FX, weather conditions, and live sports scores, the preferred architecture is a structured real-time provider/API when available, with public web retrieval as corroboration where useful. Generic web snippets alone should not be described as equivalent to a live market/weather/sports feed.

Brave Search's current Rich Search capability can expose structured real-time vertical data (stocks, currency, cryptocurrency, weather, and supported sports) through the web-search rich callback flow. That capability was identified during this incident review but is not yet wired into COS in this handoff. Do not claim it is implemented until code plus production acceptance prove it.

## Non-negotiable future rule

When changing COS routing, ask first:

> Can this fact become false because the outside world changed after the model/cache/memory was created?

If yes, internal memory/model output cannot establish current truth. Retrieve current external evidence from the appropriate live system of record/provider first, then synthesize or reason over that evidence as needed.

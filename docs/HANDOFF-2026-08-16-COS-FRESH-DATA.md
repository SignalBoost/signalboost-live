# COS Fresh-Data Routing Handoff — 2026-08-16

## Status

The current-fact routing incident is fixed and production-verified, including the structured real-time extension for high-frequency public values.

For external facts whose truth depends on current world state, COS must not let pretrained model knowledge, exact/semantic answer cache, Enterprise Memory, Knowledge Graph, learned corpus, prior conversation, or local Qwen reasoning establish the current answer.

Ordinary current public facts now follow:

```text
user question
→ classify as fresh external-world state
→ fresh/no-cache external retrieval this turn
→ authority + evidence validation
→ Gemini synthesis constrained only to retrieved evidence
→ server validation of evidence citations
→ provenance
```

High-frequency public values such as stock quotes, FX and weather now follow:

```text
user question
→ classify as structured real-time state
→ structured real-time provider this turn
→ bounded evidence normalization
→ Gemini synthesis constrained only to structured evidence
→ server validation of evidence citations
→ provenance
```

For both routes, Qwen/RunPod is not a precursor, fallback, verifier, or source of current truth. If current evidence or grounded synthesis is insufficient, COS fails closed.

## Why this rule exists

A local/pretrained model can remember facts from training, but it has no independent knowledge that those facts remain true now. Current officeholders, breaking news, market data, weather, sports status, outages, elections, laws/regulations, and similar facts can change after training and sometimes within seconds. Model fluency must never be confused with current verification.

The normal COS preference for durable/local intelligence therefore has an explicit freshness exception: freshness-sensitive external truth requires current external evidence before an answer can be accepted.

## PR #1232 — fresh public facts are live-data-first

Merged application SHA:

`264ac358465961973af47337533578ba5b1e122b`

Production deployment verified READY:

`dpl_AnLNrzcCAcGbbZsTpUFGvjTqoLiP`

Key behavior:

- `saas/app/api/cos-primary/route.ts` intercepts fresh external-world questions before the normal cache/local path;
- retrieval uses `getExternalInfo(..., { bypassCache: true })`;
- volatile retrieval does not read or write the normal web-search cache;
- insufficient authority fails closed before model synthesis;
- fresh synthesis prefers Gemini;
- the synthesis contract explicitly prohibits filling gaps from model memory;
- local fresh synthesis is not imported/called by this route;
- provenance reports `local_model_invoked: false` and `fresh_local_synthesis.attempted: false`;
- officeholder answers require independent corroboration and must cite the authoritative source actually used;
- provider-reported publication/update time is kept separate from retrieval time.

Freshness routing tests cover natural wording including:

- `Who is the current President of the United States?`
- `Who is the President of the United States?`
- `Who is currently the president of the United States?”`
- `Is Donald Trump still the President of the United States?`

The classifier also avoids hijacking internal business state. Campaign results, internal inventory, pricing strategy, and similar private/business questions remain with their owning system or connector.

## PR #1233 — production acceptance for current public facts

Merged repository SHA:

`672da8156a9f47d5b6fb7058163bb5e88d97a42d`

Production acceptance run:

- workflow: `COS Production Freshness Acceptance`;
- run ID: `31921872453`;
- job ID: `95102882591`;
- request window: `2026-08-16T02:25:59Z` through `2026-08-16T02:26:05Z`;
- endpoint: `POST https://saas.signalboostapp.com/api/concierge`;
- exact prompt: `Who is currently the president of the United States?”`;
- HTTP: `200`;
- source: `external_fresh_grounded`;
- documents acquired: `6`;
- evidence selected: `4`;
- authority satisfied: `true`;
- provider: `gemini` / `gemini-3.6-flash`;
- local model invoked: `false`;
- fresh local synthesis attempted: `false`;
- answer origin from cache: `false`;
- live external evidence used: `true`;
- knowledge/memory/corpus factual inputs used: `false`;
- volatile answer cache written: `false`;
- route telemetry latency: `5239 ms`;
- stopping reason: `fresh_live_data_external_synthesis_accepted`.

The accepted answer cited authoritative sources actually used, including USAGov and the White House, plus an independent source. A conflicting/stale-looking CNN result present in the candidate evidence set was not cited in the accepted answer.

## RunPod proof for current public facts

The production `/api/concierge` request intentionally carried same-origin browser headers. Runtime telemetry showed:

```text
cos-browser-runpod-wake-permission: allowed=true
reason=same_origin_browser_turn
```

Permission to wake RunPod is only eligibility, not an instruction to wake it.

For the acceptance window, Vercel runtime logs showed:

- `fresh_external_evidence_result ... local_model_invoked=false`;
- direct `providerRouter: calling gemini`;
- `fresh_external_synthesis_result ... provider=gemini ... local_model_invoked=false`;
- `cos-live-telemetry ... localModelInvoked=false`;
- no `cos-runpod-lifecycle` entry;
- no `cos-local-inference-telemetry` entry.

Therefore the canonical current-officeholder request did not resume RunPod and did not invoke Qwen.

## PR #1235 — structured real-time provider boundary

Merged SHA:

`6c6a224acf2a934ee5c6e8163801b946cb2d348f`

Production deployment verified READY:

`dpl_64JeM82Tdqc1Jr7S3yHnBxmQtqBM`

High-frequency public values are now separated from ordinary webpage-based freshness checks:

- `cosFreshnessPolicy.ts` exports `structuredLiveDataKind(...)` for `weather`, `financial`, and `sports` live-value classes;
- conceptual/historical prompts and internal business state are excluded;
- `getStructuredLiveInfo.ts` adds an injectable `StructuredLiveDataPort`;
- the default adapter uses Brave Rich Search callback discovery and `/res/v1/web/rich` with `cache: no-store`;
- `getExternalInfo.ts` checks the structured-live class before ordinary web search when freshness bypass is active;
- the officeholder-style authority suffix is stripped before structured lookup so it cannot distort ticker/weather/sports recognition;
- if the structured provider cannot return a real-time record, the high-frequency path fails closed instead of degrading to a generic web snippet;
- structured provider evidence is normalized into one bounded, timestamped evidence item before Gemini synthesis;
- the same no-Qwen/no-cache/evidence-only Gemini policy remains in force.

## PR #1237 — permanent structured production acceptance

Merged SHA:

`e027fa0f48434de42ac461eb0ef02577efa3295f`

`.github/workflows/cos-production-freshness-acceptance.yml` now permanently exercises:

- `Weather in Paramaribo?`
- `What is the TSLA stock price?`
- `What is the USD to EUR exchange rate?`

The first production run proved weather and FX immediately. The initial TSLA job deliberately failed closed because the structured stock object was retrieved but the bounded scalar compactor did not surface enough current-quote fields for Gemini to establish the price.

That failure was safe and informative:

- structured evidence was retrieved;
- Gemini was invoked;
- `local_model_invoked=false`;
- no RunPod lifecycle resume occurred;
- no local Qwen inference occurred;
- COS returned insufficient evidence rather than inventing a price.

## PR #1239 — stock structured-evidence compaction correction

PR #1239 replaced the temporary/unmerged #1238 branch and was merged on top of the current main after PR #1236.

Merged SHA:

`ee84e3d85681bbf52f517f70eb3be8e837b32de6`

Exact production deployment verified READY:

`dpl_AWKmGRCDHTmjDmREBEx7DRqgW1b5`

The correction:

- normalizes camelCase, snake_case and dotted provider fields;
- gives exact current quote/rate fields highest priority;
- traverses likely answer-bearing object keys before bulky historical/chart metadata;
- preserves the 480-character final evidence cap;
- adds a regression where the current stock price is deliberately buried behind 350 irrelevant chart fields;
- adds the structured compactor regression to the dedicated COS fresh-data CI gate.

Production TSLA rerun against the exact READY deployment:

- workflow run: `31922459800`;
- job ID: `95105586723`;
- request window: `2026-08-16T02:52:18Z` through `2026-08-16T02:52:23Z`;
- prompt: `What is the TSLA stock price?`;
- HTTP: `200`;
- accepted answer: `The latest TSLA stock price is $342.27 USD.`;
- evidence: one `Brave Rich Search real-time stocks data` item;
- provider: `gemini` / `gemini-3.6-flash`;
- `local_model_invoked=false`;
- `fresh_local_synthesis.attempted=false`;
- answer origin from cache: `false`;
- volatile cache written: `false`;
- route telemetry latency: `4021 ms`;
- stopping reason: `fresh_live_data_external_synthesis_accepted`.

Vercel runtime logs for the exact TSLA acceptance window showed the same-origin browser request was eligible to wake RunPod, but there was no `cos-runpod-lifecycle` entry and no `cos-local-inference-telemetry` entry. The request went from structured live evidence directly to Gemini.

Weather and USD/EUR FX production acceptance jobs are also green under the same workflow and no-Qwen policy.

## Regression gate

`.github/workflows/saas-ci.yml` now contains a dedicated `COS fresh-data routing policy` job running:

```text
node --test \
  tests/cosFreshnessPolicy.node.test.ts \
  tests/cosFreshLiveRouting.node.test.ts \
  tests/cosFreshGrounding.node.test.ts \
  tests/cosStructuredLiveInfo.node.test.ts
```

The structured-live implementation and stock compaction correction passed this dedicated gate, TypeScript, and the production Next.js build before merge. The stock-fix preview for exact head `ca756c8d250ff7855379ed428caa31f0ca95d096` reached READY before the production correction was accepted.

Do not remove or weaken this gate to restore a generic local-first interpretation. The fresh/current exception is intentional architecture.

## Current architecture rule

Use the system that owns freshness:

- current officeholders and public facts → current authoritative live web evidence + Gemini synthesis;
- stock/FX/weather/supported sports live values → structured real-time provider + Gemini synthesis;
- private/internal business state → owning connector/database/API;
- local Qwen/RunPod → local reasoning when reasoning is actually required, not as a source of current external truth.

## Non-negotiable future rule

When changing COS routing, ask first:

> Can this fact become false because the outside world changed after the model/cache/memory was created?

If yes, internal memory/model output cannot establish current truth. Retrieve current external evidence from the appropriate live system of record/provider first, then synthesize or reason over that evidence as needed.

# COS Live Provenance Handoff — 2026-09-13

## Production defect

A Portuguese evaluative factual request such as `qual e a melhor selecao de futebol do mundo?` could bypass public freshness routing because the cross-language classifier did not normalize the ASCII Portuguese opener `qual`. COS could then synthesize current-sounding claims locally without live evidence.

A subsequent provenance question could also lose valid live source URLs because `authoritativeProvenance()` did not preserve `provenance.liveExternalEvidence` when converting COS telemetry into the durable canonical provenance record. Public provenance then reported only that the local reasoner was used.

The deterministic support provenance reply also followed `context.language` rather than the language of the actual follow-up, so a Portuguese `de onde veio essa informacao` could be answered in English.

## Invariants

1. Supported-language public factual lookups must enter freshness classification even when the user omits accents.
2. Evaluative sports questions use the existing bounded multi-query live research plan before local synthesis.
3. Exact live source URLs gathered by COS survive authoritative provenance canonicalization and persistence.
4. Public provenance lists recorded source URLs when they exist; it never reconstructs or invents sources.
5. If an answer was locally synthesized without live evidence, public provenance must say that no live web search/source URL was recorded and that current or mutable factual claims were not live-verified.
6. Public provenance never exposes private model/provider/route/tool identifiers.
7. Provenance follow-ups answer in the language of the actual user follow-up when a strong language signal is present, with UI locale only as fallback.

## Regression examples

- `qual e a melhor selecao de futebol do mundo?` → live verification required; sports research queries generated.
- `qual é a melhor seleção de futebol do mundo?` → same.
- Raw COS `liveExternalEvidence.sources` → preserved as canonical `live_external_evidence.sources`.
- `de onde veio essa informacao` with an English UI locale → provenance response remains Portuguese.

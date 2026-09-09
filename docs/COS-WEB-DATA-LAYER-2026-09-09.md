# COS Web Data Layer — Governed Training Acquisition

Date: 2026-09-09
Status: implementation contract for credible public-web training acquisition

## Purpose

The Web Data Layer gives COS University and specialist learning a governed way to search the public Internet for high-quality training material. It complements the existing specialized adapters (official feeds, Crossref, OpenAlex, Europe PMC, Open Library, GDELT, reference sources, and YouTube) rather than replacing them or creating another learning engine.

The objective is not corpus volume. The objective is better capability from credible, relevant, diverse evidence.

## Training flow

```text
verified weakness / learning objective
→ specialized source adapters + credible Web Data Layer discovery
→ source credibility classification
→ public-URL / SSRF safety gate
→ diverse-host selection
→ bounded readable-page acquisition
→ provenance + source-quality metadata
→ existing relevance / confidence / source-policy admission
→ durable study material
→ deliberate practice
→ unseen independent examination
→ transfer / Production evidence where applicable
→ capability standing
```

A fetched page is a training candidate, not learned knowledge and never academic credit.

## Source-quality policy

The credible-web lane structurally prioritizes:

1. standards and public-control authorities;
2. government, academic, and intergovernmental institutions;
3. scholarly publishers and research repositories;
4. the owning vendor/project/domain when the query entity matches the source domain or repository owner.

Tertiary references, community Q&A, social platforms, and self-publishing platforms do not meet the default Web Data Layer credibility threshold. Existing specialized adapters may still use a source class under their own explicit policy; this lane does not globally ban any source from every purpose.

Source quality and content relevance are separate axes. Passing the credibility gate does not bypass the existing COS learning relevance, grounding, confidence, provenance, deduplication, budget, probationary, or academic-integrity gates.

## Diversity

The Web Data Layer selects at most one page per source host in a single discovery result set. This reduces accidental training on several pages that all repeat one publisher's framing and increases independent-source diversity.

Cross-source agreement does not automatically make a claim true. Contradictions remain evidence for COS to reason about and, when necessary, trigger further study or independent verification.

## Retrieval safety

Only public HTTP(S) URLs are readable. The layer rejects localhost, private IPv4/IPv6 ranges, local/internal hostnames, embedded credentials, and non-web schemes before page retrieval.

Page reads are bounded by response size, content type, timeout, readable-text minimum, and retained-character maximum. Raw web pages are not copied into durable memory; the existing learning cycle retains bounded relevant summaries/facts plus provenance according to source rights policy.

## Cost boundary

Provider-free public discovery is the default. Brave Search may be used only when `COS_WEB_TRAINING_USE_BRAVE=true` and an existing `BRAVE_SEARCH_API_KEY` is available. A configured API key by itself does not authorize background paid search.

Configuration:

- `COS_WEB_TRAINING_ENABLED=false` — emergency/operational disable for the credible-web training lane.
- `COS_WEB_TRAINING_MIN_CREDIBILITY` — source credibility floor, bounded to 0.70–0.99; default 0.82.
- `COS_WEB_TRAINING_USE_BRAVE=true` — explicitly opt into Brave discovery for this background training lane.

The broader `COS_LIVE_SOURCES_ENABLED=false` kill switch still disables all external learning sources.

## Current-world boundary

The credible-web adapter participates in current-world learning alongside reference, official-document, news, and technology-feed adapters. High-frequency scalar facts such as weather, market prices, exchange rates, and sports scores remain answer-time structured-realtime data and are not stored as durable background learning merely because the Web Data Layer can search the web.

## Academic integrity

Web acquisition cannot:

- award a grade;
- satisfy an independent exam;
- manufacture Production verification;
- widen execution authority;
- count ingestion volume as mastery;
- turn model self-assessment into evidence.

The Web Data Layer exists to improve the quality of what COS studies. Demonstrated capability remains the standard for learning and graduation.

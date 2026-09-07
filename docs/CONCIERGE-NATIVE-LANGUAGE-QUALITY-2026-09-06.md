# Concierge native-language quality — 2026-09-06

SignalBoost Concierge supports English, Spanish, Portuguese, Polish, and Russian. Language support is a response-quality contract, not only a locale switch.

## Required behavior

- The browser-selected language must reach the Concierge/COS request context.
- Model-backed Concierge responses must be instructed to write directly in the selected language with natural grammar, idiom, register, and terminology rather than literal English-to-target translation.
- Polish output must specifically preserve grammatical case, verb aspect, gender and number agreement, natural word order, and a consistent Pan/Pani versus ty register.
- Deterministic fallback responses must be authored natively in all five supported languages. They must not fall back to English when COS inference is unavailable.
- Multilingual intent classification must recognize common native-language requests rather than depending only on English keywords.
- Language corrections may never change factual claims, URLs, citations, code, numbers, product names, or safety/governance boundaries.

## Regression gate

`tests/conciergeNativeLanguageQuality.node.test.ts` is the focused regression for the five-language contract. Existing contextual-interpretation ordering remains mandatory: language-quality handling cannot move supplied-context interpretation behind mature retrieval.

## Acceptance

A language is not considered production-quality merely because the response is understandable. Acceptance requires native-sounding grammar and register, no accidental English boilerplate, preserved meaning, and correct routing for representative native-language requests.

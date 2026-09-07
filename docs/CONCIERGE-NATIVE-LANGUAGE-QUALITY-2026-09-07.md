# Concierge native-language quality

Date: 2026-09-07

SignalBoost Concierge supports English, Spanish, Portuguese, Polish, and Russian. Support is defined as native-quality communication, not merely locale selection or translated UI chrome.

## Contract

- The selected browser language must reach Concierge/COS request context.
- Model-backed responses must be composed directly in the selected language with natural grammar, idiom, register, and terminology.
- Polish output must preserve grammatical case, verb aspect, gender/number agreement, natural word order, and consistent Pan/Pani versus ty register.
- Deterministic fallbacks must be authored natively in all five supported languages and must not revert to English boilerplate.
- Intent classification must recognize common native-language requests in all five languages.
- Language-only correction must preserve facts, numbers, URLs, citations, code, product identifiers, and governance/safety boundaries.
- Contextual interpretation remains ahead of mature retrieval.

## Regression

Focused regression: `saas/tests/conciergeNativeLanguageQuality.node.test.ts`.

A language is not considered production-quality merely because the output is understandable. Acceptance requires native-sounding grammar/register, preserved meaning, and no accidental English fallback.

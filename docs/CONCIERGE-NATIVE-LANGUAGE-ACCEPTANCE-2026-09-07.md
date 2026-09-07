# Concierge Native-Language Acceptance — 2026-09-07

## Scope

Public Concierge supports five languages: English (`en`), Spanish (`es`), Brazilian Portuguese (`pt`), Polish (`pl`), and Russian (`ru`). The merged language-quality work is not considered fully accepted until live Production behavior is observed against this contract.

## Release objective

Concierge must answer directly and naturally in the user-selected language rather than translating English-shaped prose after the fact. Language quality must not weaken factual accuracy, routing, safety, provenance, or latency reliability.

## Language contracts

### English
- Idiomatic professional English.
- Direct formulation rather than translation-like phrasing.
- Stable tone and terminology across turns.

### Spanish
- Natural, idiomatic professional Spanish.
- Consistent `tú`/`usted` register within a conversation.
- Neutral international Spanish when no regional preference is supplied.
- Avoid English syntactic calques and unnecessary English vocabulary.

### Brazilian Portuguese
- Brazilian Portuguese is the platform default for `pt`.
- Natural professional Brazilian phrasing.
- Correct agreement, government/regência, and pronoun placement.
- Avoid unnecessary anglicisms and English syntactic calques.

### Polish
- Natural, idiomatic professional Polish composed directly in Polish.
- Correct cases, gender, number, agreement, verb aspect, government/rekcja, and word order.
- Consistent `ty` versus `Pan/Pani` register.
- Avoid English syntactic calques and literal translation artifacts.

### Russian
- Natural, idiomatic professional Russian composed directly in Russian.
- Correct cases, gender, number, agreement, aspect, government, and natural word order.
- Consistent `вы`/`ты` register.
- Avoid English syntactic calques and literal translation artifacts.

## Functional invariants

Language handling must preserve all of the following:

1. User intent and requested task.
2. Facts, uncertainty, recommendations, and safety boundaries.
3. Names, numbers, URLs, code, markdown, citations, technical identifiers, product names, and literal UI labels.
4. Public/private routing boundaries and Concierge authority limits.
5. Freshness and evidence requirements.
6. Existing transport and timeout boundaries.
7. Deterministic fallback must remain in the selected language rather than leak English operational copy.

## Acceptance matrix

Run at least five live Production turns per language. Each language set must include:

1. **Ordinary conversation** — a short everyday question requiring fluent prose.
2. **Operational guidance** — a SignalBoost/Concierge workflow question.
3. **Writing transformation** — edit or rewrite a short message in the selected language.
4. **Reasoning task** — a short business or technical analysis that requires more than lookup.
5. **Fallback-sensitive task** — a request likely to exercise deterministic Concierge fallback or intent routing.

Minimum total: **25 fresh Production turns**.

## Pass criteria

A turn passes only when all applicable checks pass:

- Correct selected language throughout the answer, except literal names/UI labels/code that must remain unchanged.
- No unexplained English leakage in non-English answers.
- Native grammar and idiom are acceptable to a fluent speaker.
- Register is internally consistent.
- Meaning is not changed by language cleanup.
- No factual or provenance token is dropped or altered.
- Correct intent/routing behavior is retained.
- No new timeout/reliability regression is observed.

A language passes only when all five of its fresh turns pass. The release passes only when all five languages pass.

## Polish priority acceptance

Polish was the motivating quality failure and receives an additional native-speaker review before the release is called fully accepted. Review should explicitly check:

- case endings,
- gender/number agreement,
- verb aspect,
- government/rekcja,
- natural word order,
- `ty` versus `Pan/Pani` consistency,
- literal English calques.

A fluent native-speaker correction must be treated as evaluation evidence, not blindly learned as factual truth. Verified corrections may be converted into language-quality regression examples after review.

## Correction loop

For any failed turn:

1. Preserve the exact user prompt, selected language, answer, and observed defect.
2. Classify the failure as grammar, idiom, register, language leakage, routing, factual preservation, or latency/reliability.
3. Fix the general rule or first-pass language instruction when possible; do not hard-code the motivating sentence.
4. Add a regression covering the failure class.
5. Re-run the failed case plus at least one structurally different case in the same language.
6. Do not claim Production acceptance until the fresh rerun passes.

## Training policy

Do not begin model fine-tuning merely because one language sounds unnatural. The preferred order is:

1. first-pass native-language instruction,
2. deterministic localized fallback,
3. multilingual regression harness,
4. native-speaker correction loop,
5. fine-tuning/LoRA only after a meaningful corpus of verified correction pairs exists and measurable prompt-only improvements plateau.

## Current status

- Five-language quality contract: implemented and merged.
- Multilingual deterministic fallback: implemented and merged.
- Multilingual regression coverage: implemented and merged.
- Production deployment for merged change: green.
- Five-language live Production acceptance: **pending**.
- Polish native-speaker acceptance: **pending**.

Do not describe Concierge multilingual quality as fully Production-accepted until the live matrix above passes.

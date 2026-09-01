# Normative answer raw-snippet fallback repair — 2026-09-01

## Failure

When live evidence was acquired but both bounded local synthesis attempts failed, `/api/cos-primary` called `buildNormativeFreshEvidenceFallback`. That helper copied search-result titles and snippets into the public reply and marked the turn as a successful partial completion with confidence 0.75.

This produced retrieval debris rather than an answer. Page navigation, encoded entities, partisan titles, and institutional positions were exposed without synthesis, comparison, or relevance judgment.

## Required behavior

- Live evidence still routes through the existing bounded local synthesis attempts.
- A completed grounded synthesis may be released normally.
- Retrieved titles or snippets are evidence inputs only; they are never an answer.
- If synthesis fails, the request fails closed with the existing localized fresh-evidence failure reply.
- The failed turn is not marked answered, deterministic, or confidence 0.75.
- No external model fallback, weaker grounding gate, or topic-specific hard-coded answer is introduced.

## Regression

The motivating sports-eligibility question and noisy HTML-like snippets must produce no deterministic fallback. Non-normative and empty-evidence inputs remain unsupported by the helper. Route-level behavior continues through the ordinary failed-closed branch.

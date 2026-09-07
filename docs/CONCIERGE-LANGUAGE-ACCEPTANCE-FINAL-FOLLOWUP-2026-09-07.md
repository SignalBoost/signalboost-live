# Concierge language acceptance final follow-up — 2026-09-07

Fresh Production matrix after PR #1935 completed all 25 cases. Automated result: 24/25.

## Objective failure

- English operational guidance failed because the answer omitted the explicitly protected `ALPHA-42` literal.
- The native-language reviewer ran and reported confidence `1.0`, but still omitted the literal.
- The host release guard correctly changed the result to `handled=false` instead of silently releasing an instruction-violating answer.

This proves reviewer confidence is not enforcement. The repair contract is strengthened so a missing protected literal has an unambiguous final option: place the exact literal on a standalone line before the answer rather than return it missing. The existing host check still fails closed if the literal remains absent.

## Native-quality findings hidden by the old automated gate

Human inspection of otherwise passing cases found avoidable English process jargon:

- Spanish reasoning: `Trade-off`, `onboarding`.
- Brazilian Portuguese conversation/reasoning: `rollout`, `overhead`, `onboarding`.

These are not treated as native-quality evidence when a natural expression exists in the selected language. A narrow host-side acceptance signal now rejects `onboarding`, `rollout`, `overhead`, `trade-off`, and `scope creep` in non-English acceptance output unless the user's source text already contains the same term. Technical/product/code/UI labels outside this narrow vocabulary remain untouched.

## Release state

- No language is declared fully native-quality accepted yet.
- A fresh Production 25-case run is required after this repair.
- Automated PASS still does not replace fluent-human review.
- Reviewer confidence is diagnostic metadata only, never native-fluency proof.

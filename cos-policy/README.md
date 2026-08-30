<!-- path: /home/workdir/artifacts/cos-policy/README.md -->
<!-- repo: cos-policy/README.md -->

# COS controversial-question policy

Constraint first, commentary second — as a **reasoning loop**, not a per-question answer key.

## Load this at inference

```text
prompts/constraint-first-reasoner.txt
```

That file is the product change. It contains no gold answers. If you instead ship `pay-gap-answer-schema.md` as the thing the model follows, you are building a FAQ.

## Files

| File | Role |
| --- | --- |
| `prompts/constraint-first-reasoner.txt` | **Generator system prompt.** Procedure only. |
| `docs/reason-dont-template.md` | Why templates will not scale. |
| `docs/controversial-question-policy.md` | Human-readable policy and examples. Not the inference path. |
| `docs/why-pay-gap-answer-did-not-change.md` | Why the live pay-gap answer did not move. |
| `prompts/constraint-first-system.txt` | Older short policy. Prefer the reasoner. |
| `prompts/pay-gap-answer-schema.md` | Example of the bad approach (topic schema). Keep only as a reviewer illustration. |
| `evals/pay-gap-us.gold.md` | One regression check. Add unseen questions; do not grow a template farm. |

## What must change in the stack

The reasoner will not show up in answers if generation is still “repeat LIVE snippets in rank order.”

Allowed: sources own numbers and quotes.  
Required: the model owns the split, the constraint, and what the number does not prove.  
Required: if the user asked for like-for-like and retrieval does not have it, say so.

## Merge

1. Inject `constraint-first-reasoner.txt` into the running generator.
2. Stop treating source order as answer order.
3. Test with questions that were never templated, not only the pay-gap string.
4. Fail a PR that adds a new “correct first paragraph” for each topic.

# COS neural evidence fix — no hardcoded answers

Copy these files over the matching paths in `signalboost-live`.
Do not add a pay-gap paragraph, keyword map, or uncontrolled/controlled formatter.

## What was wrong

The pay-gap reply was a retrieval-shaped FAQ. Policy (`cos-policy/README.md`,
`reason-dont-template.md`, `constraint-first-reasoner.txt`) forbids that.

`constructEconomicFactsReply` on main already returns `null`. That is correct.
The remaining defects were control-plane, not missing gold text:

1. Official statistical questions were not marked authority-owned, so
   advocacy/HR blogs ranked equal to statistical agencies.
2. `freshEvidenceSearchQueries` injected hardcoded BLS/BEA series names for
   “evaluative” wording. That is a topic query farm.
3. No regression locked the “no topic answer schema” rule.

Neural synthesis (`freshEvidenceSynthesisContract.ts`, local/external Qwen
passes) already reasons over measurements. Do not replace it with a template.

## Files

| Path | Action |
|---|---|
| `saas/lib/ai/cos/officialSourceAuthority.ts` | Replace |
| `saas/lib/ai/cos/cosFreshGrounding.ts` | Replace only the marked functions (or whole file if you prefer the copy here) |
| `tests/cosNeuralEvidenceArchitecture.node.test.ts` | Add |
| `cos-policy/prompts/constraint-first-reasoner.txt` | Already correct on main; copy included for lockstep |

## What this does *not* do

- It does not decide whether a gender pay gap “exists”.
- It does not encode 81¢, 82¢, uncontrolled, or controlled.
- It does not mention gender in routing code.

Qwen/COS must infer the proposition from the question and the retrieved
measurements. Deterministic code only ranks owners, validates citations,
and rejects unsupported schemas.

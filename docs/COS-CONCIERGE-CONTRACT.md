PATH: docs/COS-CONCIERGE-CONTRACT.md
ACTION: CREATE this file. Paste everything BELOW the line. Do not paste the PATH line.

--------------------------------------------------------------------------------
# COS / Concierge contract — MANDATORY

Read this before any public or assistant change.

## One brain

- **COS** (dashboard Assistant / owner channel) is the only reasoning engine.
- **Concierge** is a public render window. It does not think. It does not keep a second model, a second prompt policy, or a second answer.
- The same question must produce the same COS answer on both surfaces, except the public window must not show reserved company information.

```text
user
 → COS (one reasoner)
 → if public surface: strip reserved company / stack / policy disclosure
 → render
```

Forbidden:

- A Concierge-only reasoner that invents a different list, a different refusal, or a different fact.
- Teaching Concierge “its own” knowledge path.
- Using “public/private pipelines” as an excuse for two brains.

Allowed difference (only this):

| Surface | Company-reserved policy, owner identity, model/provider/stack, internal metrics |
|---|---|
| COS / Assistant (owner) | May disclose what the owner is authorized to see |
| Concierge (public) | Must not disclose. Say the detail is not public. Continue with the rest of the answer when possible |

A football-club list, a flight question, a diagnosis brief — those are not reserved company policy. They must not fork.

## Code hook

`saas/lib/ai/cos/cosFirstAnswer.ts` → `tryCOSFirstAnswer`:

- Identity / SignalBoost-product questions: public-safe catalog path.
- All other questions: `tryEnterpriseCOSFirstAnswer` (the brain), then `publicDisclosureViolations` before render.

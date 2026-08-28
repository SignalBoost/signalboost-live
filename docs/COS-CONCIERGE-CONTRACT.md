# COS / Concierge contract — MANDATORY

Read this before any public or assistant change.

## One brain

- **COS** (dashboard Assistant / owner channel) is the only reasoning engine.
- **Concierge** is a public render window. It does not think. It does not keep a second model, a second prompt policy, or a second answer.
- The same ordinary question must use the same COS reasoning policy on both surfaces, except the public window must not disclose reserved company information.

```text
user
 → COS (one reasoner / one policy)
 → if public surface: enforce reserved-company disclosure boundary
 → render
```

Forbidden:

- A Concierge-only reasoner that invents a different list, a different refusal, or a different fact.
- Teaching Concierge its own knowledge path.
- Using public/private delivery as an excuse for two brains.

Allowed difference:

| Surface | Company-reserved policy, owner identity, model/provider/stack, internal metrics |
|---|---|
| COS / Assistant (owner) | May disclose what the owner is authorized to see |
| Concierge (public) | Must not disclose reserved information; continue with the ordinary answer when possible |

A football-club list, a flight question, a diagnosis brief, or another ordinary factual/reasoning request is not reserved company policy and must not fork merely because it is rendered publicly.

## Public-world research rule

A real-world named catalog or directory is external factual content even when it is not a clock-sensitive "current fact".

Examples include neighborhood/amateur football clubs, local associations, museums, restaurants, schools, streets, companies, and similar named-entity lists.

For these requests:

1. If COS already has adequate admissible evidence, it may use it.
2. If the catalog is thin or not actually grounded, COS must research public pages before answering.
3. Names may not be invented merely to satisfy a requested count.
4. A published/cultural/reference list must not be presented as an official current roster, registration sheet, or this-weekend entrant list unless the retrieved source establishes that current status.
5. Public-web findings must not be described as Enterprise Memory, a secret database, or model memory.
6. Current entrants, schedules, scores, prices, office holders, or other clock-sensitive facts remain on the stricter live-verification path.

## Code hooks

`saas/lib/ai/cos/cosFirstAnswer.ts` → `tryCOSFirstAnswer` remains the shared COS entrypoint.

`saas/lib/ai/cos/knowledgeAccessPolicy.ts` decides whether a request is:

- `internal_first` — static/historical/method reasoning;
- `live_required` — clock-sensitive external state;
- `search_if_thin` — externally checkable catalogs/directories that require public research when not adequately grounded.

`saas/lib/ai/cos/listCatalogIntent.ts` may select a dedicated public-page catalog extractor. It covers large amateur/neighborhood-football lists and São Paulo samba-school group lists, where the authoritative page must be read rather than inferred from search snippets or model memory. The path searches public pages, preserves list structure during extraction, accepts names only from the source's explicit requested group section (never navigation or parade-page chrome), deduplicates names, stops at the requested count, and reports a shortfall rather than padding invented names. It is a retrieval/extraction path under COS policy, not a second brain. Other named catalogs use the governed `search_if_thin` retrieval + COS synthesis path.

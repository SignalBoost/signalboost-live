# saas-root notes: copy targets for signalboost-live

This file is notes only. Do not deploy it as app code.

## Repo paths (these are the only paths that matter)

Replace or add these files inside the GitHub repo `SignalBoost/signalboost-live`:

```
saas/lib/ai/cos/officialSourceAuthority.ts
saas/lib/ai/cos/cosFreshGrounding.ts
saas/lib/ai/cos/freshEvidenceSynthesisContract.ts
saas/tests/cosNeuralEvidenceArchitecture.node.test.ts
```

Optional lockstep copy:

```
cos-policy/prompts/constraint-first-reasoner.txt
```

Vercel runs `node scripts/vercel-cos-gates.mjs` from the repo, and the Node tests live under `saas/tests/`, not repo-root `tests/`.

## Why the last deploy failed

`saas/tests/cosFreshGrounding.node.test.ts` still requires evaluative office questions to search unemployment / CPI / GDP series.

```
evaluative office questions search economic series instead of opinion lists
assert.ok(queries.some(query => /unemployment/i.test(query)))
```

Search queries for those series are restored. The answer formatter stays null. That existing test should pass again.

## Copy commands from this patch folder

```bash
cp saas/lib/ai/cos/officialSourceAuthority.ts \
   /path/to/signalboost-live/saas/lib/ai/cos/officialSourceAuthority.ts

cp saas/lib/ai/cos/cosFreshGrounding.ts \
   /path/to/signalboost-live/saas/lib/ai/cos/cosFreshGrounding.ts

cp saas/lib/ai/cos/freshEvidenceSynthesisContract.ts \
   /path/to/signalboost-live/saas/lib/ai/cos/freshEvidenceSynthesisContract.ts

cp saas/tests/cosNeuralEvidenceArchitecture.node.test.ts \
   /path/to/signalboost-live/saas/tests/cosNeuralEvidenceArchitecture.node.test.ts
```

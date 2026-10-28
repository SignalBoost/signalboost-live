// saas/tests/cosSuppliedFactsNotRefusedForLiveSources.node.test.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { PAC_CATALOG } from '../lib/builder/campaign/catalog.ts'
import { requiresFreshExternalEvidence } from '../lib/ai/cos/cosFreshnessPolicy.ts'
import { mustFailClosedWithoutAuthoritativeLiveEvidence } from '../lib/ai/cos/liveEvidenceFailClosed.ts'

const route = readFileSync(new URL('../app/api/cos-primary/route.ts', import.meta.url), 'utf8')
const incident = PAC_CATALOG.find(item => item.id === 'PAC-03')!.prompt!

test('the word rules mark a self-contained incident report as needing live evidence', () => {
  // Production 2026-10-28 (COS-PAC-001, PAC-03): refused as "live evidence unavailable".
  assert.equal(requiresFreshExternalEvidence(incident), true)
  assert.equal(mustFailClosedWithoutAuthoritativeLiveEvidence(incident), true)
})

test('without authoritative live evidence, only a confident self-contained reading answers locally', () => {
  const at = route.indexOf('if(!authoritySatisfied){')
  const branch = route.slice(at, route.indexOf('} else {', at))
  // Codex on #4979: a positive self-contained reading is required, never merely the absence of a live-facts finding.
  assert.match(branch, /\|\|\(freshSources\.length>0&&liveFactsIntent!==null&&liveFactsIntent\.suppliedContextPrimary===true\s*&&liveFactsIntent\.externalFactsRequired===false&&liveFactsIntent\.confidence>=0\.72\)\)/)
  assert.doesNotMatch(branch, /semanticIntentRequiresFreshness/)
  assert.match(branch, /freshMissUseLocal=true/)
  // The judge reads the request when it has not already; its verdict, not the word rules, decides.
  assert.match(route, /const liveFactsIntent=!authoritySatisfied&&freshSources\.length\n\s*\? semanticTaskIntent\?\?await classifyCosSemanticTaskIntent\(/)
})

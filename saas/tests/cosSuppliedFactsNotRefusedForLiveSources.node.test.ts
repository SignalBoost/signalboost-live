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

test('only a positive live-facts reading by the judge refuses when search finds nothing authoritative', () => {
  const at = route.indexOf('if(!authoritySatisfied){')
  const branch = route.slice(at, route.indexOf('} else {', at))
  assert.match(branch, /\|\|\(freshSources\.length>0&&liveFactsIntent!==null&&!semanticIntentRequiresFreshness\(liveFactsIntent\)\)/)
  assert.match(branch, /freshMissUseLocal=true/)
  // The judge reads the request when it has not already; its verdict, not the word rules, decides.
  assert.match(route, /const liveFactsIntent=!authoritySatisfied&&freshSources\.length\n\s*\? semanticTaskIntent\?\?await classifyCosSemanticTaskIntent\(/)
})

test('the judge refuses only on a confident live-facts finding', () => {
  const judge = readFileSync(new URL('../lib/ai/cos/cosSemanticTaskIntent.ts', import.meta.url), 'utf8')
  const at = judge.indexOf('export function semanticIntentRequiresFreshness(')
  assert.match(judge.slice(at, at + 300), /intent\.mode === 'external_fact_verification'\s*&& intent\.externalFactsRequired\s*&& intent\.confidence >= 0\.72/)
})

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { requiresFreshExternalEvidence } from '../lib/ai/cos/cosFreshnessPolicy.ts'

const prompt = 'It is T-minus 24 hours before launch. InfoSec discovered a high-severity zero-day vulnerability allowing unauthorized read access to tenant metadata. Deliver a go/no-go recommendation.'
test('security release scenario enters live-evidence routing despite authoring form', () => assert.equal(requiresFreshExternalEvidence(prompt), true))
test('security release outage has bounded no-go continuity guidance', () => {
  const source = readFileSync(new URL('../app/api/cos-primary/baseRoute.ts', import.meta.url), 'utf8')
  assert.match(source, /GO\/NO-GO: NO-GO/)
  assert.match(source, /freshEvidenceUnavailableReply\(language,input\)/)
  assert.match(source, /securityScenarioEvidenceIsSpecific/)
  assert.match(source, /if\(!locator\)return false/)
})

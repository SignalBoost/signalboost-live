// saas/tests/cosUniversityMassEvaluationHttpDetail.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../lib/ai/cos/cosUniversityMassDistilledArtifactEvaluation.ts', import.meta.url), 'utf8')

test('a rejected RunPod evaluation call records the provider reason, the call role and the batch size', () => {
  assert.match(source, /const detail=clean\(\(await response\.text\(\)\.catch\(\(\)=>''\)\)\.replace\(\/\\s\+\/g,' '\),240\)/)
  assert.match(source, /const role=input\.model===BASE_MODEL_ID\?'baseline':'candidate'/)
  assert.match(source, /throw new Error\(`mass_distilled_evaluation_runpod_http_\$\{response\.status\}:\$\{role\}:cases=\$\{input\.cases\.length\}:\$\{detail\}`\)/)
})

test('the status prefix stays first so existing readers of mass_distilled_evaluation_runpod_http_ still match', () => {
  assert.equal((source.match(/mass_distilled_evaluation_runpod_http_\$\{response\.status\}/g) || []).length, 1)
})

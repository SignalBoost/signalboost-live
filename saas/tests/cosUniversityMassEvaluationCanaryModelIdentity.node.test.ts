// saas/tests/cosUniversityMassEvaluationCanaryModelIdentity.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const evaluator = readFileSync(new URL('../lib/ai/cos/cosUniversityMassDistilledArtifactEvaluation.ts', import.meta.url), 'utf8')
const provision = readFileSync(new URL('../lib/ai/cos/runpodMassDistilledProvisionV2.ts', import.meta.url), 'utf8')

test('mass evaluator uses the exact model identity proved by the passed canary', () => {
  assert.doesNotMatch(evaluator, /function candidateModelName\(artifactHash:string\)/)
  assert.match(evaluator, /e\.claim==='local_distilled_runtime_canary_passed'/)
  assert.match(evaluator, /clean\(e\.artifactHash,64\)\.toLowerCase\(\)===claim\.artifactHash/)
  assert.match(evaluator, /clean\(e\.endpointId,120\)===claim\.endpointId/)
  assert.match(evaluator, /e\.exactArtifact===true/)
  assert.match(evaluator, /e\.productionTrafficAuthorized===false/)
  assert.match(evaluator, /const model=training\.candidateModel/)
})

test('canary model identity matches the runtime-keyed provider naming contract', () => {
  assert.match(provision, /modelName: `itmounts-mass-distilled-\$\{suffix\}-\$\{runtimeKey\}`/)
  assert.match(evaluator, /expectedPrefix=`itmounts-mass-distilled-\$\{claim\.artifactHash\.slice\(0,12\)\.toLowerCase\(\)\}-`/)
  assert.match(evaluator, /clean\(e\.model,240\)\.startsWith\(expectedPrefix\)/)
})

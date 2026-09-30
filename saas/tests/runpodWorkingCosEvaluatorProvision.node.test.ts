import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const source=readFileSync(new URL('../lib/ai/cos/runpodWorkingCosEvaluatorProvision.ts',import.meta.url),'utf8')
test('Working COS evaluator provisioning is scale-to-zero, exact-identity and bounded',()=>{
  assert.match(source,/workingCosEvaluatorRuntimeBinding/)
  assert.match(source,/workingCosEvaluatorInlineContainer/)
  assert.match(source,/memory\|\|0\)>=48/)
  assert.match(source,/MAX_HOURLY_USD/)
  assert.match(source,/workers:\{min:0,max:1,idleTimeout:IDLE\}/)
  assert.match(source,/baseRevision===input\.baseRevision/)
  assert.match(source,/adapterRevision===input\.adapterRevision/)
  assert.match(source,/for\(const model of \[input\.baseModelId,input\.modelName\]\)/)
  assert.match(source,/exactArtifact:true,baselineAndTrained:true/)
  assert.doesNotMatch(source,/productionTrafficAuthorized:true/)
})

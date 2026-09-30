import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const admission=readFileSync(new URL('../lib/ai/cos/cosWorkingDistillationEvaluationAdmission.ts',import.meta.url),'utf8')
const runtime=readFileSync(new URL('../lib/ai/cos/cosWorkingDistillationEvaluatorRuntime.ts',import.meta.url),'utf8')

test('Working COS evaluator binds exact 30B adapter identity without using mass 4B runtime',()=>{
  assert.match(admission,/artifactRevision:string/)
  assert.match(admission,/hf:\\\/\\\/models/)
  assert.match(runtime,/readWorkingCosEvaluationAdmission/)
  assert.match(runtime,/transformers_peft_exact_adapter/)
  assert.match(runtime,/baseModelId:admission\.baseModelId/)
  assert.match(runtime,/baseModelRevision:admission\.baseModelRevision/)
  assert.match(runtime,/adapterModelId/)
  assert.match(runtime,/adapterRevision/)
  assert.match(runtime,/productionTrafficAuthorized:false/)
  assert.match(runtime,/authorityExpanded:false/)
  assert.doesNotMatch(runtime,/runMassDistilledArtifactEvaluation/)
  assert.doesNotMatch(runtime,/Qwen3-4B/)
})

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
const source=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8')

test('XSA serving gateway loads the exact shared runtime and installs it before readiness',()=>{
  const runtime=source('../lib/ai/cos/runpodXsaServingRuntime.ts')
  assert.match(runtime,/cos-university-xsa-runtime\.py/)
  assert.match(runtime,/xsa_serving_runtime_contract_invalid/)
  assert.match(runtime,/runtime\.install_qwen3_xsa\(model\)/)
  assert.match(runtime,/installedAttentionLayers/)
  assert.match(runtime,/exclusive_self_attention_v1/)
  assert.match(runtime,/xsa_exact_model_mismatch/)
  assert.match(runtime,/XSA_SERVING_RUNTIME_IMPLEMENTED=true/)
})

test('RunPod provisioning separates XSA from standard-attention serving',()=>{
  const provision=source('../lib/ai/cos/runpodMassDistilledProvisionV2.ts')
  assert.match(provision,/input\.attentionArchitecture === 'exclusive_self_attention_v1'/)
  assert.match(provision,/xsaRuntimeInlineContainer\(input, modelName\)/)
  assert.match(provision,/massDistilledRuntimeInlineContainer\(input, modelName\)/)
  assert.match(provision,/itmounts_xsa_gateway\.py/)
  assert.match(provision,/itmounts_mass_gateway\.py/)
})

test('canary and independent evaluator bind XSA architecture evidence fail closed',()=>{
  const deploy=source('../app/api/cron/runpod-mass-distilled-local-deploy/route.ts')
  const served=source('../lib/ai/cos/cosUniversityMassEvaluationServedModel.ts')
  const evaluation=source('../lib/ai/cos/cosUniversityMassDistilledArtifactEvaluation.ts')
  assert.match(deploy,/xsaTrainingApplied===true/)
  assert.match(deploy,/mass_distilled_xsa_training_receipt_invalid/)
  assert.match(deploy,/servingRuntime:input\.attentionArchitecture==='exclusive_self_attention_v1'\?'transformers_xsa':'vllm'/)
  assert.match(served,/event\.evidence\?\.servingRuntime === 'transformers_xsa'/)
  assert.match(evaluation,/mass_distilled_evaluation_xsa_receipt_invalid/)
  assert.match(evaluation,/attentionArchitecture:training\.attentionArchitecture/)
})

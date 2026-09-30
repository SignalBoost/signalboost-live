import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const runtime=readFileSync(new URL('../lib/ai/cos/runpodWorkingCosEvaluatorRuntime.ts',import.meta.url),'utf8')

test('Working COS 30B evaluator serves exact base and adapter from one isolated PEFT runtime',()=>{
  assert.match(runtime,/AutoModelForCausalLM/)
  assert.match(runtime,/PeftModel\.from_pretrained/)
  assert.match(runtime,/snapshot_download,repo_id=BASE_ID,revision=BASE_REV/)
  assert.match(runtime,/snapshot_download,repo_id=ADAPTER_ID,revision=ADAPTER_REV/)
  assert.match(runtime,/model\.disable_adapter\(\) if baseline/)
  assert.match(runtime,/working_cos_exact_model_mismatch/)
  assert.match(runtime,/working_cos_independent_evaluator_runtime_v1/)
  assert.match(runtime,/productionTrafficAuthorized!==false/)
  assert.match(runtime,/authorityExpanded!==false/)
  assert.doesNotMatch(runtime,/CURRENT_UNIVERSITY_STUDENT_PROFILE/)
  assert.doesNotMatch(runtime,/Qwen3-4B/)
  assert.doesNotMatch(runtime,/productionTrafficAuthorized:true/)
})

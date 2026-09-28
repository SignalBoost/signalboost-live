// saas/tests/xsaGatewayBaselineServing.node.test.ts
//
// Production 2026-09-26..28: every exam of an XSA-trained student died on its first question with
// mass_distilled_evaluation_runpod_http_409:baseline:...{"detail":"xsa_exact_model_mismatch"} (82 exams, 26 students).
// The evaluator asks the UNTRAINED base model the same questions on the student's own endpoint; the standard vLLM
// gateway serves both names, the XSA gateway refused the base name. The XSA gateway now serves the true base
// (XSA hooks removed AND adapter disabled, then XSA reinstalled and re-proven), verified on a tiny Qwen3 + LoRA:
// baseline logits equal the pristine base model's, and the candidate's are unchanged after switching back.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const gateway = readFileSync(new URL('../../runpod/exact-artifact/xsa_gateway.py', import.meta.url), 'utf8')
const massGateway = readFileSync(new URL('../../runpod/exact-artifact/mass_gateway.py', import.meta.url), 'utf8')

test('the XSA gateway accepts the base model name and still refuses any other name', () => {
  assert.match(gateway, /if req\.model not in \(MODEL,BASE_ID\): raise HTTPException\(status_code=409,detail="xsa_exact_model_mismatch"\)/)
  assert.doesNotMatch(gateway, /if req\.model!=MODEL:/)
  // Same contract the standard gateway already had.
  assert.match(massGateway, /payload\.get\("model"\) not in \(BASE_ID,MODEL\)/)
})

test('the baseline is the true base: XSA removed and the adapter disabled, then XSA reinstalled and re-proven', () => {
  assert.match(gateway, /baseline=req\.model==BASE_ID/)
  assert.match(gateway, /xsa_runtime\.remove_qwen3_xsa\(model\)<=0/)
  assert.match(gateway, /model\.disable_adapter\(\) if baseline else contextlib\.nullcontext\(\)/)
  assert.match(gateway, /finally:\n\s+if baseline:\n\s+receipt=xsa_runtime\.install_qwen3_xsa\(model\)/)
  assert.match(gateway, /bootstrap_error="xsa_reinstall_unproven";ready\.clear\(\)/)
  // One generation at a time, so a baseline switch can never overlap a candidate request.
  assert.match(gateway, /async with generate_lock:/)
})

test('a loading XSA worker answers 204 like the standard gateway, so a cold-start wake is not an error', () => {
  assert.match(gateway, /if not ready\.is_set\(\): return Response\(status_code=204\)/)
  assert.doesNotMatch(gateway, /xsa_runtime_loading/)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { formatChatInferenceTrail } from '../lib/ai/cos/chatInferenceTrail.ts'
import { planContextWindow, estimateQwenContextTokens } from '../lib/ai/context-window-manager.ts'
import { stripInternalEvidenceIds } from '../lib/ai/cos/answerEvidenceIdHygiene.ts'
import { transportFailureTag } from '../lib/ai/local-inference.ts'

test('the provenance reply shows which provider was tried for the answer and why it failed', () => {
  // The rows the owner had to fetch with SQL on 2026-09-30 01:37 UTC, now rendered in the chat itself.
  const line = formatChatInferenceTrail([
    { at: '2026-09-30T01:37:04.100Z', provider: 'runpod', feature: 'cos_interactive', success: false, latencyMs: 8, promptTokens: null, completionTokens: null, finishReason: 'error:Error:context_window_too_large est:15400 win:16384 out:600' },
    { at: '2026-09-30T01:37:22.000Z', provider: 'deepinfra', feature: 'cos_interactive', success: true, latencyMs: 17691, promptTokens: 12059, completionTokens: 323, finishReason: 'stop' },
  ])
  assert.equal(line, '01:37:04 runpod FAILED 8 ms — error:Error:context_window_too_large est:15400 win:16384 out:600 → 01:37:22 deepinfra OK 17.7 s, 12059 in / 323 out')
  assert.equal(formatChatInferenceTrail(null), 'unavailable')
  assert.match(formatChatInferenceTrail([]), /no chat-answer model call recorded/)
})

test('both live-state renderers print the trail, read from provider_inference_usage around the answered turn', () => {
  const live = readFileSync(new URL('../lib/ai/cos/cosOrchestrationLive.ts', import.meta.url), 'utf8')
  assert.match(live, /`Chat Inference Calls   : \$\{formatChatInferenceTrail\(state\?\.chatInference\)\}`/)
  const state = readFileSync(new URL('../lib/ai/cos/cosLiveSystemState.ts', import.meta.url), 'utf8')
  assert.match(state, /from\('provider_inference_usage'\)/)
  assert.match(state, /\.eq\('purpose','user_facing_response'\)/)
  assert.match(state, /chatInference=await readChatInferenceTrail\(db,lastTurnRecord\?\.updatedAt\?\?null\)/)
  assert.match(state, /Chat Inference Calls   : \$\{formatChatInferenceTrail\(state\.chatInference\)\}/)
})

test('a RunPod chat call shortens its reply budget instead of cutting evidence, and refuses with a readable reason', () => {
  const system = 'word '.repeat(8_150)
  const plan = planContextWindow({
    model: 'qwen3:30b', provider: 'runpod', contextWindowTokens: 16_384, systemPrompt: system,
    messages: [{ role: 'user', content: 'evidence '.repeat(3_900) }],
    requestedOutputTokens: 1_000, minimumOutputTokens: 600, estimateTokens: estimateQwenContextTokens, compactInput: false,
  })
  assert.equal(plan.truncatedCharacters, 0)
  assert.equal(plan.droppedMessages, 0)
  assert.ok(plan.maxOutputTokens >= 600 && plan.maxOutputTokens < 1_000, `output ${plan.maxOutputTokens}`)

  let reason = ''
  try {
    planContextWindow({
      model: 'qwen3:30b', provider: 'runpod', contextWindowTokens: 16_384, systemPrompt: system,
      messages: [{ role: 'user', content: 'evidence '.repeat(6_000) }],
      requestedOutputTokens: 1_000, minimumOutputTokens: 600, estimateTokens: estimateQwenContextTokens, compactInput: false,
    })
  } catch (error) { reason = transportFailureTag(error) }
  // Survives the telemetry column intact, numbers included.
  assert.match(reason, /^error:Error:context_window_too_large est:\d+ win:16384 out:600$/)
  assert.ok(reason.length <= 80)
})

test('the RunPod chat call plans without cutting input', () => {
  const source = readFileSync(new URL('../lib/ai/local-inference.ts', import.meta.url), 'utf8')
  assert.match(source, /config\.refuseInputCompaction === true \? \{ compactInput: false \} : \{\}/)
  assert.match(source, /config\.refuseInputCompaction === true \? Math\.min\(600, requestedMaxTokens\)/)
})

test('a citation marker between two sentences is dropped, not rendered as "the retrieved evidence"', () => {
  // Production answer 2026-09-30 02:07 UTC.
  const cleaned = stripInternalEvidenceIds('Liveness probes restart the container, ensuring the container remains healthy. [CL1] Kubernetes has become the de facto standard for container orchestration. [CL2] Kubernetes facilitates deployment of microservices.')
  assert.equal(cleaned, 'Liveness probes restart the container, ensuring the container remains healthy. Kubernetes has become the de facto standard for container orchestration. Kubernetes facilitates deployment of microservices.')
  // A marker that IS the subject still reads correctly.
  assert.equal(stripInternalEvidenceIds('Revenue grew. [OEM1] shows that churn fell while [KG2] indicates growth.'), 'Revenue grew. The retrieved evidence shows that churn fell while the retrieved evidence indicates growth.')
})

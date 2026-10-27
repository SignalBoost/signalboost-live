import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { shouldResolveSemanticPublicIdentity } from '../lib/ai/cos/publicConciergeIdentityIntent.ts'
import { shouldResolveSemanticVisualRequest } from '../lib/visuals/semanticIntent.ts'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('ordinary locally-answerable questions skip optional identity and visual semantic routers', () => {
  for (const prompt of [
    'What is photosynthesis?',
    'Explain compound interest.',
    'Why does ice float?',
    'Qual é a capital de Portugal?',
  ]) {
    assert.equal(shouldResolveSemanticPublicIdentity(prompt), false, prompt)
    assert.equal(shouldResolveSemanticVisualRequest([{ role: 'user', content: prompt }], prompt), false, prompt)
  }
})

test('domain-shaped ambiguity still receives bounded semantic routing', () => {
  assert.equal(shouldResolveSemanticPublicIdentity('Remind me what service I am using right now'), true)
  assert.equal(shouldResolveSemanticVisualRequest(
    [{ role: 'user', content: 'create a golden retriever wearing sunglasses on a skateboard' }],
    'create a golden retriever wearing sunglasses on a skateboard',
  ), true)
  assert.equal(shouldResolveSemanticVisualRequest([
    { role: 'user', content: 'design a new logo for iTMounts' },
    { role: 'assistant', content: 'first version' },
    { role: 'user', content: 'do something better' },
  ], 'do something better'), true)
})

test('deterministic classifier controls survive the COS worker boundary without a 256-token floor', () => {
  const control = read('../lib/ai/cos/cosReasoningControlPlane.ts')
  const workers = read('../lib/ai/cos/cosReasoningWorkers.ts')

  for (const field of ['disableThinking', 'timeoutMs', 'allowConfiguredFallback', 'persistUsage']) {
    assert.match(control, new RegExp(field))
    assert.match(workers, new RegExp(`request\\.${field}`))
  }
  assert.match(workers, /deterministicControl = request\.disableThinking === true && request\.jsonObject === true/)
  assert.match(workers, /Math\.max\(8, Math\.min\(Math\.floor\(requestedTokens\), COS_ROLE_TOKEN_CAPS\[role\]\)\)/)
})

test('Qwen deterministic calls receive all supported no-thinking controls', () => {
  const source = read('../lib/ai/local-inference.ts')
  assert.match(source, /reasoning_effort: reasoningEffort/)
  assert.match(source, /think: false/)
  assert.match(source, /chat_template_kwargs: \{ enable_thinking: false \}/)
  assert.match(source, /\/no_think/)
  assert.match(source, /runpodSmallBudgetThinkingOff/)
})

test('browser telemetry separates pre-answer routing from answerability outcome', () => {
  const source = read('../app/api/cos-browser/route.ts')
  assert.match(source, /\[cos-answerability-first\]/)
  assert.match(source, /preAnswerRoutingMs/)
  assert.match(source, /\[cos-answerability-outcome\]/)
  assert.match(source, /fresh_verification_required/)
  assert.match(source, /local_answer_available/)
  assert.match(source, /local_answer_insufficient/)
})

test('self-contained authoring selects deterministic or creative cognition instead of one fixed profile', () => {
  const source = read('../app/api/cos-primary/route.ts')
  assert.match(source, /type FastAuthoringCognitiveMode = 'deterministic' \| 'creative'/)
  assert.match(source, /temperature:cognitiveMode==='creative'\?\.75:\.35/)
  assert.match(source, /cognitive_mode:fast\.cognitiveMode/)
})

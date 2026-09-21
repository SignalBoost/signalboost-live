import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('interactive COS questions bound graduate attempts before base fallback', () => {
  const workers = readFileSync(new URL('../lib/ai/cos/cosReasoningWorkers.ts', import.meta.url), 'utf8')
  assert.match(workers, /INTERACTIVE_GRADUATE_ATTEMPT_MS = 8_000/)
  assert.match(workers, /'cos_interactive_answer'/)
  assert.match(workers, /'cos_interactive_authoring'/)
  assert.match(workers, /'direct_text_transformation'/)
  assert.match(workers, /const graduateTimeoutMs = interactiveGraduateAttemptTimeout\(request, effective\.timeoutMs\)/)
  assert.match(workers, /timeoutMs: graduateTimeoutMs/)
  assert.match(workers, /inference failed; base worker may take over/)
})

test('non-interactive University and evaluation calls keep their inherited runtime timeout', () => {
  const workers = readFileSync(new URL('../lib/ai/cos/cosReasoningWorkers.ts', import.meta.url), 'utf8')
  assert.match(workers, /if \(!INTERACTIVE_GRADUATE_FEATURES\.has\(feature\)\) return inheritedTimeoutMs/)
})

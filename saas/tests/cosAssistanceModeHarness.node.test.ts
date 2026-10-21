import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const specialist = readFileSync(new URL('../lib/ai/cos/softwareSpecialist.ts', import.meta.url), 'utf8')

test('guidance mode does not enqueue or admit software execution', () => {
  const guide = specialist.indexOf("if (assistanceMode === 'guide') return null")
  const admission = specialist.indexOf('const admissionBlocker = builderExecutionAdmissionBlocker(objective)', guide)
  assert.ok(guide > 0 && admission > guide)
})
test('collaboration mode returns approval-required without running Builder', () => {
  assert.match(specialist, /if \(assistanceMode === 'collaborate'\)/)
  assert.match(specialist, /source: 'cos-builder-approval-required'/)
  assert.match(specialist, /execution_allowed: false/)
})
test('autonomous mode retains existing Builder delegation path', () => {
  assert.match(specialist, /await enqueueBuilderJob\(/)
  assert.match(specialist, /await runBuilderJob\(/)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { buildRepairPrompt, MAX_REPAIR_PROMPT_LENGTH } from '../lib/agent-runtime/repair-prompts.ts'

const request = { requestId: 'prompt-1', language: 'typescript' as const, publicInterface: 'export function add(a: number, b: number): number', requirements: 'Return a sum.' }
const diagnostic = { stage: 'tests' as const, category: 'test_failure' as const, exitCode: 1, timedOut: false, retryable: true, safeSummary: 'AssertionError\u0000 API_KEY=abc123 bearer secret-token artifact content should not appear' }
test('repair prompt is deterministic, structured, and bounded', () => {
  const prompt = buildRepairPrompt({ request, diagnostic, attemptNumber: 2, maximumCorrectionAttempts: 3 })
  assert.equal(prompt, buildRepairPrompt({ request, diagnostic, attemptNumber: 2, maximumCorrectionAttempts: 3 }))
  assert.match(prompt, /Stage: tests/); assert.match(prompt, /Category: test failure/); assert.match(prompt, /Exit code: 1/); assert.match(prompt, /Timed out: false/); assert.match(prompt, /Attempt: 2 of 3/)
  assert.match(prompt, /complete corrected replacement/); assert.match(prompt, /Preserve the requested public interface/); assert.doesNotMatch(prompt, /abc123|secret-token|\u0000/); assert.ok(prompt.length <= MAX_REPAIR_PROMPT_LENGTH)
})
test('repair prompt does not include request environment or unbounded diagnostic output', () => {
  const prompt = buildRepairPrompt({ request: { ...request, requirements: 'DATABASE_URL=postgres://private' }, diagnostic: { ...diagnostic, safeSummary: `stderr ${'x'.repeat(10_000)}` }, attemptNumber: 1, maximumCorrectionAttempts: 3 })
  assert.doesNotMatch(prompt, /DATABASE_URL|postgres:|x{513}/); assert.ok(prompt.length <= MAX_REPAIR_PROMPT_LENGTH)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chatDemandIsRecent } from '../lib/ai/cos/runpodInferenceLease.ts'

const now = Date.parse('2026-09-30T05:48:00Z')

test('chat demand inside the priority window makes background work yield RunPod', () => {
  // Production 2026-09-30 05:48 UTC: RunPod busy with background work, chat answered by the backup in 28.6 s.
  assert.equal(chatDemandIsRecent('2026-09-30T05:46:30Z', now, 180_000), true)
  assert.equal(chatDemandIsRecent('2026-09-30T05:44:30Z', now, 180_000), false)
  assert.equal(chatDemandIsRecent('2026-09-30T05:47:00Z', now, 0), false, 'window 0 disables priority')
  assert.equal(chatDemandIsRecent(undefined, now, 180_000), false)
  assert.equal(chatDemandIsRecent('not a date', now, 180_000), false)
  assert.equal(chatDemandIsRecent('2026-09-30T06:30:00Z', now, 180_000), false, 'far-future timestamps are ignored')
})

test('every chat attempt claims priority, and only self-healing background Builder jobs yield', () => {
  const inference = readFileSync(new URL('../lib/ai/local-inference.ts', import.meta.url), 'utf8')
  const turn = inference.slice(inference.indexOf('async function runpodFirstInteractiveTurn('), inference.indexOf('export async function callLocalModelTurn('))
  assert.match(turn, /void leases\.markChatRunpodDemand\(\)/)
  const port = readFileSync(new URL('../lib/cos/aiPort.ts', import.meta.url), 'utf8')
  assert.match(port, /export function createBuilderCodingAiPort\(options: \{ yieldToChat\?: boolean \} = \{\}\): CosAiPort/)
  assert.match(port, /if \(options\.yieldToChat === true && await chatHasRunpodPriority\(\)\) \{[\s\S]{0,200}throw new Error\('builder_runpod_primary_busy'\)/)
  const runner = readFileSync(new URL('../lib/builder/job-runner.ts', import.meta.url), 'utf8')
  assert.match(runner, /createBuilderCodingAiPort\(\{ yieldToChat: selfHealingCapacityJob\(job\) \}\)/)
  // A yielded self-healing job is deferred, not failed.
  assert.match(runner, /if \(error === 'builder_runpod_primary_busy'\) return true/)
})
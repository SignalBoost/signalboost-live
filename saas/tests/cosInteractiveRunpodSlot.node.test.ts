import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { firstUsefulWithHedge } from '../lib/ai/interactiveProviderHedge.ts'

const source = readFileSync(new URL('../lib/ai/local-inference.ts', import.meta.url), 'utf8')
const turn = source.slice(source.indexOf('async function runpodFirstInteractiveTurn('), source.indexOf('export async function callLocalModelTurn('))

test('chat takes the RunPod slot without waiting, and skips RunPod when background work holds it', () => {
  assert.match(turn, /slot = await leases\.tryAcquireRunpodInferenceLeaseNow\(runpodConfig\.timeoutMs\)/)
  assert.match(turn, /if \(slot === null\) \{\n\s+await recordRunpodBusySkip\(args, runpodConfig\)\n\s+return null\n\s+\}/)
  assert.match(turn, /\} finally \{\n\s+if \(slot\) await leases\.releaseRunpodInferenceLease\(slot\)/)
  assert.match(turn, /catch \(error\) \{[\s\S]{0,300}slot = undefined/)
  assert.match(source, /finishReason: 'runpod_busy_background_work'/)
  const lease = readFileSync(new URL('../lib/ai/cos/runpodInferenceLease.ts', import.meta.url), 'utf8')
  assert.match(lease, /export async function tryAcquireRunpodInferenceLeaseNow\(inferenceTimeoutMs: number\): Promise<RunpodInferenceLease \| null> \{\n\s+return tryAcquire\(randomUUID\(\), inferenceTimeoutMs\)/)
})

test('a skipped RunPod starts the managed backup at once instead of after the 20 s hedge', async () => {
  const started = Date.now(); let backupStartedAfter = -1
  const outcome = await firstUsefulWithHedge<string>({
    primary: async () => null,
    backup: async () => { backupStartedAfter = Date.now() - started; return 'answer' },
    hedgeAfterMs: 20_000,
    isUseful: value => Boolean(value),
  })
  assert.equal(outcome.winner, 'backup')
  assert.ok(backupStartedAfter >= 0 && backupStartedAfter < 1_000, `backup started after ${backupStartedAfter} ms`)
})

test('builder work defers while chat holds the slot instead of paying for the managed provider', () => {
  const port = readFileSync(new URL('../lib/cos/aiPort.ts', import.meta.url), 'utf8')
  assert.match(port, /if \(runpod\.attempted && runpod\.reason === 'runpod_primary_busy'\) \{\n\s+throw new Error\('builder_runpod_primary_busy'\)/)
})

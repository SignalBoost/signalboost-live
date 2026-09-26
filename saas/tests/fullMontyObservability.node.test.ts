import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('provider telemetry carries canonical HarnessRun correlation identity', async () => {
  const code = await readFile(new URL('../lib/ai/local-inference.ts', import.meta.url), 'utf8')
  assert.match(code, /traceId: string/)
  assert.match(code, /harnessRunId: string \| null/)
  assert.match(code, /parentHarnessRunId: string \| null/)
  assert.match(code, /const traceId = harnessContext\?\.manifest\.runId \|\| requestId/)
  assert.match(code, /harnessRunId: harnessContext\?\.manifest\.runId \|\| null/)
})

test('external monitoring intake reaches canonical governed SHS remediation', async () => {
  const code = await readFile(new URL('../self-healing-host/incident-intake.ts', import.meta.url), 'utf8')
  assert.match(code, /remediateNativeIncidents/)
  assert.match(code, /remediateNativeIncidents\(\[incident\], \{ maxIncidents: 1 \}\)/)
  assert.match(code, /mode: 'passive'/)
  assert.match(code, /native_shs=/)
})

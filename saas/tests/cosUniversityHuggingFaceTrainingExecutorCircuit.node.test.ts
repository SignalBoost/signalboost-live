import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const source = fs.readFileSync(path.resolve(process.cwd(), 'app/api/internal/cos/huggingface-training-executor/route.ts'), 'utf8')

test('HF paid executor checks durable Self-Healing circuit before provider submission', () => {
  const circuit = source.indexOf('readProviderCircuit')
  const submit = source.indexOf('submitHuggingFaceJob({ namespace')
  assert.ok(circuit >= 0, 'executor must read provider circuit')
  assert.ok(submit >= 0, 'executor must retain HF submission boundary')
  assert.ok(circuit < submit, 'provider circuit preflight must occur before paid HF submission')
  assert.match(source, /provider_circuit_open/)
  assert.match(source, /externalCostUsd:\s*0/)
})

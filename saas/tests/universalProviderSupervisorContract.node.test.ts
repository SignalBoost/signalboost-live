import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const ROOT = path.resolve(process.cwd())

test('Universal Provider Framework exports one Supervisor execution contract', () => {
  const index = fs.readFileSync(path.join(ROOT, 'lib/provider-framework/index.ts'), 'utf8')
  assert.match(index, /export \* from '\.\/supervisor-contract\.ts'/)
})

test('provider execution contract checks circuit before execution and centralizes failure classification', () => {
  const source = fs.readFileSync(path.join(ROOT, 'lib/provider-framework/supervisor-contract.ts'), 'utf8')
  assert.match(source, /readProviderCircuit/)
  assert.match(source, /provider_supervisor_circuit_open/)
  assert.match(source, /classifyProviderFailure/)
  assert.match(source, /openProviderCircuit/)
  assert.match(source, /PROVIDER_SUPERVISOR_CONTRACT_VERSION/)
})

test('contract is provider-neutral and capability-scoped', () => {
  const source = fs.readFileSync(path.join(ROOT, 'lib/provider-framework/supervisor-contract.ts'), 'utf8')
  assert.doesNotMatch(source, /huggingface|anthropic|openai|runpod|deepinfra|stripe|vercel/i)
  assert.match(source, /providerId/)
  assert.match(source, /capability/)
})

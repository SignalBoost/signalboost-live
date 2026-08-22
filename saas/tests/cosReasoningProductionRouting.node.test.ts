import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const reasonerSource = readFileSync(new URL('../lib/ai/cos/cosReasoner.ts', import.meta.url), 'utf8')
const workerSource = readFileSync(new URL('../lib/ai/cos/cosReasoningWorkers.ts', import.meta.url), 'utf8')

test('production callCosReasoner enters the COS reasoning control plane', () => {
  const entrypoint = reasonerSource.slice(reasonerSource.indexOf('export async function callCosReasoner('))
  assert.match(entrypoint, /import\('\.\/cosReasoningWorkers'\)/)
  assert.match(entrypoint, /reasonThroughCosControlPlane/)
  assert.match(entrypoint, /requestedRole:\s*'primary'/)
  assert.match(entrypoint, /allowExternalEscalation:\s*false/)
})

test('raw model execution is separated from the production compatibility entrypoint', () => {
  assert.match(reasonerSource, /export async function callRawCosReasoner\(/)
  assert.match(workerSource, /callRawCosReasoner/)
})

test('primary worker never recursively calls the compatibility gateway', () => {
  const executeBlock = workerSource.slice(workerSource.indexOf('async execute(request)'))
  assert.match(executeBlock, /callRawCosReasoner/)
  assert.doesNotMatch(executeBlock, /await callCosReasoner\(/)
})

test('default worker remains provider-neutral and open-model only', () => {
  assert.match(workerSource, /kind:\s*'cos-open-model'/)
  assert.doesNotMatch(workerSource, /external-closed-model/)
})

test('control-plane provenance is emitted at the compatibility boundary', () => {
  assert.match(reasonerSource, /\[cos-reasoning-control-plane\]/)
  assert.match(reasonerSource, /policyVersion:\s*execution\.plan\.policyVersion/)
  assert.match(reasonerSource, /workerId:\s*execution\.worker\.id/)
  assert.match(reasonerSource, /externalEscalationAllowed:\s*false/)
})

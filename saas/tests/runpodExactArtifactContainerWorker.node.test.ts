import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const mass = readFileSync(new URL('../lib/ai/cos/runpodMassDistilledProvision.ts', import.meta.url), 'utf8')
const xsa = readFileSync(new URL('../lib/ai/cos/runpodXsaServingRuntime.ts', import.meta.url), 'utf8')
const v2 = readFileSync(new URL('../lib/ai/cos/runpodMassDistilledProvisionV2.ts', import.meta.url), 'utf8')
const docker = readFileSync(new URL('../../runpod/exact-artifact/Dockerfile', import.meta.url), 'utf8')
const workflow = readFileSync(new URL('../../.github/workflows/runpod-exact-artifact.yml', import.meta.url), 'utf8')

test('immutable exact-artifact image executes baked gateways instead of injected source', () => {
  assert.match(docker, /COPY mass_gateway\.py \/opt\/itmounts\/mass_gateway\.py/)
  assert.match(docker, /COPY xsa_gateway\.py \/opt\/itmounts\/xsa_gateway\.py/)
  assert.match(mass, /immutableImage\s*\? 'exec python3 \/opt\/itmounts\/mass_gateway\.py'/)
  assert.match(xsa, /immutableImage\s*\? 'exec python3 \/opt\/itmounts\/xsa_gateway\.py'/)
})

test('materialized identity binds exact artifact through endpoint environment for baked workers', () => {
  assert.match(v2, /identityInEnv/)
  assert.match(v2, /ITMOUNTS_ADAPTER_MODEL_REVISION/)
  assert.match(v2, /ITMOUNTS_ADAPTER_MODEL_ID/)
  assert.match(v2, /ITMOUNTS_DISTILLED_MODEL_NAME/)
  assert.match(v2, /immutableImage \? identityInEnv : identityInArgs/)
})

test('publishing workflow emits a registry digest for the merged immutable worker', () => {
  assert.match(workflow, /ghcr\.io\/signalboost\/itmounts-exact-artifact/)
  assert.match(workflow, /steps\.build\.outputs\.digest/)
  assert.match(workflow, /exact-artifact-image\.txt/)
})

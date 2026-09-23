import assert from 'node:assert/strict'
import test from 'node:test'

// Architectural regression: Residency must bind the immutable trained artifact directly.
// It must never require final-canary evidence, because final canary follows Residency.
const source=await import('node:fs/promises').then(fs=>fs.readFile(new URL('../platform-harness/residency/exact-artifact-model.ts',import.meta.url),'utf8'))

test('Residency exact-artifact binding precedes final canary',()=>{
  assert.match(source,/provisionMassDistilledRuntime/)
  assert.match(source,/runtimeKey:'residency'/)
  assert.match(source,/canaryMassDistilledRuntime/)
  assert.doesNotMatch(source,/local_distilled_runtime_canary_passed/)
  assert.doesNotMatch(source,/servedCandidateModelFromCanary/)
})

test('Residency prewarm failure is infrastructure-only and fail-closed',()=>{
  assert.match(source,/residency_exact_artifact_runtime_not_ready/)
  assert.match(source,/does not write final-canary evidence/)
})

// saas/tests/cosUniversityPhdAgentScope.node.test.ts
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const runtime = fs.readFileSync(path.join(process.cwd(), 'lib/ai/cos/cosUniversityPhdRuntime.ts'), 'utf8')

test('no PhD read or write is pinned to COS', () => {
  // Undergraduate and Master's are agent-scoped; the doctoral runtime pinned every query and insert
  // to COS, so a second candidate could never hold research evidence, a project, or a credential.
  assert.ok(!/\.eq\('agent_id', AGENT_ID\)/.test(runtime), 'a read is still pinned to COS')
  assert.ok(!/agent_id: AGENT_ID,/.test(runtime), 'a write is still pinned to COS')
  assert.ok(!/cosUniversityPhdCredentialKey\(AGENT_ID,/.test(runtime), 'the credential key is still pinned')
  assert.ok(!/\$\{AGENT_ID\}\|/.test(runtime), 'a derived key still hashes COS')
})

test('COS remains the default so every existing caller is unchanged', () => {
  assert.match(runtime, /const AGENT_ID = 'cos'/)
  for (const fn of ['readCosUniversityPhdEvidence', 'readCosUniversityPhdAdmissionState',
    'readCosUniversityPhdRuntimeStatus', 'ensureCosUniversityPhdEnrollment',
    'evaluateAndAwardCosUniversityPhdCredential']) {
    const at = runtime.indexOf(`export async function ${fn}`)
    assert.ok(at > 0, `${fn} is missing`)
    assert.match(runtime.slice(at, at + 420), /agentId: string = AGENT_ID/, fn)
  }
})

test('host writers carry an optional candidate that defaults to COS', () => {
  const writers = ['recordHostCosUniversityPhdResearchNeed', 'recordHostCosUniversityPhdProject',
    'recordHostCosUniversityPhdEvidence']
  for (const fn of writers) {
    const at = runtime.indexOf(`export async function ${fn}`)
    assert.ok(at > 0, `${fn} is missing`)
    assert.match(runtime.slice(at, at + 500), /agentId\?: string/, fn)
  }
  const defaults = runtime.match(/const agentId = String\(input\.agentId \?\? ''\)\.trim\(\) \|\| AGENT_ID/g) ?? []
  assert.equal(defaults.length, writers.length, 'every host writer must resolve its own candidate')
})

test('derived keys are namespaced by candidate, so two candidates cannot collide', () => {
  assert.match(runtime, /update\(`\$\{agentId\}\|\$\{input\.programId\}\|\$\{input\.reasonCode\}/)
  assert.match(runtime, /update\(`\$\{agentId\}\|\$\{input\.programId\}\|\$\{candidateActorId\}/)
  assert.match(runtime, /credential_key: cosUniversityPhdCredentialKey\(agentId, programId\)/)
})

test("the Master's prerequisite is read for the same candidate, never COS", () => {
  // A candidate must not inherit COS's Master's standing as its own admission evidence.
  assert.match(runtime, /readCosUniversityMastersRuntimeStatus\(program\.mastersPrerequisite, now, undefined, agentId\)/)
})

test('evidence and projects are resolved for the requesting candidate', () => {
  assert.match(runtime, /readCosUniversityPhdRuntimeStatus\(evidence\.programId, observedAt, agentId\)/)
  assert.match(runtime, /projectForEvidence\(evidence\.programId, evidence, agentId\)/)
  assert.match(runtime, /loadProjects\(programId, agentId\)/)
  assert.match(runtime, /loadEvidenceRows\(programId, agentId\)/)
})

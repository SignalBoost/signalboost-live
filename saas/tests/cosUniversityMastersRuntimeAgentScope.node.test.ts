// saas/tests/cosUniversityMastersRuntimeAgentScope.node.test.ts
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const runtime = fs.readFileSync(path.join(process.cwd(), 'lib/ai/cos/cosUniversityMastersRuntime.ts'), 'utf8')

test('no graduate read or write is pinned to COS any more', () => {
  // The exam runner already writes a specialist's graduate evidence. If the runtime that reads that
  // evidence, enrolls the learner and issues the credential stays pinned, a specialist can sit
  // Master's exams that nothing will ever count.
  assert.ok(!/\.eq\('agent_id', AGENT_ID\)/.test(runtime), 'a read is still pinned to COS')
  assert.ok(!/agent_id: AGENT_ID,/.test(runtime), 'a write is still pinned to COS')
  assert.ok(!/cosUniversityMastersCredentialKey\(AGENT_ID,/.test(runtime), 'the credential key is still pinned')
})

test('COS remains the default, so every existing caller is unchanged', () => {
  assert.match(runtime, /const AGENT_ID = 'cos'/)
  for (const fn of ['loadAnyMastersEnrollment', 'ensureCosUniversityMastersEnrollment',
    'evaluateAndAwardCosUniversityMastersCredential']) {
    const at = runtime.indexOf(fn)
    assert.ok(at > 0, `${fn} is missing`)
    assert.match(runtime.slice(at, at + 320), /agentId: string = AGENT_ID/, fn)
  }
})

test('the credential is keyed to the learner that earned it', () => {
  assert.match(runtime, /credential_key: cosUniversityMastersCredentialKey\(agentId, programId\)/)
  assert.match(runtime, /agent_id: agentId,/)
})

test('recorded graduate evidence carries its own learner and reads that learner status', () => {
  assert.match(runtime, /agentId\?: string/)
  assert.match(runtime, /const agentId = String\(input\.agentId \?\? ''\)\.trim\(\) \|\| AGENT_ID/)
  assert.match(runtime, /readCosUniversityMastersRuntimeStatus\(input\.programId, observedAt, undefined, agentId\)/)
})

test('the shared admission state is still scope-checked against the learner', () => {
  // Passing an agent must never let one learner read another's admission state.
  assert.match(runtime, /sharedAdmissionState\.agentId !== agentId\) throw new Error\('masters_admission_scope_mismatch'\)/)
  assert.match(runtime, /requireMastersLearningAgentId\(agentId\)/)
})

test('enrollment and award pass the learner in the status reader\'s agent position', () => {
  // The reader takes (programId, now, sharedAdmissionState?, agentId) — an agent passed third would
  // be silently read as admission state.
  const calls = runtime.match(/readCosUniversityMastersRuntimeStatus\([^)]*\)/g) ?? []
  for (const call of calls) {
    if (!call.includes('agentId')) continue
    assert.match(call, /undefined, agentId\)|, agentId\)$/, call)
    assert.ok(!/now, agentId\)/.test(call), `agent passed in the admission-state position: ${call}`)
  }
})

// saas/tests/cosUniversityPhdAgentScope.node.test.ts
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const runtime = fs.readFileSync(path.join(process.cwd(), 'lib/ai/cos/cosUniversityPhdRuntime.ts'), 'utf8')
const research = fs.readFileSync(path.join(process.cwd(), 'lib/ai/cos/cosUniversityPhdResearchRunner.ts'), 'utf8')
const methodology = fs.readFileSync(
  path.join(process.cwd(), 'lib/ai/cos/cosUniversityPhdMethodologyExamRunner.ts'), 'utf8')
const COS_AGENT_DECLARATION = new RegExp(['const', 'AGENT_ID', '=', "'cos'"].join(' '))

function assertBoundSpecialistExecution(name: string, source: string): void {
  assert.match(source, /DEFAULT_PHD_AGENT_ID/, `${name}: shared COS default missing`)
  assert.match(source, /requirePhdAgentId/, `${name}: agent id is not validated`)
  assert.match(source, /agentId !== DEFAULT_PHD_AGENT_ID/, `${name}: specialist branch is missing`)
  assert.match(source, /executeBoundAgentExam\(/, `${name}: specialist does not use its bound executor`)
  assert.match(source, /isBoundSoftwareCapstoneEvidence\(/, `${name}: execution identity is not verified`)
  assert.match(source, /boundExecutionBindingFailure\(/, `${name}: exact reply is not bound to its execution receipt`)
}

test('no PhD read or write is pinned to COS', () => {
  // Undergraduate and Master's are agent-scoped; the doctoral runtime must stay equally scoped.
  assert.ok(!/\.eq\('agent_id', AGENT_ID\)/.test(runtime), 'a read is still pinned to COS')
  assert.ok(!/agent_id: AGENT_ID,/.test(runtime), 'a write is still pinned to COS')
  assert.ok(!/cosUniversityPhdCredentialKey\(AGENT_ID,/.test(runtime), 'the credential key is still pinned')
  assert.ok(!/\$\{AGENT_ID\}\|/.test(runtime), 'a derived key still hashes COS')
})

test('COS remains the default so every existing runtime caller is unchanged', () => {
  assert.match(runtime, COS_AGENT_DECLARATION)
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

test('derived runtime keys are namespaced by candidate, so two candidates cannot collide', () => {
  assert.match(runtime, /update\(`\$\{agentId\}\|\$\{input\.programId\}\|\$\{input\.reasonCode\}/)
  assert.match(runtime, /update\(`\$\{agentId\}\|\$\{input\.programId\}\|\$\{candidateActorId\}/)
  assert.match(runtime, /credential_key: cosUniversityPhdCredentialKey\(agentId, programId\)/)
})

test("the Master's prerequisite is read for the same candidate, never COS", () => {
  // A candidate must not inherit COS's Master's standing as its own admission evidence.
  assert.match(runtime, /readCosUniversityMastersRuntimeStatus\(program\.mastersPrerequisite, now, undefined, agentId\)/)
})

test('runtime evidence and projects are resolved for the requesting candidate', () => {
  assert.match(runtime, /readCosUniversityPhdRuntimeStatus\(evidence\.programId, observedAt, agentId\)/)
  assert.match(runtime, /projectForEvidence\(evidence\.programId, evidence, agentId\)/)
  assert.match(runtime, /loadProjects\(programId, agentId\)/)
  assert.match(runtime, /loadEvidenceRows\(programId, agentId\)/)
})

test('research and methodology runners use the shared candidate scope and no local COS pin', () => {
  for (const [name, source] of [['research runner', research], ['methodology exam', methodology]] as const) {
    assert.doesNotMatch(source, COS_AGENT_DECLARATION, `${name}: stale local COS identity returned`)
    assert.doesNotMatch(source, /\.eq\('agent_id', AGENT_ID\)/, `${name}: a read is pinned to COS`)
    assert.doesNotMatch(source, /agent_id: AGENT_ID,/, `${name}: a write is pinned to COS`)
    assertBoundSpecialistExecution(name, source)
  }
})

test('research assignment and methodology run keys are namespaced per candidate', () => {
  // Two candidates working the same protocol in the same hour must not collide on a unique key.
  assert.match(research, /const assignmentKey = digest\(\[\s*\n\s*agentId,/)
  assert.match(methodology, /const agentId = requirePhdAgentId\(input\.agentId\)/)
  assert.ok(
    methodology.includes('const runKey = agentId === DEFAULT_PHD_AGENT_ID ? historicalKey : `agent:${agentId}:${historicalKey}`'),
    'methodology run key is not candidate-namespaced',
  )
})

test('doctoral research keeps every read on the candidate doing the work', () => {
  assert.match(research, /readCosUniversityPhdRuntimeStatus\(input\.programId, input\.now, agentId\)/)
  assert.match(research, /readCosUniversityPhdRuntimeStatus\(programId, now, agentId\)/)
  assert.match(research, /readCosUniversityPhdResearchWork\(programId, agentId\)/)
  assert.match(research, /readCosUniversityPhdEvidence\(programId, agentId\)/)
  assert.match(research, /priorContextForAssignment\(assignment, agentId\)/)
  assert.match(research, /agent_id: agentId,/)
})

test('research cycle defaults to COS but validates and forwards an explicit candidate', () => {
  assert.match(research, /runCosUniversityPhdResearchCycle\([\s\S]*?agentId: string = DEFAULT_PHD_AGENT_ID/)
  const runAt = research.indexOf('export async function runCosUniversityPhdResearchCycle')
  const body = research.slice(runAt, runAt + 2200)
  assert.match(body, /requirePhdAgentId\(agentId\)/)
  assert.match(body, /readCosUniversityPhdRuntimeStatus\(programId, now, agentId\)/)
  assert.match(body, /ensureNextCandidateAssignment\(programId, now, agentId\)/)
  assert.match(body, /executeCandidateAssignment\(next\.assignment, now, agentId\)/)
})

test('methodology exam reads, executes, and writes evidence for the same candidate', () => {
  assert.match(methodology, /options: \{ now\?: Date; agentId\?: string \} = \{\}/)
  assert.match(methodology, /const agentId = requirePhdAgentId\(options\.agentId \?\? DEFAULT_PHD_AGENT_ID\)/)
  assert.match(methodology, /activeProgram\(now, agentId\)/)
  assert.match(methodology, /readCosUniversityPhdRuntimeStatus\(programId, now, agentId\)/)
  assert.match(methodology, /readCosUniversityPhdEvidence\(active\.programId, agentId\)/)
  assert.match(methodology, /createOrFindRun\(\{ agentId, \.\.\.active, now \}\)/)
  assert.match(methodology, /executeRun\(row, now, agentId\)/)
  assert.match(methodology, /recordHostCosUniversityPhdEvidence\(\{\s*\n\s*agentId,/)
})

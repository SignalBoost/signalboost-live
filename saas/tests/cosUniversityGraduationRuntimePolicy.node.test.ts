import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {
  cosUniversityGraduationAdmissionBlocker,
  cosUniversityGraduationRuntimeBlocker,
  isCosUniversityGraduationExecutionEvidence,
  requireCosUniversityGraduationRuntime,
  rotateCosUniversityGraduationAgents,
} from '../lib/ai/cos/cosUniversityGraduationRuntimePolicy.ts'
import { REGISTERED_SPECIALIST_RUNTIME } from '../lib/ai/cos/cosUniversityRegisteredSpecialistExecutor.ts'

const root = path.resolve(import.meta.dirname, '..')
const file = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8')
const evidence = {
  agent_id: 'cos', fresh_execution: true, local_model_invoked: true,
  external_ai_invoked: false, response_source: 'local_reasoning', turn_id: 'fresh-cos-turn',
}
const admission = { agentId: 'cos', enabled: true, errors: [] as string[], capstoneState: 'not_eligible' }
const specialistTurn = 'aaaaaaaa-2222-4333-8444-555555555555'
const specialistRun = 'aaaaaaaa-1111-4111-8111-111111111111'
const hash = 'a'.repeat(64)
const specialistExecution = {
  runtime: REGISTERED_SPECIALIST_RUNTIME,
  agentId: 'cybersecurity-specialist',
  role: 'cybersecurity',
  runId: specialistRun,
  turnId: specialistTurn,
  model: 'fixture-security-model',
  manifestHash: hash,
  promptHash: 'b'.repeat(64),
  responseHash: 'c'.repeat(64),
  contextHash: 'd'.repeat(64),
  startedAt: '2026-09-13T10:00:00.000Z',
  completedAt: '2026-09-13T10:00:01.000Z',
  commitSha: 'e'.repeat(40),
  deploymentId: 'fixture-deployment',
  academicAuthority: 'none' as const,
}

test('COS and only host-registered specialist roles clear the graduation runtime identity gate', () => {
  assert.equal(cosUniversityGraduationRuntimeBlocker('cos'), null)
  assert.doesNotThrow(() => requireCosUniversityGraduationRuntime('cos'))
  assert.equal(cosUniversityGraduationRuntimeBlocker('software-specialist', 'software_engineering'), null)
  assert.equal(cosUniversityGraduationRuntimeBlocker('cybersecurity-specialist', 'cybersecurity'), null)
  assert.equal(cosUniversityGraduationRuntimeBlocker('quant-agent', 'quantitative_data_science'), null)
  for (const [agentId, role] of [
    ['software-specialist', null],
    ['cybersecurity-specialist', 'chief_of_staff_generalist'],
    ['unknown', 'unknown'],
    ['COS', 'cybersecurity'],
    [' cos ', 'software_engineering'],
  ] as const) {
    assert.equal(cosUniversityGraduationRuntimeBlocker(agentId, role), 'agent_capstone_runtime_unavailable')
    assert.throws(() => requireCosUniversityGraduationRuntime(agentId, role), /agent_capstone_runtime_unavailable/)
  }
  assert.equal(cosUniversityGraduationRuntimeBlocker('  '), 'agent_id_required')
})

test('only fresh identity-bound execution may become graduation capstone evidence', () => {
  assert.equal(isCosUniversityGraduationExecutionEvidence(evidence, 'cos'), true)
  assert.equal(isCosUniversityGraduationExecutionEvidence({
    ...evidence,
    agent_id: specialistExecution.agentId,
    id: specialistRun,
    manifest_hash: hash,
    turn_id: specialistTurn,
    response_source: REGISTERED_SPECIALIST_RUNTIME,
    execution_provenance: specialistExecution,
  }, specialistExecution.agentId, 'cybersecurity', new Date('2026-09-13T10:01:00Z')), true)
  assert.equal(isCosUniversityGraduationExecutionEvidence(evidence, 'software-specialist'), false)
  assert.equal(isCosUniversityGraduationExecutionEvidence({ ...evidence, agent_id: 'software-specialist' }, 'cos'), false)
})

test('COS cannot borrow either legacy software or generic specialist provenance', () => {
  for (const response_source of ['university_software_specialist_v1', REGISTERED_SPECIALIST_RUNTIME]) {
    assert.equal(isCosUniversityGraduationExecutionEvidence({
      ...evidence,
      response_source,
      execution_provenance: specialistExecution,
    }, 'cos'), false)
  }
})

test('registered specialist evidence cannot be relabeled across role, learner, run, manifest or response source', () => {
  const base = {
    ...evidence,
    agent_id: specialistExecution.agentId,
    id: specialistRun,
    manifest_hash: hash,
    turn_id: specialistTurn,
    response_source: REGISTERED_SPECIALIST_RUNTIME,
    execution_provenance: specialistExecution,
  }
  const now = new Date('2026-09-13T10:01:00Z')
  assert.equal(isCosUniversityGraduationExecutionEvidence(base, specialistExecution.agentId, 'software_engineering', now), false)
  assert.equal(isCosUniversityGraduationExecutionEvidence({ ...base, agent_id: 'other-specialist' }, 'other-specialist', 'cybersecurity', now), false)
  assert.equal(isCosUniversityGraduationExecutionEvidence({ ...base, id: 'bbbbbbbb-1111-4111-8111-111111111111' }, specialistExecution.agentId, 'cybersecurity', now), false)
  assert.equal(isCosUniversityGraduationExecutionEvidence({ ...base, manifest_hash: 'f'.repeat(64) }, specialistExecution.agentId, 'cybersecurity', now), false)
  assert.equal(isCosUniversityGraduationExecutionEvidence({ ...base, response_source: 'local_reasoning' }, specialistExecution.agentId, 'cybersecurity', now), false)
})

test('cached, external, unexecuted and untraceable capstones cannot earn a degree', () => {
  for (const invalid of [
    { fresh_execution: false }, { local_model_invoked: false }, { external_ai_invoked: true },
    { turn_id: null }, { turn_id: ' ' }, { response_source: null }, { response_source: ' ' },
    { response_source: 'semantic_cache' }, { response_source: 'semantic_similarity' },
  ]) assert.equal(isCosUniversityGraduationExecutionEvidence({ ...evidence, ...invalid }, 'cos'), false)
})

test('successful graduation may proceed to the already agent-scoped Masters admission decision', () => {
  assert.equal(cosUniversityGraduationAdmissionBlocker(admission), null)
  assert.equal(cosUniversityGraduationAdmissionBlocker({ ...admission, agentId: 'software-specialist', capstoneState: 'credential_awarded' }), null)
  assert.equal(cosUniversityGraduationAdmissionBlocker({ ...admission, agentId: 'cybersecurity-specialist', capstoneState: 'credential_awarded' }), null)
})

test('disabled or failed graduation cannot invoke admission for any learner', () => {
  assert.equal(cosUniversityGraduationAdmissionBlocker({ ...admission, enabled: false }), 'graduation_gate_disabled')
  assert.equal(cosUniversityGraduationAdmissionBlocker({ ...admission, errors: ['service_database_unavailable'] }), 'graduation_evaluation_failed')
  assert.equal(cosUniversityGraduationAdmissionBlocker({ ...admission, capstoneState: 'error' }), 'graduation_evaluation_failed')
})

test('a persistently failing first due agent does not monopolize later hourly ticks', () => {
  const agents = ['failed-agent', 'cos', 'software-specialist']
  const starts = Array.from({ length: agents.length }, (_, hour) => rotateCosUniversityGraduationAgents(agents, new Date(hour * 3_600_000))[0])
  assert.deepEqual(starts, agents)
  assert.deepEqual(agents, ['failed-agent', 'cos', 'software-specialist'], 'rotation does not mutate registry ordering')
})

test('rotation remains fair across midnight and for more than 24 registered agents', () => {
  const agents = Array.from({ length: 31 }, (_, i) => `agent-${i}`)
  const starts = Array.from({ length: 31 }, (_, hour) => rotateCosUniversityGraduationAgents(agents, new Date((23 + hour) * 3_600_000))[0])
  assert.equal(new Set(starts).size, 31)
  assert.deepEqual(rotateCosUniversityGraduationAgents([], new Date(0)), [])
  assert.deepEqual(rotateCosUniversityGraduationAgents(['cos'], new Date(0)), ['cos'])
  assert.throws(() => rotateCosUniversityGraduationAgents(agents, new Date('invalid')), /invalid_graduation_time/)
})

test('runtime identity is enforced at both mutation boundaries and before inference', () => {
  const runner = file('lib/ai/cos/cosUniversityGraduationRunner.ts')
  for (const name of ['awardUndergraduateCredential', 'createOrFindCapstoneRun', 'executeCapstoneRun']) {
    const start = runner.indexOf(`async function ${name}(`)
    assert.ok(start >= 0)
    const end = runner.indexOf('\nasync function ', start + 1)
    const body = runner.slice(start, end < 0 ? undefined : end)
    const guardAt = body.indexOf('await requireRegisteredCapstoneRuntime(')
    assert.ok(guardAt > 0 && guardAt < body.indexOf('cosServiceDb()'), `${name} must guard identity before database access`)
    if (name === 'executeCapstoneRun') {
      assert.ok(guardAt < body.indexOf('await tryCOSFirstAnswer('))
      assert.ok(guardAt < body.indexOf('await executeSoftwareCapstoneRuntime('))
    }
  }
})

test('graduation preserves prerequisite and residence gates before runtime or award decisions', () => {
  const runner = file('lib/ai/cos/cosUniversityGraduationRunner.ts')
  const start = runner.indexOf('export async function runCosUniversityGeneralistGraduationGate')
  const body = runner.slice(start)
  const prerequisitesAt = body.indexOf('if (!before.status.prerequisitesReady)')
  const residenceAt = body.indexOf('if (!before.status.program.minimumResidenceSatisfied)')
  const runtimeAt = body.indexOf('const runtimeBlocker = cosUniversityGraduationRuntimeBlocker(agentId, before.registeredRole)')
  const awardAt = body.indexOf('await awardUndergraduateCredential(agentId, before.status, now)')
  assert.ok(prerequisitesAt > 0 && residenceAt > prerequisitesAt && runtimeAt > residenceAt && awardAt > runtimeAt)
})

test('missing database access is not converted into an empty successful evidence read', () => {
  const runner = file('lib/ai/cos/cosUniversityGraduationRunner.ts')
  assert.doesNotMatch(runner, /if \(!db\) return (\[\]|null)/)
  assert.equal((runner.match(/if \(!db\) throw new Error\('service_database_unavailable'\)/g) || []).length, 7)
})

test('historical capstone credit requires agent-bound execution, current scorer and non-future observation', () => {
  const runner = file('lib/ai/cos/cosUniversityGraduationRunner.ts')
  assert.match(runner, /isCosUniversityGraduationExecutionEvidence\(row, agentId, registeredRole, now\)/)
  assert.match(runner, /row\.profile === COS_UNIVERSITY_GENERALIST_CAPSTONE_PROFILE/)
  assert.match(runner, /row\.scorer_version === COS_UNIVERSITY_GENERALIST_CAPSTONE_SCORER/)
  assert.match(runner, /Date\.parse\(row\.observed_at\) <= now\.getTime\(\)/)
})

test('credential_awarded requires persisted issuance and verified read-back', () => {
  const runner = file('lib/ai/cos/cosUniversityGraduationRunner.ts')
  assert.match(runner, /if \(!credential\) throw new Error\('undergraduate_credential_not_persisted'\)/)
  const verifyAt = runner.indexOf("if (!awarded.status.graduated) throw new Error('undergraduate_credential_not_verified')")
  const reportAt = runner.indexOf("state: 'credential_awarded'")
  assert.ok(verifyAt > 0 && reportAt > verifyAt)
  assert.match(runner, /23505/, 'duplicate-safe issuance is preserved')
})

test('capstone errors reach the route errors instead of becoming successful receipts', () => {
  const runner = file('lib/ai/cos/cosUniversityGraduationRunner.ts')
  assert.match(runner, /row\.status === 'error' \|\| row\.status === 'running'/)
  const errorAt = runner.indexOf("if (capstoneRun.state === 'error')")
  const provisionalAt = runner.indexOf('const provisional = await readGateState')
  assert.ok(errorAt > 0 && provisionalAt > errorAt)
  assert.match(runner.slice(errorAt, provisionalAt), /errors: capstoneRun\.reasons/)
  const route = file('app/api/cron/cos-university-graduation/route.ts')
  assert.match(route, /const errors = \[\.\.\.result\.errors, \.\.\.admission\.errors\]/)
  assert.match(route, /invocationSucceeded: errors\.length === 0/)
})

test('cron uses tested rotation and same-agent admission without inventing a graduate enrollment', () => {
  const route = file('app/api/cron/cos-university-graduation/route.ts')
  assert.match(route, /rotateCosUniversityGraduationAgents\(registeredAgents, now\)/)
  assert.match(route, /const admissionBlocker = cosUniversityGraduationAdmissionBlocker\(/)
  assert.match(route, /const admission = admissionBlocker\s*\? \{ enabled: false, skipped: true, reasons: \[admissionBlocker\]/)
  assert.match(route, /: await runCosUniversityAdmission\(\{ now, agentId: agent\.agentId, role: agent\.role \}\)/)
  const runAt = route.indexOf('const result = await runCosUniversityGeneralistGraduationGate(')
  const returnAt = route.indexOf('return NextResponse.json({ ok: errors.length === 0', runAt)
  assert.ok(runAt > 0 && returnAt > runAt)
  assert.match(route, /dailyCadence: 'not_due', runnerInvoked: false/)
  assert.match(file('scripts/vercel-cos-gates.mjs'), /tests\/cosUniversityGraduationRuntimePolicy\.node\.test\.ts/)
})

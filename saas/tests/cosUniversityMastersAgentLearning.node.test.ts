import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'
import {
  requireMastersLearningAgentId, mastersLearningSlotKey, mastersLearningPlanKey,
  mastersLearningProgramBlocker, rotateMastersLearningAgents, runOneMastersLearningAgent,
} from '../lib/ai/cos/cosUniversityMastersAgentLearning.ts'

const NOW = new Date('2026-09-11T20:30:00Z')
const PROGRAM = 'applied_ai_systems'
const PROGRAM_KEY = `specialist_masters_${PROGRAM}_v1`
const AGENT = 'software-specialist'
const file = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const active = (agentId = AGENT) => ({ agentId, admission: { admitted: true }, enrollment: { programKey: PROGRAM_KEY }, credential: null, timingStatus: 'minimum_residence' })

/** Execute the actual checked-in module with injected host ports; no database/model/network calls. */
function moduleWithPorts(path: string, names: string[], ports: Record<string, unknown>): any {
  const js = stripTypeScriptTypes(file(path), { mode: 'strip' })
    .replace(/^import[\s\S]*?from ['"][^'"]+['"]\s*$/gm, '')
    .replace(/^export\s+/gm, '')
  return new Function(...Object.keys(ports), `${js}\nreturn { ${names.join(', ')} };`)(...Object.values(ports))
}

/** Minimal thenable query port: retain every filter and apply it to isolated in-memory fixtures. */
function fakeDb(tables: Record<string, any[]>, failTable?: string) {
  const calls: any[] = []
  let sequence = 0
  return { calls, from(table: string) {
    const call = { table, action: 'read', filters: [] as any[], value: null as any }
    calls.push(call)
    const q: any = {
      select() { return q }, order() { return q }, limit() { return q },
      eq(key: string, value: unknown) { call.filters.push([key, value]); return q },
      insert(value: any) { call.action = 'insert'; call.value = value; return q },
      upsert(value: any) { call.action = 'upsert'; call.value = value; return q },
      update(value: any) { call.action = 'update'; call.value = value; return q },
      async maybeSingle() { const r = await q; return { ...r, data: r.data?.[0] ?? null } },
      then(resolve: any, reject: any) {
        if (table === failTable) return Promise.resolve({ data: null, error: new Error('database_unavailable') }).then(resolve, reject)
        const rows = tables[table] ??= []
        let matches = rows.filter(row => call.filters.every(([key, value]) => row[key] === value))
        if (call.action === 'insert') {
          if (rows.some(row => row.slot_key === call.value.slot_key)) return Promise.resolve({ data: null, error: { code: '23505' } }).then(resolve, reject)
          matches = [{ id: `fixture-${++sequence}`, ...call.value }]; rows.push(...matches)
        } else if (call.action === 'upsert') {
          if (!rows.some(row => row.plan_key === call.value.plan_key)) rows.push({ id: `fixture-${++sequence}`, ...call.value })
          matches = []
        } else if (call.action === 'update') matches.forEach(row => Object.assign(row, call.value))
        return Promise.resolve({ data: matches, error: null }).then(resolve, reject)
      },
    }
    return q
  } }
}

function learningHarness(options: { admitted?: boolean; noAccepted?: boolean; roleChanged?: boolean; dbFailure?: boolean; proofGateClosed?: boolean } = {}) {
  const tables: Record<string, any[]> = {
    cos_university_program_enrollments: ['cos', AGENT].map(agent_id => ({ agent_id, program_level: 'masters', program_key: PROGRAM_KEY })),
  }
  const db = fakeDb(tables, options.dbFailure ? 'cos_university_program_enrollments' : undefined)
  const proofCalls: any[] = [], evidenceAgents: string[] = [], runtimeAgents: string[] = []
  let acquired = 0, roleReads = 0
  const ports: Record<string, unknown> = {
    requireMastersLearningAgentId, mastersLearningSlotKey, mastersLearningPlanKey, mastersLearningProgramBlocker,
    cosServiceDb: () => db,
    readCosUniversityAgentRole: async (id: string) => { assert.equal(id, AGENT); return options.roleChanged && ++roleReads > 1 ? 'cybersecurity' : 'software_engineering' },
    autonomousLearningReadiness: () => ({ autonomousEnabled: true }),
    readCosUniversityMastersRuntimeStatus: async (_program: string, _now: Date, shared: unknown, id: string) => {
      assert.equal(shared, undefined); runtimeAgents.push(id)
      return { ...active(id), admission: { admitted: options.admitted !== false && !(options.proofGateClosed && runtimeAgents.length > 1) } }
    },
    readCosUniversityMastersEvidence: async (_program: string, id: string) => { evidenceAgents.push(id); return [] },
    cosUniversityMastersTrackIdFromProgramKey: (key: string) => key === PROGRAM_KEY ? PROGRAM : null,
    cosUniversityMastersTrackById: () => ({ curriculumModules: [1, 2].map(i => ({ key: `module_${i}`, subjectId: 'computer_science', title: `Module ${i}`, objective: 'Learn from governed evidence.' })) }),
    cosUniversityMastersCourseworkModulePasses: () => new Map(),
    selectCosUniversityStudyStrategy: () => ({ methods: [], acquisitionSourceKinds: [], fineTuneCandidate: false }),
    cosUniversityPlanEligibleForContinuousStudy: () => true,
    COS_UNIVERSITY_STUDY_COOLDOWN_MINUTES: 30,
    createSupabaseCOSStores: () => ({ continuousLearning: {} }), parseApprovedLearningUrls: () => [], createLiveLearningAdapters: () => [],
    ContinuousLearningDirector: class {},
    universityStudyGapSignal: (input: any) => ({ id: input.planKey, ...input }),
    knowledgeGapIdForSignal: (input: any) => input.id,
    generateKnowledgeGaps: (signals: any[]) => signals,
    ContinuousLearningCycle: class { async run(gaps: any[], externalCost: number) {
      acquired++; assert.equal(externalCost, 0)
      assert.ok(gaps.every(gap => gap.evidence.includes(`agent_id=${AGENT}`)))
      return { documentsAcquired: 2, accepted: options.noAccepted ? 0 : 1, probationary: 1,
        acceptedGapIds: options.noAccepted ? [] : [gaps[0].id, 'another-agent-gap'] }
    } },
    recordAcceptedCosUniversityStudyAttempts: async (proofs: any[], _now: Date, id: string) => { proofCalls.push({ proofs, id }); return proofs.map(p => p.planId) },
  }
  const { runCosUniversityMastersLearning: run } = moduleWithPorts('lib/ai/cos/cosUniversityMastersLearningRunner.ts', ['runCosUniversityMastersLearning'], ports)
  return { run, db, tables, proofCalls, evidenceAgents, runtimeAgents, acquired: () => acquired }
}

async function withLearningEnabled(run: () => Promise<void>) {
  const previous = process.env.COS_UNIVERSITY_MASTERS_LEARNING_ENABLED
  process.env.COS_UNIVERSITY_MASTERS_LEARNING_ENABLED = 'true'
  try { await run() } finally {
    if (previous === undefined) delete process.env.COS_UNIVERSITY_MASTERS_LEARNING_ENABLED
    else process.env.COS_UNIVERSITY_MASTERS_LEARNING_ENABLED = previous
  }
}

test('malformed or blank identities cannot silently fall back to COS', () => {
  for (const id of ['', ' ', 'COS', ' cos ', 'a:b', 'a|b']) assert.throws(() => requireMastersLearningAgentId(id))
  assert.equal(requireMastersLearningAgentId(AGENT), AGENT)
})

test('COS historical keys remain stable and same-module learners cannot collide', () => {
  const slot = '2026-09-11T20:30Z'
  assert.equal(mastersLearningSlotKey('cos', PROGRAM, slot), `${PROGRAM}:${slot}`)
  assert.equal(mastersLearningPlanKey('cos', PROGRAM, 'module_1'), createHash('sha256').update(`masters|${PROGRAM}|module_1`).digest('hex'))
  const ids = ['cos', AGENT, 'software-2']
  assert.equal(new Set(ids.map(id => mastersLearningSlotKey(id, PROGRAM, slot))).size, ids.length)
  assert.equal(new Set(ids.map(id => mastersLearningPlanKey(id, PROGRAM, 'module_1'))).size, ids.length)
  assert.equal(mastersLearningPlanKey(AGENT, PROGRAM, 'module_1'), mastersLearningPlanKey(AGENT, PROGRAM, 'module_1'))
})

test('an enrollment cannot bypass undergraduate admission, identity or active-program checks', () => {
  assert.equal(mastersLearningProgramBlocker(active(), AGENT), null)
  assert.throws(() => mastersLearningProgramBlocker(active('cos'), AGENT), /scope_mismatch/)
  assert.equal(mastersLearningProgramBlocker({ ...active(), admission: { admitted: false } }, AGENT), 'undergraduate_foundation_not_ready')
  for (const patch of [{ enrollment: null }, { credential: {} }, { timingStatus: 'not_enrolled' }, { timingStatus: 'deadline_expired' }, { timingStatus: 'unknown' }]) {
    assert.equal(mastersLearningProgramBlocker({ ...active(), ...patch }, AGENT), 'masters_program_inactive')
  }
})

test('half-hour rotation remains fair across midnight for more than 48 agents', () => {
  const agents = Array.from({ length: 53 }, (_, i) => ({ agentId: `agent-${i}` }))
  const starts = Array.from({ length: 53 }, (_, i) => rotateMastersLearningAgents(agents, new Date((47 + i) * 1_800_000))[0].agentId)
  assert.equal(new Set(starts).size, 53)
  assert.equal(agents[0].agentId, 'agent-0')
  assert.deepEqual(rotateMastersLearningAgents([], NOW), [])
  assert.throws(() => rotateMastersLearningAgents(agents, new Date('bad')))
})

test('scheduler skips inactive/claimed slots and starts at most one real batch', async () => {
  const calls: string[] = []
  const result = await runOneMastersLearningAgent([{ agentId: 'a' }, { agentId: 'b' }, { agentId: 'c' }, { agentId: 'd' }], new Date(0), async agentId => {
    calls.push(agentId); return { agentId, claimed: agentId === 'c', status: agentId === 'a' ? 'not_enrolled' : agentId === 'b' ? 'already_claimed' : 'learned' }
  })
  assert.deepEqual(calls, ['a', 'b', 'c']); assert.equal(result.result?.agentId, 'c')
})

test('a persistent error cannot monopolize the next half-hour and foreign results fail closed', async () => {
  const agents = [{ agentId: 'a' }, { agentId: 'b' }]
  const run = async (agentId: string) => ({ agentId, claimed: agentId === 'b', status: agentId === 'a' ? 'error' : 'learned' })
  assert.equal((await runOneMastersLearningAgent(agents, new Date(0), run)).result?.status, 'error')
  assert.equal((await runOneMastersLearningAgent(agents, new Date(1_800_000), run)).result?.agentId, 'b')
  await assert.rejects(runOneMastersLearningAgent(agents, NOW, async () => ({ agentId: 'cos', claimed: true, status: 'learned' })), /scope_mismatch/)
})

test('actual learning runner scopes all plans, slots, reads and accepted proof to the learner', async () => withLearningEnabled(async () => {
  const h = learningHarness(), result = await h.run({ agentId: AGENT, now: NOW, maxStudyPlans: 2 })
  assert.equal(result.status, 'learned', result.errors.join(',')); assert.equal(result.agentId, AGENT)
  assert.equal(result.acquisitionInvoked, true); assert.equal(result.plansAttempted, 1)
  assert.deepEqual(h.evidenceAgents, [AGENT]); assert.deepEqual(h.runtimeAgents, [AGENT, AGENT])
  assert.equal(h.proofCalls.length, 1); assert.equal(h.proofCalls[0].id, AGENT)
  assert.equal(h.proofCalls[0].proofs.length, 1, 'foreign accepted gaps cannot advance any plan')
  assert.ok(h.tables.cos_university_study_plans.every(row => row.agent_id === AGENT && row.evidence.academicCredit === false && row.program_key === PROGRAM_KEY))
  assert.ok(h.db.calls.filter(c => c.action === 'read').every(c => c.filters.some(([k,v]: any[]) => k === 'agent_id' && v === AGENT)))
  const finish = h.db.calls.find(c => c.table === 'cos_university_masters_learning_runs' && c.action === 'update')
  assert.ok(finish.filters.some(([k,v]: any[]) => k === 'agent_id' && v === AGENT))
  const again = await h.run({ agentId: AGENT, now: NOW, maxStudyPlans: 2 })
  assert.equal(again.status, 'already_claimed'); assert.equal(h.acquired(), 1)
}))

test('actual worker with an enrollment but incomplete undergraduate foundation performs no writes or acquisition', async () => withLearningEnabled(async () => {
  const h = learningHarness({ admitted: false }), result = await h.run({ agentId: AGENT, now: NOW })
  assert.equal(result.status, 'program_inactive'); assert.equal(result.acquisitionInvoked, false)
  assert.deepEqual(result.reasons, ['undergraduate_foundation_not_ready'])
  assert.equal(h.acquired(), 0); assert.ok(h.db.calls.every(call => call.action === 'read'))
}))

test('database outage cannot be reported as an empty successful study cycle', async () => withLearningEnabled(async () => {
  const h = learningHarness({ dbFailure: true }), result = await h.run({ agentId: AGENT, now: NOW })
  assert.equal(result.status, 'error'); assert.equal(h.acquired(), 0); assert.equal(h.proofCalls.length, 0)
}))

test('probationary acquisition alone cannot unlock coursework study proof', async () => withLearningEnabled(async () => {
  const h = learningHarness({ noAccepted: true }), result = await h.run({ agentId: AGENT, now: NOW })
  assert.equal(result.status, 'idle'); assert.equal(result.plansAttempted, 0); assert.equal(h.proofCalls.length, 0)
}))

test('identity or admission changes during acquisition prevent study advancement', async () => withLearningEnabled(async () => {
  for (const option of [{ roleChanged: true }, { proofGateClosed: true }]) {
    const h = learningHarness(option), result = await h.run({ agentId: AGENT, now: NOW })
    assert.equal(result.status, 'error'); assert.equal(h.proofCalls.length, 0); assert.equal(result.plansAttempted, 0)
  }
}))

test('actual shared runtime reads only requested-agent evidence and rejects COS admission reuse', async () => {
  const db = fakeDb({
    cos_university_assessments: [{ agent_id: 'cos', assessment_key: 'foreign' }, { agent_id: AGENT, assessment_key: 'own' }],
    cos_university_masters_evidence: ['cos', AGENT].map(agent_id => ({ agent_id, program_key: PROGRAM_KEY, program_id: PROGRAM, stage: 'graduate_coursework', variant_hash: agent_id, passed: true })),
  })
  const generalistReads: string[] = [], assessmentReads: any[] = []
  const ports = {
    requireMastersLearningAgentId, cosServiceDb: () => db,
    cosUniversityMastersProgramKey: () => PROGRAM_KEY, cosUniversityMastersCredentialKey: (agent: string) => `${agent}:masters:test:v1`,
    COS_UNIVERSITY_MASTERS_PROGRAMS: { [PROGRAM]: { primarySubjects: [], title: 'Test' } },
    readCosUniversityGeneralistGraduationStatus: async (_now: Date, agent: string) => { generalistReads.push(agent); return { credential: null, remediation: { pendingCount: 0 }, currentCompetenceStanding: 'not_graduated' } },
    academicStateFromRows: (rows: unknown[]) => { assessmentReads.push(rows); return { subjectTranscript: [] } },
    evaluateCosUniversityMastersAdmission: () => ({ admitted: false, reasons: ['undergraduate_credential_required'] }),
    evaluateCosUniversityMastersGraduation: () => ({ graduated: false, standing: 'not_graduated', blockers: [] }),
    cosUniversityProgramTimingStatus: () => 'not_enrolled', cosUniversityProgramMayGraduate: () => false,
  }
  const m = moduleWithPorts('lib/ai/cos/cosUniversityMastersRuntime.ts', ['readCosUniversityMastersRuntimeStatus', 'readCosUniversityMastersEvidence'], ports)
  const result = await m.readCosUniversityMastersRuntimeStatus(PROGRAM, NOW, undefined, AGENT)
  assert.equal(result.agentId, AGENT); assert.equal(result.awardEligible, false)
  assert.deepEqual(generalistReads, [AGENT]); assert.deepEqual(assessmentReads[0].map((r: any) => r.assessment_key), ['own'])
  assert.deepEqual((await m.readCosUniversityMastersEvidence(PROGRAM, AGENT)).map((r: any) => r.variantHash), [AGENT])
  await assert.rejects(m.readCosUniversityMastersRuntimeStatus(PROGRAM, NOW, { agentId: 'cos', undergraduateCredentialAwarded: true }, AGENT), /scope_mismatch/)
  assert.ok(db.calls.every(call => call.filters.some(([k,v]: any[]) => k === 'agent_id' && v === AGENT)))
})

test('cron remains authenticated and the worker cannot enroll, score, or issue degrees', () => {
  const route = file('app/api/cron/cos-university-masters-learning/route.ts')
  assert.match(route, /auth !== `Bearer \$\{secret\}`/)
  assert.match(route, /listCosUniversityRegisteredAgents\(\)/)
  assert.match(route, /runOneMastersLearningAgent\(agents, now/)
  assert.match(route, /maxStudyPlans: 2/)
  assert.match(route, /acquisitionInvoked: false/)
  const worker = file('lib/ai/cos/cosUniversityMastersLearningRunner.ts')
  assert.doesNotMatch(worker, /recordHostCosUniversityMastersEvidence|evaluateAndAward|ensureCosUniversityMastersEnrollment/)
  assert.match(worker, /recordAcceptedCosUniversityStudyAttempts\(proofs, new Date\(\), agentId\)/)
  assert.match(worker, /readCosUniversityAgentRole\(agentId\)/)
})

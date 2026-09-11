// saas/tests/cosUniversityDailyLaneCadence.node.test.ts
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { COS_UNIVERSITY_FEATURE_GATED_PATHS } from '../lib/ai/cos/cosUniversityLearningAssurance.ts'
import {
  COS_UNIVERSITY_DAILY_LANE_WINDOWS,
  decideCosUniversityDailyLaneCadence,
  isCosUniversityDailyBatchExecution,
} from '../lib/ai/cos/cosUniversityDailyLaneCadenceCore.ts'

const executed = { featureEnabled: true, invocationSucceeded: true, attempted: 2 }
const row = (at: string, evidence: Record<string, unknown>, key = 'k') => ({ event_key: key, observed_at: at, evidence })

test('before the daily window the batch is not due, preserving the original academic slot', () => {
  const cadence = decideCosUniversityDailyLaneCadence({ path: 'independent_exams', now: new Date('2026-09-12T06:59:00Z'), rows: [] })
  assert.equal(cadence.due, false)
  assert.equal(cadence.reason, 'before_daily_window')
  assert.equal(cadence.runnerInvoked, false)
  assert.equal(cadence.windowOpensAt, '2026-09-12T07:00:00.000Z')
})

test('at the window with no successful execution today the batch is due', () => {
  const cadence = decideCosUniversityDailyLaneCadence({ path: 'independent_exams', now: new Date('2026-09-12T07:00:05Z'), rows: [] })
  assert.equal(cadence.due, true)
  assert.equal(cadence.reason, 'daily_batch_due')
})

test('a successful execution inside today\'s window makes later hourly ticks not due', () => {
  const cadence = decideCosUniversityDailyLaneCadence({
    path: 'independent_exams', now: new Date('2026-09-12T15:00:00Z'),
    rows: [row('2026-09-12T07:00:30Z', executed, 'exec-1')],
  })
  assert.equal(cadence.due, false)
  assert.equal(cadence.reason, 'daily_batch_already_executed')
  assert.equal(cadence.priorExecutionRef, 'db://cos_university_learning_assurance_events/exec-1')
})

test('failures, skips, disabled runs, not-due receipts and yesterday never count as today\'s batch', () => {
  const now = new Date('2026-09-12T15:00:00Z')
  const rows = [
    row('2026-09-12T07:00:30Z', { ...executed, invocationSucceeded: false }),
    row('2026-09-12T08:00:30Z', { ...executed, skipped: true }),
    row('2026-09-12T09:00:30Z', { ...executed, enabled: false }),
    row('2026-09-12T10:00:30Z', { ...executed, featureEnabled: false }),
    row('2026-09-12T11:00:30Z', { ...executed, dailyCadence: 'not_due' }),
    row('2026-09-11T07:00:30Z', executed),
    row('2026-09-12T06:30:00Z', executed),
  ]
  const cadence = decideCosUniversityDailyLaneCadence({ path: 'independent_exams', now, rows })
  assert.equal(cadence.due, true, 'a failed batch retries on the next hourly tick instead of being masked')
  assert.equal(isCosUniversityDailyBatchExecution(null), false)
})

test('only the eight previously once-daily lanes are cadence-gated, and each is a declared path', () => {
  const lanes = Object.keys(COS_UNIVERSITY_DAILY_LANE_WINDOWS).sort()
  assert.deepEqual(lanes, [
    'controlled_fine_tuning', 'delayed_retention', 'graduation', 'independent_exams',
    'language_a_range_evidence', 'masters_admission', 'phd_admission', 'subject_a_range_evidence',
  ])
  for (const lane of lanes) assert.ok(lane in COS_UNIVERSITY_FEATURE_GATED_PATHS)
  assert.throws(() => decideCosUniversityDailyLaneCadence({ path: 'continuous_learning', now: new Date(), rows: [] }), /not_a_daily_lane/)
})

const ROUTES: Record<string, string[]> = {
  'cos-university-exam': ['independent_exams'],
  'cos-university-a-range': ['subject_a_range_evidence'],
  'cos-university-language-a-range': ['language_a_range_evidence'],
  'cos-university-retention': ['delayed_retention'],
  'cos-university-graduation': ['graduation'],
  'cos-university-masters-admission': ['masters_admission'],
  'cos-university-phd-admission': ['phd_admission', 'phd_runtime'],
  'cos-university-fine-tuning': ['controlled_fine_tuning'],
}

test('every daily-lane route checks cadence before its runner and records an honest not_due receipt', () => {
  for (const [route, paths] of Object.entries(ROUTES)) {
    const source = fs.readFileSync(path.resolve(import.meta.dirname, `../app/api/cron/${route}/route.ts`), 'utf8')
    const gateAt = source.indexOf('readCosUniversityDailyLaneCadence(')
    assert.ok(gateAt > 0, `${route} must read daily cadence`)
    const runnerAt = source.search(/const result = await run/)
    assert.ok(runnerAt > gateAt, `${route} must decide cadence before invoking its runner`)
    for (const p of paths) assert.match(source, new RegExp(`path: '${p}', invocationSucceeded: true, evidence: \\{ dailyCadence: 'not_due', runnerInvoked: false`))
  }
})

test('the daily lanes are scheduled hourly so every deployed commit can produce receipts within an hour', () => {
  const vercel = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../vercel.json'), 'utf8'))
  const crons = new Map<string, string>(vercel.crons.map((c: { path: string; schedule: string }) => [c.path, c.schedule]))
  for (const route of Object.keys(ROUTES)) {
    const schedule = crons.get(`/api/cron/${route}`)
    assert.ok(schedule, `${route} must be scheduled`)
    assert.match(schedule!, /^\d{1,2} \* \* \* \*$/, `${route} must run hourly`)
  }
})

test('the original once-daily academic order is preserved by the cadence windows', () => {
  const minute = (lane: keyof typeof COS_UNIVERSITY_DAILY_LANE_WINDOWS) => {
    const w = COS_UNIVERSITY_DAILY_LANE_WINDOWS[lane]!
    return w.hourUtc * 60 + w.minuteUtc
  }
  const order = ['independent_exams', 'subject_a_range_evidence', 'language_a_range_evidence', 'delayed_retention',
    'graduation', 'masters_admission', 'phd_admission', 'controlled_fine_tuning'] as const
  for (let i = 1; i < order.length; i += 1) assert.ok(minute(order[i]) > minute(order[i - 1]), `${order[i]} must follow ${order[i - 1]}`)
  assert.equal(minute('independent_exams'), 7 * 60, 'exams keep their 07:00 UTC slot after the 06:30 mining lane')
})

test('per-agent lanes: one agent\'s batch never satisfies another agent\'s daily batch', () => {
  const now = new Date('2026-09-12T08:10:00Z')
  const cosRun = row('2026-09-12T07:10:30Z', { ...executed, agentId: 'cos' }, 'cos-1')
  const specialist = decideCosUniversityDailyLaneCadence({ path: 'subject_a_range_evidence', now, rows: [cosRun], agentId: 'software-specialist' })
  assert.equal(specialist.due, true)
  assert.equal(specialist.agentId, 'software-specialist')
  const cos = decideCosUniversityDailyLaneCadence({ path: 'subject_a_range_evidence', now, rows: [cosRun], agentId: 'cos' })
  assert.equal(cos.due, false)
  assert.equal(cos.priorExecutionRef, 'db://cos_university_learning_assurance_events/cos-1')
})

test('per-agent lanes: receipts written before agent tagging count only as COS executions', () => {
  const legacy = { ...executed }
  assert.equal(isCosUniversityDailyBatchExecution(legacy, 'cos'), true)
  assert.equal(isCosUniversityDailyBatchExecution(legacy, 'software-specialist'), false)
  assert.equal(isCosUniversityDailyBatchExecution(legacy), true, 'path-level lanes keep their original behavior')
})

test('A-range runs for every registered agent, one agent per tick, each through its own program gate and cadence', () => {
  const route = fs.readFileSync(path.resolve(import.meta.dirname, '../app/api/cron/cos-university-a-range/route.ts'), 'utf8')
  assert.match(route, /listCosUniversityRegisteredAgents\(\)/)
  assert.match(route, /readCosUniversityUndergraduateAcademicLaneGate\(now, agent\.agentId\)/)
  assert.match(route, /readCosUniversityDailyLaneCadence\('subject_a_range_evidence', now, agent\.agentId\)/)
  assert.match(route, /runCosUniversityARangeBatch\(\{ now, agentId: agent\.agentId \}\)/)
  assert.match(route, /evidence: \{ \.\.\.result, agentId: agent\.agentId, programGate \}/)
  const runAt = route.indexOf('runCosUniversityARangeBatch({')
  assert.ok(route.indexOf('return NextResponse.json({ ok: result.errors.length === 0', runAt) > runAt, 'a tick returns after one agent batch')
})

test('A-range runner is agent-scoped and never attributes COS Production turns to another agent', () => {
  const runner = fs.readFileSync(path.resolve(import.meta.dirname, '../lib/ai/cos/cosUniversityARangeRunner.ts'), 'utf8')
  assert.match(runner, /options: \{ now\?: Date; agentId\?: string \}/)
  assert.match(runner, /loadAssessmentRows\(agentId\)/)
  assert.match(runner, /loadRunRows\(agentId\)/)
  assert.match(runner, /agent_id: agentId,/)
  assert.doesNotMatch(runner, /\.eq\('agent_id', AGENT_ID\)/, 'evidence reads must use the requested agent')
  assert.match(runner, /if \(agentId === AGENT_ID\) \{\s*try \{\s*const synced = await syncVerifiedProductionOutcomes/)
  // COS keeps its historical run and assessment keys; other agents are namespaced so ledgers never collide.
  assert.match(runner, /\$\{COS_UNIVERSITY_A_RANGE_PROFILE\}:\$\{input\.stage\}:\$\{input\.day\}:\$\{input\.subjectId\}/)
  assert.match(runner, /\$\{COS_UNIVERSITY_A_RANGE_PROFILE\}:\$\{input\.agentId\}:\$\{input\.stage\}:\$\{input\.day\}:\$\{input\.subjectId\}/)
  assert.match(runner, /cos-university-a-range-pass:\$\{args\.agentId\}:/)
  assert.match(runner, /agentId: args\.agentId,/)
})

test('delayed retention runs for every registered agent, one agent per tick, through per-agent cadence', () => {
  const route = fs.readFileSync(path.resolve(import.meta.dirname, '../app/api/cron/cos-university-retention/route.ts'), 'utf8')
  assert.match(route, /listCosUniversityRegisteredAgents\(\)/)
  assert.match(route, /readCosUniversityDailyLaneCadence\('delayed_retention', now, agent\.agentId\)/)
  assert.match(route, /runCosUniversityRetention\(\{ now, agentId: agent\.agentId \}\)/)
  assert.match(route, /evidence: \{ \.\.\.result, agentId: agent\.agentId \}/)
  const runAt = route.indexOf('runCosUniversityRetention({')
  assert.ok(route.indexOf('return NextResponse.json({ ok: errors.length === 0', runAt) > runAt, 'a tick returns after one agent batch')
})

test('retention runner replays only the requested agent\'s own passed transfer and records under that agent', () => {
  const runner = fs.readFileSync(path.resolve(import.meta.dirname, '../lib/ai/cos/cosUniversityRetentionRunner.ts'), 'utf8')
  assert.match(runner, /options: \{ now\?: Date; agentId\?: string \}/)
  assert.doesNotMatch(runner, /\.eq\('agent_id', 'cos'\)/)
  assert.doesNotMatch(runner, /agent_id: 'cos'/)
  assert.equal((runner.match(/\.eq\('agent_id', agentId\)/g) || []).length, 2, 'both source transfers and completed retention are agent-scoped')
  assert.match(runner, /agent_id: agentId, subject_id: source\.subjectId/)
  assert.match(runner, /assessmentKey: `cos-university-retention:\$\{inserted\.data\.id\}`, agentId,/)
  assert.match(runner, /selectDueCosUniversityRetention\(sources, completed, now\)/)
})


test('language A-range runs for every registered agent with isolated evidence and cadence', () => {
  const route = fs.readFileSync(path.resolve(import.meta.dirname, '../app/api/cron/cos-university-language-a-range/route.ts'), 'utf8')
  assert.match(route, /listCosUniversityRegisteredAgents\(\)/)
  assert.match(route, /readCosUniversityUndergraduateAcademicLaneGate\(now, agent\.agentId\)/)
  assert.match(route, /readCosUniversityDailyLaneCadence\('language_a_range_evidence', now, agent\.agentId\)/)
  assert.match(route, /runCosUniversityLanguageARangeBatch\(\{ now, agentId: agent\.agentId \}\)/)
  assert.match(route, /evidence: \{ \.\.\.result, agentId: agent\.agentId, programGate \}/)

  const runner = fs.readFileSync(path.resolve(import.meta.dirname, '../lib/ai/cos/cosUniversityLanguageARangeRunner.ts'), 'utf8')
  assert.match(runner, /options: \{ now\?: Date; agentId\?: string \}/)
  assert.match(runner, /loadAssessmentRows\(agentId\)/)
  assert.match(runner, /loadRunRows\(agentId\)/)
  assert.match(runner, /agent_id: agentId,/)
  assert.match(runner, /if \(agentId === AGENT_ID\)/)
  assert.match(runner, /cos-university-language-a-range-pass:\$\{args\.agentId\}:/)
  assert.match(runner, /agentId: args\.agentId,/)
})

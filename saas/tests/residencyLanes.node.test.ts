// saas/tests/residencyLanes.node.test.ts
//
// Owner direction 2026-09-30 (pipeline worked backwards: Residency remediation, then residents). Residency ran ONE case
// per 10-minute tick for the whole cohort, each turn to a different resident, so every case cold-started a different
// exact artifact. Now each tick runs one lane per resident in parallel, a resident keeps its lane while its worker is
// warm, remediation residents go first, and the number of lanes never exceeds the admitted cohort.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  BUILDER_RESIDENCY_LANE_WARM_WINDOW_MS,
  createSupabaseBuilderResidencyOrchestratorStore,
  selectBuilderResidencyLanes,
} from '../platform-harness/residency/orchestrator-store.ts'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const now = new Date('2026-09-30T05:00:00.000Z')
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000).toISOString()
const enrollment = (id: string, standing = 'resident') => ({ id, standing })
const done = (id: string, minutes: number, outcome = 'passed') => ({ residency_id: id, harness_outcome: outcome, completed_at: minutesAgo(minutes) })

test('remediation first, then warm workers, then new admissions, then the rest; blocked residents last', () => {
  const enrollments = [
    enrollment('old'),
    enrollment('blocked', 'remediation_required'),
    enrollment('warm'),
    enrollment('remediation', 'remediation_required'),
    enrollment('new'),
    enrollment('cold'),
  ]
  const recentCases = [
    done('warm', 3),
    done('blocked', 4, 'infrastructure_failure'),
    done('blocked', 14, 'infrastructure_failure'),
    done('remediation', 30, 'failed'),
    done('cold', 40),
    done('old', 90),
  ]
  const lanes = selectBuilderResidencyLanes({ enrollments, recentCases, laneCount: 4, now })
  assert.deepEqual(lanes.map(row => row.id), ['remediation', 'warm', 'new', 'old'])
  assert.equal(selectBuilderResidencyLanes({ enrollments, recentCases, laneCount: 10, now }).at(-1)?.id, 'blocked',
    'two consecutive infrastructure failures yield the lane to residents that can make progress')
  assert.equal(new Set(selectBuilderResidencyLanes({ enrollments, recentCases, laneCount: 10, now }).map(row => row.id)).size, 6, 'one lane per resident')
})

test('a resident keeps its lane while its worker is warm, so it is not cold-started again', () => {
  const enrollments = [enrollment('a'), enrollment('b'), enrollment('c')]
  const warmMinutes = Math.floor(BUILDER_RESIDENCY_LANE_WARM_WINDOW_MS / 60_000) - 1
  const lanes = selectBuilderResidencyLanes({ enrollments, recentCases: [done('c', warmMinutes), done('a', 60), done('b', 50)], laneCount: 1, now })
  assert.deepEqual(lanes.map(row => row.id), ['c'])
  assert.ok(BUILDER_RESIDENCY_LANE_WARM_WINDOW_MS < 12 * 60_000, 'inside the 12-minute idle timeout of the exact-artifact worker')
})

// Minimal PostgREST-shaped fake over several tables, with conditional updates and idempotent upserts.
function fakeDb(tables: Record<string, any[]>) {
  const from = (table: string) => {
    const filters: Array<(row: any) => boolean> = []
    let mode: 'select' | 'update' | 'upsert' = 'select'
    let patch: any = null
    const rowsOf = () => tables[table] || (tables[table] = [])
    const matched = () => rowsOf().filter(row => filters.every(filter => filter(row)))
    const builder: any = {
      select: () => builder,
      eq: (column: string, value: unknown) => { filters.push(row => row[column] === value); return builder },
      in: (column: string, values: unknown[]) => { filters.push(row => values.includes(row[column])); return builder },
      not: () => builder,
      order: () => builder,
      limit: () => builder,
      update: (value: any) => { mode = 'update'; patch = value; return builder },
      upsert: (value: any) => { mode = 'upsert'; patch = value; return builder },
      maybeSingle: async () => ({ data: matched()[0] ?? null, error: null }),
      then: (resolve: (value: any) => unknown) => {
        if (mode === 'upsert') {
          if (!rowsOf().some(row => row.event_key === patch.event_key)) rowsOf().push(patch)
          return Promise.resolve(resolve({ data: null, error: null }))
        }
        if (mode === 'update') {
          const hit = matched()
          for (const row of hit) Object.assign(row, patch)
          return Promise.resolve(resolve({ data: hit.map(row => ({ id: row.id })), error: null }))
        }
        return Promise.resolve(resolve({ data: matched(), error: null }))
      },
    }
    return builder
  }
  return { from }
}
const residentRow = (id: string, n: string, standing: string, minutes: number) => ({
  id, candidate_id: `mass:${n}`, subject_id: 'Computer Science & Coding', trained_artifact_id: `a${n}`,
  trained_artifact_hash: n.repeat(64), revision_key: `k${n}`, standing, updated_at: minutesAgo(minutes),
})
const studentRow = (n: string, status: string) => ({ candidate_id: `mass:${n}`, trained_artifact_hash: n.repeat(64), status })
const storeFor = (tables: Record<string, any[]>) =>
  createSupabaseBuilderResidencyOrchestratorStore({ db: fakeDb(tables) as any, tenantId: 't', portableId: 'p', agentId: 'a', sandboxEnvironmentId: 's' })

test('a pinned lane gives its turns only to its own resident, and stops when that resident is no longer active', async () => {
  const tables: Record<string, any[]> = {
    cos_university_residency_enrollments: [residentRow('r1', '1', 'resident', 10), residentRow('r2', '2', 'remediation_required', 20)],
    cos_local_distillation_artifacts: [studentRow('1', 'evaluation_pending'), studentRow('2', 'evaluation_pending')],
  }
  const store = storeFor(tables)
  const lanes = await store.planLanes(4)
  assert.deepEqual(lanes.map(lane => lane.residencyId), ['r2', 'r1'], 'remediation first')
  const pinned = store.pinnedTo(lanes[1])
  assert.equal((await pinned.nextEnrollment())?.residencyId, 'r1')
  tables.cos_university_residency_enrollments[0].standing = 'residency_complete'
  assert.equal(await pinned.nextEnrollment(), null, 'a resident that finished mid-tick gets no further case')
})

// Production 2026-09-30 (owner query): all 10 residents' students were `retired`, every case stopped on
// residency_exact_artifact_registry_mismatch (24 turns in one hour, 0 passes) and the dead enrollments held every seat.
test('a resident whose student already left gets no case turn, even before its enrollment is closed', async () => {
  const store = storeFor({
    cos_university_residency_enrollments: [residentRow('gone', '3', 'remediation_required', 30), residentRow('live', '4', 'resident', 10)],
    cos_local_distillation_artifacts: [studentRow('3', 'retired'), studentRow('4', 'evaluation_pending')],
  })
  assert.deepEqual((await store.planLanes(4)).map(lane => lane.residencyId), ['live'])
  assert.equal((await store.nextEnrollment())?.residencyId, 'live')
})

test('departed residents are withdrawn with a durable record, never as a pass or a Residency FAIL', async () => {
  const tables: Record<string, any[]> = {
    cos_university_residency_enrollments: [residentRow('gone', '5', 'resident', 30), residentRow('live', '6', 'resident', 10)],
    cos_local_distillation_artifacts: [studentRow('5', 'retired'), studentRow('6', 'evaluation_pending')],
    cos_university_learning_assurance_events: [],
  }
  const store = storeFor(tables)
  const sweep = await store.withdrawDepartedResidencies()
  assert.deepEqual([...sweep.withdrawnResidencyIds], ['gone'])
  assert.equal(tables.cos_university_residency_enrollments.find(row => row.id === 'gone')?.standing, 'withdrawn')
  assert.equal(tables.cos_university_residency_enrollments.find(row => row.id === 'live')?.standing, 'resident')
  const record = tables.cos_university_learning_assurance_events[0]
  assert.equal(record.evidence.claim, 'builder_residency_withdrawn')
  assert.equal(record.evidence.artifactStatus, 'retired')
  assert.equal(record.evidence.evaluationPassed, false)
  assert.equal(record.evidence.reason, 'student_left_university')
  assert.equal((await store.withdrawDepartedResidencies()).withdrawnResidencyIds.length, 0, 'a second sweep changes nothing')
  const migration = read('supabase/migrations/20260930063000_residency_withdrawn_standing.sql')
  assert.match(migration, /'residency_failed','withdrawn'\)\)/)
  assert.match(read('app/api/admin/cos-university-telemetry/route.ts'), /residency: residency\.filter\(\(row: any\) => row\.standing !== 'withdrawn'\)/)
})

test('the cron runs lanes in parallel after sweeps and admission, never more lanes than the admitted cohort', () => {
  const route = read('app/api/cron/cos-university-residency/route.ts')
  const lanes = Number(/RESIDENCY_PARALLEL_LANES = (\d+)/.exec(route)?.[1])
  const cohort = Number(/admitNextBuilderResidency\(\{ db, activeLimit: (\d+) \}\)/.exec(route)?.[1])
  assert.ok(lanes >= 1 && lanes <= cohort, 'lanes never exceed the University admission cap')
  const order = ['closeStaleStartedResidencyCases(', 'store.withdrawDepartedResidencies()', 'store.closeUnrecoverableResidencies()', 'admitNextBuilderResidency(', 'store.planLanes(']
    .map(marker => route.indexOf(marker))
  assert.ok(order.every((index, i) => index > 0 && (i === 0 || index > order[i - 1])))
  assert.match(route, /const readyBudgetMs = RESIDENCY_INVOCATION_BUDGET_MS - \(Date\.now\(\) - tickStartedAt\) - RESIDENCY_CASE_EXECUTION_RESERVE_MS/,
    'every lane still starts a case only when it fits in what is left of the invocation')
  assert.match(route, /if \(result\.state !== 'case_completed' && result\.state !== 'case_not_completed'\) break/)
  assert.match(route, /automaticFinalGateEnable: false/)
  assert.match(route, /productionTrafficAuthorized: false/)
})
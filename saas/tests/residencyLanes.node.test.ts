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

test('a pinned lane gives its turns only to its own resident, and stops when that resident is no longer active', async () => {
  const rows = [
    { id: 'r1', candidate_id: 'mass:1', subject_id: 'Computer Science & Coding', trained_artifact_id: 'a1', trained_artifact_hash: '1'.repeat(64), revision_key: 'k1', standing: 'resident', updated_at: minutesAgo(10) },
    { id: 'r2', candidate_id: 'mass:2', subject_id: 'Computer Science & Coding', trained_artifact_id: 'a2', trained_artifact_hash: '2'.repeat(64), revision_key: 'k2', standing: 'remediation_required', updated_at: minutesAgo(20) },
  ]
  const from = (table: string) => {
    const filters: Array<(row: any) => boolean> = []
    const builder: any = {
      select: () => builder,
      eq: (column: string, value: unknown) => { filters.push(row => row[column] === value); return builder },
      in: (column: string, values: unknown[]) => { filters.push(row => values.includes(row[column])); return builder },
      not: () => builder,
      order: () => builder,
      limit: () => builder,
      maybeSingle: async () => ({ data: (table === 'cos_university_residency_enrollments' ? rows : []).filter(row => filters.every(filter => filter(row)))[0] ?? null, error: null }),
      then: (resolve: (value: any) => unknown) => Promise.resolve(resolve({
        data: (table === 'cos_university_residency_enrollments' ? rows : []).filter(row => filters.every(filter => filter(row))),
        error: null,
      })),
    }
    return builder
  }
  const store = createSupabaseBuilderResidencyOrchestratorStore({ db: { from } as any, tenantId: 't', portableId: 'p', agentId: 'a', sandboxEnvironmentId: 's' })
  const lanes = await store.planLanes(4)
  assert.deepEqual(lanes.map(lane => lane.residencyId), ['r2', 'r1'], 'remediation first')
  const pinned = store.pinnedTo(lanes[1])
  assert.equal((await pinned.nextEnrollment())?.residencyId, 'r1')
  rows[0].standing = 'residency_complete'
  assert.equal(await pinned.nextEnrollment(), null, 'a resident that finished mid-tick gets no further case')
})

test('the cron runs lanes in parallel after sweeps and admission, never more lanes than the admitted cohort', () => {
  const route = read('app/api/cron/cos-university-residency/route.ts')
  const lanes = Number(/RESIDENCY_PARALLEL_LANES = (\d+)/.exec(route)?.[1])
  const cohort = Number(/admitNextBuilderResidency\(\{ db, activeLimit: (\d+) \}\)/.exec(route)?.[1])
  assert.ok(lanes >= 1 && lanes <= cohort, 'lanes never exceed the University admission cap')
  const order = ['closeStaleStartedResidencyCases(', 'store.closeUnrecoverableResidencies()', 'admitNextBuilderResidency(', 'store.planLanes(']
    .map(marker => route.indexOf(marker))
  assert.ok(order.every((index, i) => index > 0 && (i === 0 || index > order[i - 1])))
  assert.match(route, /const readyBudgetMs = RESIDENCY_INVOCATION_BUDGET_MS - \(Date\.now\(\) - tickStartedAt\) - RESIDENCY_CASE_EXECUTION_RESERVE_MS/,
    'every lane still starts a case only when it fits in what is left of the invocation')
  assert.match(route, /if \(result\.state !== 'case_completed' && result\.state !== 'case_not_completed'\) break/)
  assert.match(route, /automaticFinalGateEnable: false/)
  assert.match(route, /productionTrafficAuthorized: false/)
})

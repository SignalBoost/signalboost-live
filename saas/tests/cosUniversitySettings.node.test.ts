// saas/tests/cosUniversitySettings.node.test.ts
//
// The buyer-controlled University settings: the warm window and the production pause switch, stored in
// `system_settings`, surfaced on the University telemetry page, obeyed by every production station.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  LINE_PAUSED_SETTING_KEY,
  WORKFORCE_WARM_WINDOW_SETTING_KEY,
  pausedStationResponse,
  pausedValue,
  readLinePauseSetting,
  readWorkforceWarmWindowSetting,
  universitySettingsView,
  writeLinePauseSetting,
  writeWorkforceWarmWindowSetting,
} from '../lib/ai/cos/cosUniversitySettings.ts'
import { WORKFORCE_WARM_WINDOW_ENV } from '../lib/ai/cos/cosUniversityWorkforceReservation.ts'
import { proveLineMovement, sampleFromLineState } from '../lib/ai/cos/cosUniversityLineMovementProof.ts'
import { COS_UNIVERSITY_SETTINGS_COPY } from '../lib/i18n/cosUniversitySettingsCopy.ts'

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8')

/** A key/value store that speaks just enough PostgREST for the module. */
function fakeStore(rows: Record<string, { value: unknown; updated_at?: string; updated_by?: string | null }> = {}, failing = false) {
  const upserts: unknown[] = []
  const db = {
    from(table: string) {
      assert.equal(table, 'system_settings')
      return {
        select() {
          return {
            eq(_column: string, key: string) {
              return {
                async maybeSingle() {
                  if (failing) return { data: null, error: new Error('store_down') }
                  return { data: rows[key] ? { value: rows[key].value, updated_at: rows[key].updated_at ?? null, updated_by: rows[key].updated_by ?? null } : null, error: null }
                },
              }
            },
          }
        },
        async upsert(row: any, options: any) {
          assert.deepEqual(options, { onConflict: 'key' })
          upserts.push(row)
          rows[row.key] = { value: row.value, updated_at: row.updated_at, updated_by: row.updated_by }
          return { error: failing ? new Error('store_down') : null }
        },
      }
    },
  }
  return { db, upserts, rows }
}

test('warm window: nothing stored reads as null; a stored window reads back with who and when', async () => {
  const empty = fakeStore()
  assert.deepEqual(await readWorkforceWarmWindowSetting(empty.db), { value: null, updatedAt: null, updatedBy: null })
  const stored = fakeStore({ [WORKFORCE_WARM_WINDOW_SETTING_KEY]: { value: '17:00-19:00', updated_at: '2026-10-04T05:00:00Z', updated_by: 'owner-1' } })
  assert.deepEqual(await readWorkforceWarmWindowSetting(stored.db), { value: '17:00-19:00', updatedAt: '2026-10-04T05:00:00Z', updatedBy: 'owner-1' })
})

test('warm window write: valid is stored normalized, empty clears, invalid is refused before the store', async () => {
  const store = fakeStore()
  assert.deepEqual(await writeWorkforceWarmWindowSetting({ db: store.db, value: '  17:00-19:00 ', updatedBy: 'owner-1', now: new Date('2026-10-04T05:00:00Z') }), { ok: true, value: '17:00-19:00' })
  assert.deepEqual(store.upserts[0], { key: WORKFORCE_WARM_WINDOW_SETTING_KEY, value: '17:00-19:00', updated_by: 'owner-1', updated_at: '2026-10-04T05:00:00.000Z' })
  assert.deepEqual(await writeWorkforceWarmWindowSetting({ db: store.db, value: 'always', updatedBy: 'owner-1' }), { ok: false, error: 'workforce_warm_window_invalid' })
  assert.deepEqual(await writeWorkforceWarmWindowSetting({ db: store.db, value: '17:00-17:00', updatedBy: 'owner-1' }), { ok: false, error: 'workforce_warm_window_invalid' })
  assert.equal(store.upserts.length, 1, 'a refused window never reaches the store')
  assert.deepEqual(await writeWorkforceWarmWindowSetting({ db: store.db, value: '', updatedBy: 'owner-1' }), { ok: true, value: null })
  assert.deepEqual(await writeWorkforceWarmWindowSetting({ db: store.db, value: null, updatedBy: 'owner-1' }), { ok: true, value: null })
  assert.equal((await readWorkforceWarmWindowSetting(store.db)).value, null)
})

test('pause switch: only true is paused; unreadable store is not paused and says it does not know', async () => {
  assert.equal(pausedValue(true), true)
  assert.equal(pausedValue('true'), true)
  assert.equal(pausedValue('1'), true)
  assert.equal(pausedValue({ paused: true }), true)
  assert.equal(pausedValue(false), false)
  assert.equal(pausedValue('yes'), false)
  assert.equal(pausedValue(null), false)
  assert.deepEqual(await readLinePauseSetting(fakeStore().db), { paused: false, known: true, updatedAt: null, updatedBy: null })
  assert.deepEqual(await readLinePauseSetting(fakeStore({ [LINE_PAUSED_SETTING_KEY]: { value: true, updated_at: '2026-10-04T05:00:00Z', updated_by: 'owner-1' } }).db),
    { paused: true, known: true, updatedAt: '2026-10-04T05:00:00Z', updatedBy: 'owner-1' })
  assert.deepEqual(await readLinePauseSetting(fakeStore({}, true).db), { paused: false, known: false, updatedAt: null, updatedBy: null })
  assert.deepEqual(await readLinePauseSetting(null), { paused: false, known: false, updatedAt: null, updatedBy: null })
})

test('pause switch write stores a boolean, and the paused station answer has one shape', async () => {
  const store = fakeStore()
  assert.deepEqual(await writeLinePauseSetting({ db: store.db, paused: true, updatedBy: 'owner-1', now: new Date('2026-10-04T05:00:00Z') }), { ok: true, paused: true })
  assert.deepEqual(store.upserts[0], { key: LINE_PAUSED_SETTING_KEY, value: true, updated_by: 'owner-1', updated_at: '2026-10-04T05:00:00.000Z' })
  assert.equal((await readLinePauseSetting(store.db)).paused, true)
  await writeLinePauseSetting({ db: store.db, paused: false, updatedBy: 'owner-1' })
  assert.equal((await readLinePauseSetting(store.db)).paused, false)
  assert.deepEqual(pausedStationResponse('x'), { ok: true, paused: true, station: 'x', skipped: 'line_paused_by_operator' })
})

test('the page view composes stored + effective + schedule: a stored window wins over env and shows its clock', () => {
  const view = universitySettingsView({
    warmWindow: { value: '17:00-19:00', updatedAt: '2026-10-04T05:00:00Z', updatedBy: 'owner-1' },
    linePause: { paused: true, known: true, updatedAt: '2026-10-04T06:00:00Z', updatedBy: 'owner-1' },
    env: { [WORKFORCE_WARM_WINDOW_ENV]: '14:00-16:00' },
    now: new Date('2026-10-04T17:30:00Z'),
  })
  assert.deepEqual(view.warmWindow, {
    stored: '17:00-19:00', effective: '17:00-19:00', source: 'setting', inWindow: true,
    opensAt: null, closesAt: '2026-10-04T19:00:00.000Z', updatedAt: '2026-10-04T05:00:00Z', updatedBy: 'owner-1',
  })
  assert.deepEqual(view.linePaused, { paused: true, known: true, updatedAt: '2026-10-04T06:00:00Z', updatedBy: 'owner-1' })
  const fallback = universitySettingsView({
    warmWindow: { value: null, updatedAt: null, updatedBy: null },
    linePause: { paused: false, known: true, updatedAt: null, updatedBy: null },
    env: { [WORKFORCE_WARM_WINDOW_ENV]: '14:00-16:00' },
    now: new Date('2026-10-04T17:30:00Z'),
  })
  assert.equal(fallback.warmWindow.source, 'env')
  assert.equal(fallback.warmWindow.effective, '14:00-16:00')
  assert.equal(fallback.warmWindow.inWindow, false)
  assert.equal(fallback.warmWindow.opensAt, '2026-10-05T14:00:00.000Z')
  const none = universitySettingsView({
    warmWindow: { value: null, updatedAt: null, updatedBy: null },
    linePause: { paused: false, known: false, updatedAt: null, updatedBy: null },
    env: {},
    now: new Date('2026-10-04T17:30:00Z'),
  })
  assert.equal(none.warmWindow.source, 'none')
  assert.equal(none.warmWindow.effective, null)
  assert.equal(none.warmWindow.inWindow, null)
})

// The stations that produce, examine, graduate or drive the line. The workforce pipeline is deliberately NOT here:
// pausing stops the factory, not the graduates already serving.
const PAUSED_STATIONS = [
  'cos-university-mass-distillation',
  'runpod-mass-distilled-local-deploy',
  'cos-university-mass-distilled-evaluation',
  'cos-university-holdout-exam-items',
  'cos-university-mass-backlog-compact',
  'cos-university-graduate-activation',
  'cos-university-residency',
  'cos-university-lifecycle-orchestrator',
]

test('every production station checks the pause switch right after authorization and answers with the shared shape', () => {
  for (const station of PAUSED_STATIONS) {
    const route = read(`../app/api/cron/${station}/route.ts`)
    assert.match(route, /import \{ pausedStationResponse, readLinePauseSetting \} from '@\/lib\/ai\/cos\/cosUniversitySettings'/, station)
    const authAt = route.search(/Unauthorized/)
    const pauseAt = route.indexOf('readLinePauseSetting(')
    assert.ok(authAt > 0 && pauseAt > authAt, `${station}: pause check comes after authorization`)
    assert.match(route, new RegExp(`pausedStationResponse\\('${station}'\\)`), station)
    // Nothing that spends or writes may precede the pause check: no RunPod call, no claim, no fetch before it.
    const between = route.slice(authAt, pauseAt)
    assert.doesNotMatch(between, /await (queryRunpod|issueRolling|claim|fetch|run[A-Z])/, `${station}: no work before the pause check`)
  }
  const workforce = read('../app/api/cron/cos-workforce-pipeline/route.ts')
  assert.doesNotMatch(workforce, /readLinePauseSetting/, 'the workforce keeps serving while production is paused')
})

test('the orchestrator answers paused with no units, and the prover reads that as paused-by-operator, not a stop', () => {
  const route = read('../app/api/cron/cos-university-lifecycle-orchestrator/route.ts')
  assert.match(route, /\.\.\.pausedStationResponse\('cos-university-lifecycle-orchestrator'\), at: new Date\(\)\.toISOString\(\), units: \[\]/)
  const first = sampleFromLineState({ at: '2026-10-04T10:00:00Z', units: [{ candidateId: 'c1', artifactHash: 'a'.repeat(40), station: 'EXACT_CANARY', enteredAt: '2026-10-03T00:00:00Z' }] })
  const second = sampleFromLineState({ at: '2026-10-04T12:00:00Z', units: [], paused: true })
  const proof = proveLineMovement({ first, second })
  assert.equal(proof.verdict, 'inconclusive')
  assert.equal(proof.reason, 'line_paused_by_operator')
  assert.equal(proof.provenMoving, false)
  // Movement observed before the pause is still movement.
  const moved = sampleFromLineState({ at: '2026-10-04T12:00:00Z', units: [{ candidateId: 'c1', artifactHash: 'a'.repeat(40), station: 'INDEPENDENT_EVALUATION' }], paused: true })
  assert.equal(proveLineMovement({ first, second: moved }).verdict, 'proven_moving')
  assert.equal(sampleFromLineState({ at: 'x', units: [] }).paused, false)
  const spec = read('./cosUniversityAssemblyLine.playwright.spec.ts')
  assert.match(spec, /sampleFromLineState\(\{ at: String\(state\.at \|\| ''\), units: state\.units, paused: state\.paused \}\)/)
})

test('the settings API is owner-gated, validates through the module, and the panel is mounted on the telemetry page', () => {
  const api = read('../app/api/admin/cos-university-settings/route.ts')
  assert.match(api, /export async function GET\(\)[\s\S]{0,80}?await requireOwner\(\)/)
  assert.match(api, /export async function PATCH\(req: NextRequest\)[\s\S]{0,80}?await requireOwner\(\)/)
  assert.match(api, /writeWorkforceWarmWindowSetting\(\{ db, value: body\.warmWindow, updatedBy \}\)/)
  assert.match(api, /writeLinePauseSetting\(\{ db, paused: body\.linePaused === true, updatedBy \}\)/)
  assert.match(api, /line_paused_must_be_boolean/)
  const page = read('../app/dashboard/cos-university-telemetry/page.tsx')
  assert.match(page, /import UniversitySettingsPanel from '\.\/UniversitySettingsPanel'/)
  assert.match(page, /<UniversitySettingsPanel copy=\{settingsCopy\} \/>/)
  const panel = read('../app/dashboard/cos-university-telemetry/UniversitySettingsPanel.tsx')
  assert.match(panel, /const SETTINGS_URL = '\/api\/admin\/cos-university-settings'/)
  assert.match(panel, /method: 'PATCH'/)
  // No English literal in the panel's visible text: every string comes from copy.
  assert.doesNotMatch(panel, />[A-Z][a-z]+ [a-z]+</)
})

test('the settings copy has the same keys in all five languages and no empty string', () => {
  const languages = Object.keys(COS_UNIVERSITY_SETTINGS_COPY).sort()
  assert.deepEqual(languages, ['en', 'es', 'pl', 'pt', 'ru'])
  const keys = Object.keys(COS_UNIVERSITY_SETTINGS_COPY.en)
  for (const language of languages) {
    const block = COS_UNIVERSITY_SETTINGS_COPY[language as keyof typeof COS_UNIVERSITY_SETTINGS_COPY]
    assert.deepEqual(Object.keys(block), keys, language)
    for (const key of keys) assert.ok(String((block as any)[key]).trim().length > 0, `${language}.${key}`)
  }
})
// end of saas/tests/cosUniversitySettings.node.test.ts (if this line is missing, the paste was cut short)

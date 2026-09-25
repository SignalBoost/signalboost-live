// saas/tests/modelAssignmentRelease.node.test.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createMemoryModelConfigurationPort } from '../lib/ai/modelConfigurationMemory.ts'

const route = readFileSync(new URL('../app/api/admin/models/route.ts', import.meta.url), 'utf8')
const consoleSource = readFileSync(new URL('../components/admin/ModelConsole.tsx', import.meta.url), 'utf8')
const hostSource = readFileSync(new URL('../lib/ai/modelConfigurationSignalBoost.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../supabase/migrations/20260925233000_platform_model_assignment_release.sql', import.meta.url), 'utf8')
const gate = readFileSync(new URL('../scripts/vercel-cos-gates.mjs', import.meta.url), 'utf8')

function profile(key: string) {
  return { key, uses: ['specialist'], inference: { chatCompletion: 'validated' } } as any
}
function binding(profileKey: string) {
  return { profileKey, protocol: 'openai_compatible', provider: 'test', timeoutMs: 1000, maxCallCostUsd: 0 } as any
}

test('a first assignment can be released back to platform default routing', async () => {
  const port = createMemoryModelConfigurationPort()
  await port.register({ profile: profile('model-a'), binding: binding('model-a'), actorId: 'owner' })
  const first = await port.assign({ use: 'specialist', profileKey: 'model-a', certificationEventId: 'cert-a', actorId: 'owner' })
  await assert.rejects(
    port.rollback({ use: 'specialist', actorId: 'owner', expectedCurrentAssignmentId: first.assignmentId }),
    /platform_model_assignment_no_rollback_target/,
  )
  const released = await port.release({ use: 'specialist', actorId: 'owner', expectedCurrentAssignmentId: first.assignmentId })
  assert.equal(released.status, 'released')
  assert.equal(await port.currentAssignment('specialist'), null)
  await port.disable('model-a', 'owner')
})

test('release is concurrency-guarded and refuses when nothing is active', async () => {
  const port = createMemoryModelConfigurationPort()
  await port.register({ profile: profile('model-a'), binding: binding('model-a'), actorId: 'owner' })
  await assert.rejects(
    port.release({ use: 'specialist', actorId: 'owner', expectedCurrentAssignmentId: 'none' }),
    /platform_model_assignment_no_active_assignment/,
  )
  const first = await port.assign({ use: 'specialist', profileKey: 'model-a', certificationEventId: 'cert-a', actorId: 'owner' })
  await assert.rejects(
    port.release({ use: 'specialist', actorId: 'owner', expectedCurrentAssignmentId: 'stale-id' }),
    /platform_model_assignment_conflict/,
  )
  assert.equal((await port.currentAssignment('specialist'))?.assignmentId, first.assignmentId)
})

test('after release a role can be reassigned and history keeps the released row', async () => {
  const port = createMemoryModelConfigurationPort()
  await port.register({ profile: profile('model-a'), binding: binding('model-a'), actorId: 'owner' })
  const first = await port.assign({ use: 'specialist', profileKey: 'model-a', certificationEventId: 'cert-a', actorId: 'owner' })
  await port.release({ use: 'specialist', actorId: 'owner', expectedCurrentAssignmentId: first.assignmentId })
  const again = await port.assign({ use: 'specialist', profileKey: 'model-a', certificationEventId: 'cert-a', actorId: 'owner', expectedCurrentAssignmentId: null })
  assert.equal(again.status, 'active')
  const history = await port.assignmentHistory('specialist')
  assert.deepEqual(history.map(row => row.status), ['active', 'released'])
})

test('release is owner-confirmed, audited and wired through host, console and migration', () => {
  assert.match(route, /action === 'release'/)
  assert.match(route, /confirmRelease !== true/)
  assert.match(route, /platform_model_release_explicit_confirmation_required/)
  assert.match(route, /'assignment_released'/)
  assert.match(route, /routing: 'platform_default'/)
  assert.match(hostSource, /rpc\('platform_release_model_assignment'/)
  assert.match(consoleSource, /action:'release'/)
  assert.match(consoleSource, /confirmRelease:true/)
  for (const key of ['release:', 'confirmRelease:', 'released:']) {
    assert.equal(consoleSource.split(key).length - 1 >= 5, true, `${key} must exist in all five locales`)
  }
  assert.match(migration, /create or replace function public\.platform_release_model_assignment/)
  assert.match(migration, /'active','superseded','rolled_back','released'/)
  assert.match(migration, /grant execute on function public\.platform_release_model_assignment\(text,text,uuid\) to service_role/)
  assert.match(gate, /modelAssignmentRelease\.node\.test\.ts/)
})

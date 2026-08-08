import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('COS can self-bootstrap a missing durable mission store', async () => {
  const source = await readFile(new URL('../lib/ai/cos/autonomy/missionStoreBootstrap.ts', import.meta.url), 'utf8')
  assert.match(source, /hub_exec_sql/)
  assert.match(source, /create table if not exists public\.cos_autonomy_state/)
  assert.match(source, /notify pgrst, 'reload schema'/)
  assert.match(source, /for \(let attempt = 0; attempt < 4;/)
})

test('owner engineering routing repairs persistence before mission creation', async () => {
  const source = await readFile(new URL('../app/api/support/route.ts', import.meta.url), 'utf8')
  const ensure = source.indexOf('ensureCosMissionStore()')
  const create = source.indexOf('createOwnerEngineeringMission({')
  assert.ok(ensure >= 0)
  assert.ok(create > ensure)
  assert.match(source, /Fall through to the existing/)
  assert.doesNotMatch(source, /No code was changed\./)
})

test('background engineering worker also self-recovers mission persistence', async () => {
  const source = await readFile(new URL('../app/api/cron/cos-engineering-missions/route.ts', import.meta.url), 'utf8')
  const ensure = source.indexOf('ensureCosMissionStore()')
  const list = source.indexOf('listActiveOwnerEngineeringMissions(4)')
  assert.ok(ensure >= 0)
  assert.ok(list > ensure)
  assert.match(source, /missionStoreRepaired/)
})

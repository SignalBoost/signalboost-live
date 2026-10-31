// saas/tests/cosDurableReplayAdmission.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

test('COS browser client sends one stable logical request identifier', () => {
  const client = source('lib/ai/cos/agentProgressClient.ts')
  assert.match(client, /clientTurnId: crypto\.randomUUID\(\)/)
  assert.match(client, /body: JSON\.stringify\(requestBody\)/)
  assert.match(client, /const requestBody = builderRequest\?\.body \?\?/)
})

test('COS ingress reuses supplied UUID and schedules only newly admitted tasks', () => {
  const route = source('app/api/cos-provenance-browser/route.ts')
  assert.match(route, /UUID\.test\(submittedTurnId\)/)
  assert.match(route, /const \{ historyMessageId, admittedNew \} = await enqueueDurableCosTurn/)
  assert.match(route, /if \(admittedNew\) after\(async \(\) => \{/)
})

test('COS durable admission requires an atomic replay receipt', () => {
  const client = source('lib/ai/cos/durableCosTurn.ts')
  assert.match(client, /db\.rpc\('admit_cos_customer_task_once'/)
  assert.match(client, /admitted\?\.historyMessageId/)
  assert.match(client, /typeof admitted\?\.admittedNew !== 'boolean'/)
})

test('database serializes by task ID and refuses owner, conversation or objective mutation on replay', () => {
  const migration = source('supabase/migrations/20261030233000_cos_task_single_dispatch_admission.sql')
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\(p_task_id::text, 0\)\)/)
  assert.match(migration, /v_existing\.user_id <> p_user_id/)
  assert.match(migration, /v_existing\.conversation_id <> p_conversation_id/)
  assert.match(migration, /v_existing\.objective <> btrim/)
  assert.match(migration, /'admittedNew',false/)
  assert.match(migration, /'admittedNew',true/)
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.admit_cos_customer_task_once/)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.admit_cos_customer_task_once[\s\S]*TO service_role/)
})

test.todo('staging E2E: replay same clientTurnId concurrently creates one task and one worker-side external action')

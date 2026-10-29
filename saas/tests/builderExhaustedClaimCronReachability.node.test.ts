import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const cron = readFileSync(new URL('../app/api/cron/builder-continuations/route.ts', import.meta.url), 'utf8')
test('cron scans exhausted checkpoints for expiration while leaving resumable claims to requeue', () => {
  const recovery = cron.indexOf("db.rpc('requeue_stale_builder_claims'")
  const scan = cron.indexOf("const { data: stranded")
  const expiry = cron.indexOf("db.rpc('expire_stale_builder_jobs'")
  assert.ok(recovery >= 0 && scan > recovery && expiry > scan)
  const block = cron.slice(scan, expiry)
  assert.match(block, /\.select\('id,user_id,last_heartbeat_at,updated_at,checkpoint,job_kind,claim_generation,metadata'\)/)
  assert.doesNotMatch(block, /\.is\('checkpoint', null\)/)
  assert.match(block, /stuck\.claim_generation < 24/)
  assert.match(block, /attempts < 3/)
  assert.match(block, /if \(recoverable\) continue/)
  assert.match(block, /last_heartbeat_at/)
})

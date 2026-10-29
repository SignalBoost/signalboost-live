import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('system-wide stale sweep reuses fenced per-owner completion and is bounded', () => {
  const source = readFileSync(new URL('../lib/ai/cos/durableCosTurn.ts', import.meta.url), 'utf8')
  const scan = source.slice(source.indexOf('export async function expireStaleDurableCosTurnsSystemWide'))
  assert.match(scan, /\.eq\('provenance->>status', 'running'\)/)
  assert.match(scan, /\.lt\('created_at', cutoff\)/)
  assert.match(scan, /\.limit\(100\)/)
  assert.match(scan, /expireStaleDurableCosTurns\(\{ userId \}\)/)
  assert.match(source, /db\.rpc\('finish_cos_customer_task'/)
})
test('stale sweep endpoint requires cron secret and is scheduled', () => {
  const route = readFileSync(new URL('../app/api/cron/cos-stale-turn-cleanup/route.ts', import.meta.url), 'utf8')
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
  assert.match(route, /process\.env\.CRON_SECRET/)
  assert.match(route, /status: 401/)
  assert.ok(config.crons.some((item: { path: string }) => item.path === '/api/cron/cos-stale-turn-cleanup'))
})

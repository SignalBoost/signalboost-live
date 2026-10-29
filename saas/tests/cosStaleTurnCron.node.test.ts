import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('stale-turn sweep is scheduled and CRON_SECRET gated', () => {
  const config = JSON.parse(readFileSync('vercel.json', 'utf8'))
  assert.ok(config.crons.some((cron: { path: string; schedule: string }) =>
    cron.path === '/api/cron/cos-stale-turns' && cron.schedule === '*/5 * * * *'))
  const route = readFileSync('app/api/cron/cos-stale-turns/route.ts', 'utf8')
  assert.match(route, /req\.headers\.get\('authorization'\) !== `Bearer \$\{secret\}`/)
  assert.match(route, /expireStaleDurableCosTurnsSystemWide\(\)/)
})

test('system-wide sweep reconciles through fenced existing customer task finish', () => {
  const source = readFileSync('lib/ai/cos/durableCosTurn.ts', 'utf8')
  const sweep = source.slice(source.indexOf('export async function expireStaleDurableCosTurnsSystemWide'))
  assert.match(sweep, /expireStaleDurableCosTurns\(\{ userId \}\)/)
  assert.match(source, /db\.rpc\('finish_cos_customer_task'/)
  assert.match(source, /\.eq\('provenance->>status', 'running'\)/)
})

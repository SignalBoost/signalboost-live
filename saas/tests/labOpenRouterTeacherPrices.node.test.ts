// saas/tests/labOpenRouterTeacherPrices.node.test.ts
// OpenRouter live teacher prices: parsing rules, unit conversion (always rounded up), the price ceiling sent with every
// OpenRouter teacher call, and the shape of the service-role-only sync function.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseOpenRouterPrices, perMillionUp, OPENROUTER_MIN_PRICED_MODELS } from '../lib/lab/openRouterTeacherPrices.ts'
import { generateWithUniversityTeacher } from '../lib/ai/cos/cosUniversityTeacherAdapters.ts'
import { customerTeacherDefinition, CUSTOMER_TEACHER_CREDENTIAL_ENV } from '../lib/ai/cos/labCustomerProviderCatalog.ts'

const text = { input_modalities: ['text'], output_modalities: ['text'] }

test('USD per token becomes USD per 1M tokens, rounded up, without float noise', () => {
  assert.equal(perMillionUp(0.000003), 3)
  assert.equal(perMillionUp(0.0000000375), 0.0375)
  assert.equal(perMillionUp(0.00000000000015), 0.000001) // below the stored precision: rounds UP, never to zero
})

test('only plain per-token text models are priced', () => {
  const prices = parseOpenRouterPrices({ data: [
    { id: 'vendor/plain', pricing: { prompt: '0.000003', completion: '0.000015', request: '0' }, architecture: text },
    { id: 'vendor/free', pricing: { prompt: '0', completion: '0' }, architecture: text },
    { id: 'openrouter/auto', pricing: { prompt: '-1', completion: '-1' }, architecture: text },
    { id: 'vendor/per-request', pricing: { prompt: '0.000001', completion: '0.000002', request: '0.01' }, architecture: text },
    { id: 'vendor/overrides', pricing: { prompt: '0.000001', completion: '0.000002', overrides: [{ prompt: '0.000005' }] }, architecture: text },
    { id: 'vendor/dear-reasoning', pricing: { prompt: '0.000001', completion: '0.000002', internal_reasoning: '0.00001' }, architecture: text },
    { id: 'vendor/premium-cache-write', pricing: { prompt: '0.000003', completion: '0.000015', input_cache_write: '0.00000375' }, architecture: text },
    { id: 'vendor/cheap-cache', pricing: { prompt: '0.000001', completion: '0.000002', input_cache_read: '0.0000001', input_cache_write: '0.000001' }, architecture: text },
    { id: 'vendor/image-out', pricing: { prompt: '0.000001', completion: '0.000002' }, architecture: { input_modalities: ['text'], output_modalities: ['image'] } },
    { id: 'bad id with spaces', pricing: { prompt: '0.000001', completion: '0.000002' } },
    { id: 'vendor/garbage', pricing: { prompt: 'abc', completion: '0.000002' } },
    { id: 'vendor/plain', pricing: { prompt: '0.000003', completion: '0.000015' }, architecture: text },
  ] })
  assert.deepEqual(prices, [{ model: 'vendor/cheap-cache', input: 1, output: 2 }, { model: 'vendor/plain', input: 3, output: 15 }])
})

test('a broken response yields nothing, and the sync refuses short lists', () => {
  assert.deepEqual(parseOpenRouterPrices(null), [])
  assert.deepEqual(parseOpenRouterPrices({ data: 'x' }), [])
  assert.equal(OPENROUTER_MIN_PRICED_MODELS, 20)
  const sql = readFileSync(new URL('../supabase/migrations/20261012070000_lab_teacher_price_sync.sql', import.meta.url), 'utf8')
  assert.match(sql, /jsonb_array_length\(p_rows\) < 20/)
  assert.match(sql, /is distinct from 'openrouter'/)
  assert.match(sql, /revoke all on function public\.itmounts_lab_platform_sync_teacher_rate_cards\(text, text, jsonb\) from public, anon, authenticated;/)
  assert.match(sql, /grant execute on function public\.itmounts_lab_platform_sync_teacher_rate_cards\(text, text, jsonb\) to service_role;/)
})

test('every OpenRouter teacher call carries the price ceiling; other providers never get it', async () => {
  const bodies: Record<string, any> = {}
  for (const kind of ['openrouter', 'groq']) {
    await generateWithUniversityTeacher({
      teacher: customerTeacherDefinition({ kind, model: 'vendor/plain', endpoint: null }) as any,
      env: { [CUSTOMER_TEACHER_CREDENTIAL_ENV]: 'sk-or-123456789012345678901234567890' },
      request: { system: 's', prompt: 'p', maxOutputTokens: 100, maxPriceUsdPerMTok: { input: 3, output: 15 } },
      fetchImpl: async (_url, init) => {
        bodies[kind] = JSON.parse(String(init?.body || '{}'))
        return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 3, completion_tokens: 1 } }), { status: 200 })
      },
    })
  }
  assert.deepEqual(bodies.openrouter.provider, { max_price: { prompt: 3, completion: 15 } })
  assert.equal(bodies.groq.provider, undefined)
})

test('the shared sync hands parsed prices to the service-role function, and refuses a short or failed sync', async () => {
  const { syncOpenRouterTeacherPrices } = await import('../lib/lab/openRouterTeacherPrices.ts')
  const text = { input_modalities: ['text'], output_modalities: ['text'] }
  const payload = { data: Array.from({ length: 25 }, (_, i) => ({ id: `vendor/m${i}`, pricing: { prompt: '0.000001', completion: '0.000002' }, architecture: text })) }
  const calls: any[] = []
  const ok = await syncOpenRouterTeacherPrices(payload, async (fn, args) => { calls.push([fn, args]); return { data: { added: 25 }, error: null } })
  assert.deepEqual(ok, { ok: true, priced: 25, result: { added: 25 } })
  assert.equal(calls[0][0], 'itmounts_lab_platform_sync_teacher_rate_cards')
  assert.equal(calls[0][1].p_provider_kind, 'openrouter')
  assert.equal(calls[0][1].p_source_url, 'https://openrouter.ai/api/v1/models')
  assert.deepEqual(calls[0][1].p_rows[0], { model: 'vendor/m0', input: 1, output: 2 })
  const short = await syncOpenRouterTeacherPrices({ data: payload.data.slice(0, 5) }, async () => { throw new Error('must not be called') })
  assert.deepEqual(short, { ok: false, error: 'lab_price_sync_rows_insufficient', priced: 5 })
  const failed = await syncOpenRouterTeacherPrices(payload, async () => ({ data: null, error: { message: 'x' } }))
  assert.deepEqual(failed, { ok: false, error: 'lab_price_sync_failed', priced: 25 })
})

test('the model list and the hourly job sync OpenRouter prices through one lease, once an hour, without blocking the list', () => {
  const route = readFileSync(new URL('../app/api/lab/teacher-models/route.ts', import.meta.url), 'utf8')
  assert.match(route, /if \(provider === 'openrouter'\) await refreshOpenRouterPrices\(payload\)/)
  assert.match(route, /syncOpenRouterPricesWithLease\(payload, 'lab-teacher-models'\)/)
  // The priced flags are read after the sync, so the first viewer already sees the prices.
  assert.ok(route.indexOf('refreshOpenRouterPrices(payload)') < route.indexOf("rpc('itmounts_lab_customer_priced_teacher_models'"))
  const cron = readFileSync(new URL('../app/api/cron/lab-teacher-prices/route.ts', import.meta.url), 'utf8')
  // Both callers go through one lease, so the hourly job and the model list can never sync at the same time.
  assert.match(cron, /syncOpenRouterPricesWithLease\(payload, 'lab-teacher-prices-cron'\)/)
  const lease = readFileSync(new URL('../lib/lab/openRouterPriceSyncLease.ts', import.meta.url), 'utf8')
  assert.match(lease, /PRICE_LEASE = 'lab_openrouter_prices'/)
  assert.match(lease, /PRICE_SYNC_COOLDOWN_SECONDS = Object\.freeze\(\{ ok: 3600, error: 300 \}\)/)
  assert.match(lease, /if \(!\(await port\.claim\(/)
})

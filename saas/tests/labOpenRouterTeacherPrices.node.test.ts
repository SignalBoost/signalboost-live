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
    { id: 'vendor/image-out', pricing: { prompt: '0.000001', completion: '0.000002' }, architecture: { input_modalities: ['text'], output_modalities: ['image'] } },
    { id: 'bad id with spaces', pricing: { prompt: '0.000001', completion: '0.000002' } },
    { id: 'vendor/garbage', pricing: { prompt: 'abc', completion: '0.000002' } },
    { id: 'vendor/plain', pricing: { prompt: '0.000003', completion: '0.000015' }, architecture: text },
  ] })
  assert.deepEqual(prices, [{ model: 'vendor/plain', input: 3, output: 15 }])
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

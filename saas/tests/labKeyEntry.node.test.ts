// saas/tests/labKeyEntry.node.test.ts
// One-paste key entry: cleaning, provider detection, automatic naming, and the live provider check (fake HTTP only).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { autoKeyLabel, checkProviderKey, cleanPastedKey, detectProviderFromKey } from '../lib/lab/labKeyEntry.ts'
import { LAB_PROVIDER_CATALOG } from '../lib/ai/cos/labCustomerProviderCatalog.ts'

test('pasted keys lose surrounding whitespace, quotes, line breaks and a Bearer prefix', () => {
  assert.equal(cleanPastedKey('  "hf_abc123"\n'), 'hf_abc123')
  assert.equal(cleanPastedKey('Bearer sk-or-v1-xyz'), 'sk-or-v1-xyz')
  assert.equal(cleanPastedKey("'gsk_a b\tc'"), 'gsk_abc')
  assert.equal(cleanPastedKey(undefined), '')
})

test('provider is detected only from unambiguous prefixes, and every detected kind exists in the catalog', () => {
  const cases: Array<[string, string | null]> = [
    ['hf_x', 'huggingface'], ['sk-ant-api03-x', 'anthropic'], ['sk-or-v1-x', 'openrouter'], ['gsk_x', 'groq'],
    ['xai-x', 'xai'], ['AIzaSyx', 'gemini'], ['fw_x', 'fireworks'], ['sk-proj-x', null], ['sk-x', null], ['random', null],
  ]
  for (const [key, kind] of cases) assert.equal(detectProviderFromKey(key), kind, key)
  for (const [key] of cases) { const kind = detectProviderFromKey(key); if (kind) assert.ok(LAB_PROVIDER_CATALOG.some(p => p.kind === kind)) }
})

test('keys are named automatically with the provider and only the last four characters', () => {
  assert.equal(autoKeyLabel('Together AI', 'tgp_v1_abcdefgh3f9a'), 'Together AI ··· 3f9a')
  assert.ok(!autoKeyLabel('Hugging Face', 'hf_secretsecret1234').includes('secret'))
})

const fake = (status: number, body = '') => async () => new Response(body, { status })
test('live check: only an explicit provider refusal rejects a key; anything uncertain still saves', async () => {
  assert.equal(await checkProviderKey({ kind: 'together', key: 'k', fetcher: fake(401) }), 'rejected')
  assert.equal(await checkProviderKey({ kind: 'openai', key: 'k', fetcher: fake(403) }), 'rejected')
  assert.equal(await checkProviderKey({ kind: 'gemini', key: 'k', fetcher: fake(400, '{"error":{"details":[{"reason":"API_KEY_INVALID"}]}}') }), 'rejected')
  assert.equal(await checkProviderKey({ kind: 'gemini', key: 'k', fetcher: fake(400, 'other') }), 'unverified')
  assert.equal(await checkProviderKey({ kind: 'huggingface', key: 'k', fetcher: fake(200, '{}') }), 'valid')
  assert.equal(await checkProviderKey({ kind: 'deepinfra', key: 'k', fetcher: fake(404) }), 'unverified')
  assert.equal(await checkProviderKey({ kind: 'mistral', key: 'k', fetcher: fake(503) }), 'unverified')
  assert.equal(await checkProviderKey({ kind: 'groq', key: 'k', fetcher: async () => { throw new Error('down') } }), 'unverified')
  assert.equal(await checkProviderKey({ kind: 'openai_compatible', key: 'k', modelsUrl: null, fetcher: fake(401) }), 'unverified')
  assert.equal(await checkProviderKey({ kind: 'openai_compatible', key: 'k', modelsUrl: 'https://x.example/v1/models', fetcher: fake(401) }), 'rejected')
})

test('every catalog provider has a check, and the key goes only in the auth header', async () => {
  for (const p of LAB_PROVIDER_CATALOG) {
    if (p.kind === 'openai_compatible') continue
    let seen: { url: string; headers: Record<string, string> } | null = null
    await checkProviderKey({ kind: p.kind, key: 'SECRET', fetcher: async (url, init) => { seen = { url, headers: init?.headers as Record<string, string> }; return new Response('{}', { status: 200 }) } })
    assert.ok(seen, p.kind)
    assert.ok(seen!.url.startsWith('https://') && !seen!.url.includes('SECRET'), p.kind)
    assert.ok(Object.values(seen!.headers).some(v => v.includes('SECRET')), p.kind)
  }
})

test('the save route cleans, checks before storing, refuses rejected keys and names keys itself', () => {
  const route = readFileSync(new URL('../app/api/lab/providers/route.ts', import.meta.url), 'utf8')
  assert.match(route, /const secret = cleanPastedKey\(body\?\.secret\)/)
  assert.match(route, /autoKeyLabel\(entry\.name, secret\)/)
  assert.ok(route.indexOf("if (check === 'rejected')") < route.indexOf('sealCustomerCredential({'))
  assert.ok(route.indexOf('itmounts_lab_customer_list_credentials') < route.indexOf('checkProviderKey('))
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { verifyReferenceConditionedPeopleImage } from '../lib/visuals/personImageVerification.ts'

function fakeReference(canonicalName: string, fill: number) {
  return {
    canonicalName,
    b64: Buffer.alloc(96, fill).toString('base64'),
    mime: 'image/jpeg' as const,
    title: `${canonicalName} portrait.jpg`,
    provider: 'wikimedia-commons' as const,
    sourcePageUrl: 'https://commons.wikimedia.org/wiki/File:portrait.jpg',
    assetUrl: 'https://upload.wikimedia.org/wikipedia/commons/portrait.jpg',
  }
}

const lulaReference = fakeReference('Luiz Inácio Lula da Silva', 7)
const trumpReference = fakeReference('Donald Trump', 11)

function completion(content: Record<string, unknown>, status = 200): Response {
  if (status !== 200) return new Response('temporary failure', { status })
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

test('the 32B verifier is primary and a valid rejection is never overruled', { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch
  const oldKey = process.env.LOCAL_AI_API_KEY
  const oldBase = process.env.LOCAL_AI_BASE_URL
  const models: string[] = []

  process.env.LOCAL_AI_API_KEY = 'test-key'
  process.env.LOCAL_AI_BASE_URL = 'https://api.deepinfra.com/v1/openai'
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body || '{}'))
    models.push(body.model)
    return completion({
      pass: false,
      principal_people: 2,
      reference_matches: [false, true],
      duplicate_or_substitution: false,
      reason_codes: ['identity_reference_mismatch'],
    })
  }) as typeof fetch

  try {
    const result = await verifyReferenceConditionedPeopleImage({
      generated: { b64: Buffer.alloc(128, 19).toString('base64'), mime: 'image/jpeg' },
      references: [lulaReference, trumpReference],
    })
    assert.equal(result.ok, false)
    assert.deepEqual(models, ['Qwen/Qwen2.5-VL-32B-Instruct'])
    assert.deepEqual(result.reasonCodes, ['identity_reference_mismatch'])
  } finally {
    globalThis.fetch = originalFetch
    if (oldKey === undefined) delete process.env.LOCAL_AI_API_KEY
    else process.env.LOCAL_AI_API_KEY = oldKey
    if (oldBase === undefined) delete process.env.LOCAL_AI_BASE_URL
    else process.env.LOCAL_AI_BASE_URL = oldBase
  }
})

test('the 7B verifier is used only after a technical primary failure', { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch
  const oldKey = process.env.LOCAL_AI_API_KEY
  const oldBase = process.env.LOCAL_AI_BASE_URL
  const models: string[] = []

  process.env.LOCAL_AI_API_KEY = 'test-key'
  process.env.LOCAL_AI_BASE_URL = 'https://api.deepinfra.com/v1/openai'
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body || '{}'))
    models.push(body.model)
    if (models.length === 1) return completion({}, 503)
    return completion({
      pass: true,
      principal_people: 2,
      reference_matches: [true, true],
      duplicate_or_substitution: false,
      reason_codes: [],
    })
  }) as typeof fetch

  try {
    const result = await verifyReferenceConditionedPeopleImage({
      generated: { b64: Buffer.alloc(128, 23).toString('base64'), mime: 'image/jpeg' },
      references: [lulaReference, trumpReference],
    })
    assert.equal(result.ok, true)
    assert.deepEqual(models, [
      'Qwen/Qwen2.5-VL-32B-Instruct',
      'Qwen/Qwen2.5-VL-7B-Instruct',
    ])
  } finally {
    globalThis.fetch = originalFetch
    if (oldKey === undefined) delete process.env.LOCAL_AI_API_KEY
    else process.env.LOCAL_AI_API_KEY = oldKey
    if (oldBase === undefined) delete process.env.LOCAL_AI_BASE_URL
    else process.env.LOCAL_AI_BASE_URL = oldBase
  }
})

test('named-person generation uses FLUX.2 Max and never falls through to a single-image edit path', () => {
  const generation = readFileSync(new URL('../lib/visuals/referenceImageGeneration.ts', import.meta.url), 'utf8')
  const verification = readFileSync(new URL('../lib/visuals/personImageVerification.ts', import.meta.url), 'utf8')

  assert.match(generation, /black-forest-labs\/FLUX-2-max/)
  assert.match(generation, /const OUTPUT_TIMEOUT_MS = 50_000/)
  assert.match(generation, /Show exactly .* dominant foreground/)
  assert.match(generation, /no other visible human faces/)
  assert.match(generation, /Never duplicate, merge, average, swap, substitute, omit, or invent/)
  assert.doesNotMatch(generation, /\/v1\/images\/edits/)
  assert.match(generation, /There is no[\s\S]*text-only identity fallback/i)

  assert.match(verification, /PRIMARY_VISION_MODEL = 'Qwen\/Qwen2\.5-VL-32B-Instruct'/)
  assert.match(verification, /expectedPassExample\(referenceCount/)
  assert.match(verification, /if \(primary\.ok \|\| !isTechnicalFailure\(primary\)\) return primary/)
})

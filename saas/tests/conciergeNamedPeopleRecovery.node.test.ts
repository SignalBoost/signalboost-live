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

test('a strict 32B adjudicator can recover a false rejection without weakening the identity schema', { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch
  const oldKey = process.env.LOCAL_AI_API_KEY
  const oldBase = process.env.LOCAL_AI_BASE_URL
  const models: string[] = []

  process.env.LOCAL_AI_API_KEY = 'test-key'
  process.env.LOCAL_AI_BASE_URL = 'https://api.deepinfra.com/v1/openai'
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body || '{}'))
    models.push(body.model)
    const pass = models.length === 2
    const content = JSON.stringify({
      pass,
      principal_people: 2,
      reference_matches: pass ? [true, true] : [false, true],
      duplicate_or_substitution: false,
      reason_codes: pass ? [] : ['identity_reference_mismatch'],
    })
    if (models.length === 2) {
      assert.match(body.messages[0].content.at(-1).text, /final strict visual identity adjudicator/)
    }
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch

  try {
    const result = await verifyReferenceConditionedPeopleImage({
      generated: { b64: Buffer.alloc(128, 19).toString('base64'), mime: 'image/jpeg' },
      references: [lulaReference, trumpReference],
    })
    assert.equal(result.ok, true)
    assert.deepEqual(models, [
      'Qwen/Qwen2.5-VL-7B-Instruct',
      'Qwen/Qwen2.5-VL-32B-Instruct',
    ])
  } finally {
    globalThis.fetch = originalFetch
    if (oldKey === undefined) delete process.env.LOCAL_AI_API_KEY
    else process.env.LOCAL_AI_API_KEY = oldKey
    if (oldBase === undefined) delete process.env.LOCAL_AI_BASE_URL
    else process.env.LOCAL_AI_BASE_URL = oldBase
  }
})

test('multi-person generation remains on the native multi-reference path and simplifies the scene', () => {
  const generation = readFileSync(new URL('../lib/visuals/referenceImageGeneration.ts', import.meta.url), 'utf8')
  const verification = readFileSync(new URL('../lib/visuals/personImageVerification.ts', import.meta.url), 'utf8')

  assert.match(generation, /const OUTPUT_TIMEOUT_MS = 45_000/)
  assert.match(generation, /Show exactly .* dominant foreground people and no other visible human faces/)
  assert.match(generation, /clean, uncluttered background with no crowd, bystanders, portraits, posters, screens, statues, mirrors, or reflections/)
  assert.match(generation, /if \(references\.length > 1\) return native/)
  assert.match(generation, /OpenAI-compatible edit endpoint documents only a single/)

  assert.match(verification, /Qwen\/Qwen2\.5-VL-32B-Instruct/)
  assert.match(verification, /Principal people means the dominant foreground subjects/)
  assert.match(verification, /A rejected or technically uncertain 7B decision receives one stricter 32B adjudication/)
})

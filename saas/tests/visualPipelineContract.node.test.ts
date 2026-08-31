import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { classifyVisualRequest } from '../lib/visuals/requestClassifier.ts'
import {
  UserReferenceImageError,
  hasUserReferenceImage,
  readUserReferenceImage,
} from '../lib/visuals/userReference.ts'
import { generateReferenceEditedImage } from '../lib/visuals/referenceImageGeneration.ts'
import { verifyGeneratedVisualOutput } from '../lib/visuals/visualOutputVerification.ts'

const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQMcAAAAASUVORK5CYII='
const PNG_DATA_URL = `data:image/png;base64,${PNG_B64}`

const LULA_TRUMP = 'faca uma imagem do Luiz Inácio Lula da Silva, e do President Trump walking next to each other'

test('classifier covers every required visual request type without catching ordinary text edits', () => {
  assert.equal(
    classifyVisualRequest({ objective: 'Sketch two kids playing with a dog in the rain.' })?.requestType,
    'generic-scene',
  )
  assert.equal(
    classifyVisualRequest({ objective: 'create a image of President Trump' })?.requestType,
    'named-person',
  )
  assert.deepEqual(
    classifyVisualRequest({ objective: LULA_TRUMP })?.referencePeople,
    ['Luiz Inácio Lula da Silva', 'Donald Trump'],
  )
  assert.equal(classifyVisualRequest({ objective: LULA_TRUMP })?.requestType, 'multiple-named-people')
  assert.equal(
    classifyVisualRequest({ objective: 'desenhe o distintivo do time do palmeiras' })?.requestType,
    'official-mark',
  )
  assert.equal(
    classifyVisualRequest({ objective: 'Remove the background from this photo.', hasUserReferenceImage: true })?.requestType,
    'user-reference-edit',
  )
  assert.equal(
    classifyVisualRequest({ objective: 'Edite esta imagem e deixe o céu mais claro.' })?.requestType,
    'user-reference-edit',
  )
  assert.equal(
    classifyVisualRequest({ objective: 'Make this photo brighter.', hasUserReferenceImage: true })?.requestType,
    'user-reference-edit',
  )
  assert.equal(
    classifyVisualRequest({ objective: 'Make this photo brighter.' })?.requiresUserReferenceImage,
    true,
  )
  assert.equal(classifyVisualRequest({ objective: 'What do you think of this photo?' }), null)
  assert.equal(classifyVisualRequest({ objective: 'edit Dwight, thank you for letting me know' }), null)
  assert.equal(classifyVisualRequest({ objective: 'change the current policy' }), null)
})

test('user reference parser accepts bounded PNG/JPEG/WebP data URLs and never fetches remote images', () => {
  const body = {
    attachments: [{ name: 'source.png', mimeType: 'image/png', size: 68, dataUrl: PNG_DATA_URL }],
  }
  assert.equal(hasUserReferenceImage(body), true)
  assert.deepEqual(readUserReferenceImage(body), {
    name: 'source.png',
    b64: PNG_B64,
    mime: 'image/png',
    size: Buffer.from(PNG_B64, 'base64').byteLength,
    source: 'attachment',
  })

  assert.throws(
    () => readUserReferenceImage({ attachments: [{ name: 'remote.png', type: 'image/png', dataUrl: 'https://example.com/remote.png' }] }),
    (error: unknown) => error instanceof UserReferenceImageError && error.code === 'visual_reference_image_invalid',
  )
  assert.throws(
    () => readUserReferenceImage({ attachments: [{ name: 'source.gif', type: 'image/gif', dataUrl: 'data:image/gif;base64,R0lGODlhAQABAIAAAAUEBA==' }] }),
    (error: unknown) => error instanceof UserReferenceImageError && error.code === 'visual_reference_image_type_unsupported',
  )
  assert.throws(
    () => readUserReferenceImage({}),
    (error: unknown) => error instanceof UserReferenceImageError && error.code === 'visual_reference_image_required',
  )
})

test('user reference edits use one FLUX.2 Max input image with strict preservation constraints', { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch
  const oldKey = process.env.LOCAL_AI_API_KEY
  const oldBase = process.env.LOCAL_AI_BASE_URL
  let requestBody: Record<string, unknown> = {}

  process.env.LOCAL_AI_API_KEY = 'test-key'
  process.env.LOCAL_AI_BASE_URL = 'https://api.deepinfra.com/v1/openai'
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    assert.match(String(input), /\/v1\/inference\/black-forest-labs\/FLUX-2-max$/)
    requestBody = JSON.parse(String(init?.body || '{}'))
    return new Response(JSON.stringify({ images: [PNG_DATA_URL] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch

  try {
    const result = await generateReferenceEditedImage({
      prompt: 'Remove the background.',
      reference: {
        name: 'source.png',
        b64: PNG_B64,
        mime: 'image/png',
        size: Buffer.from(PNG_B64, 'base64').byteLength,
        source: 'attachment',
      },
      size: '1024x1024',
    })
    assert.equal(result.ok, true)
    assert.equal(result.mime, 'image/png')
    assert.equal(requestBody.input_image, PNG_B64)
    assert.equal('input_image_2' in requestBody, false)
    assert.equal(requestBody.width, 1024)
    assert.equal(requestBody.height, 1024)
    assert.match(String(requestBody.prompt), /Apply only the requested edit/)
    assert.match(String(requestBody.prompt), /Never substitute, duplicate, clone, merge, omit, or invent/)
  } finally {
    globalThis.fetch = originalFetch
    if (oldKey === undefined) delete process.env.LOCAL_AI_API_KEY
    else process.env.LOCAL_AI_API_KEY = oldKey
    if (oldBase === undefined) delete process.env.LOCAL_AI_BASE_URL
    else process.env.LOCAL_AI_BASE_URL = oldBase
  }
})

test('generic and reference-edit outputs are vision-verified against the exact request and source image', { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch
  const oldKey = process.env.LOCAL_AI_API_KEY
  const oldBase = process.env.LOCAL_AI_BASE_URL
  let requestBody: any = null

  process.env.LOCAL_AI_API_KEY = 'test-key'
  process.env.LOCAL_AI_BASE_URL = 'https://api.deepinfra.com/v1/openai'
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    requestBody = JSON.parse(String(init?.body || '{}'))
    return new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            pass: true,
            requested_content_present: true,
            explicit_count_correct: true,
            no_unrequested_principal_people: true,
            reference_preserved: true,
            requested_edit_applied: true,
            reason_codes: [],
          }),
        },
      }],
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch

  try {
    const result = await verifyGeneratedVisualOutput({
      objective: 'Remove the background from this photo.',
      generated: { b64: PNG_B64, mime: 'image/png' },
      reference: {
        name: 'source.png',
        b64: PNG_B64,
        mime: 'image/png',
        size: Buffer.from(PNG_B64, 'base64').byteLength,
        source: 'attachment',
      },
    })
    assert.equal(result.ok, true)
    assert.equal(requestBody.model, 'Qwen/Qwen2.5-VL-32B-Instruct')
    assert.equal(requestBody.messages[0].content.filter((item: any) => item.type === 'image_url').length, 2)
    const prompt = requestBody.messages[0].content.at(-1).text
    assert.match(prompt, /requested edit is visibly applied/)
    assert.match(prompt, /Reject substitutions or unrelated additions/)
  } finally {
    globalThis.fetch = originalFetch
    if (oldKey === undefined) delete process.env.LOCAL_AI_API_KEY
    else process.env.LOCAL_AI_API_KEY = oldKey
    if (oldBase === undefined) delete process.env.LOCAL_AI_BASE_URL
    else process.env.LOCAL_AI_BASE_URL = oldBase
  }
})

test('all live chat ingresses preserve attachments and render the stable preview inline', () => {
  const browser = readFileSync(new URL('../app/api/cos-browser/route.ts', import.meta.url), 'utf8')
  const specialist = readFileSync(new URL('../app/api/cos-specialist/route.ts', import.meta.url), 'utf8')

  for (const source of [browser, specialist]) {
    assert.match(source, /classifyVisualRequest\(/)
    assert.match(source, /hasUserReferenceImage\(body\)/)
    assert.match(source, /JSON\.stringify\(\{ \.\.\.body, objective: prompt \}\)/)
    assert.match(source, /visualPost\(visualRequest\)/)
    assert.match(source, /previewUrl/)
    assert.match(source, /<IMAGE>\$\{previewUrl\}<\/IMAGE>/)
  }
  assert.match(browser, /appendPreviewToReply/)
  assert.match(browser, /cosMode === 'silent_background_planning'/)
  assert.match(specialist, /reply: `\$\{payload\.reply\}\\n\\n<IMAGE>\$\{previewUrl\}<\/IMAGE>`/)
  assert.ok(specialist.indexOf('classifyVisualRequest({') < specialist.indexOf('planCOSSpecialistFromText(prompt)'))
  assert.match(specialist, /export const maxDuration = 300/)
})

test('visual route retries once, reports exact failed entities, audits trace stages, and fails closed', () => {
  const route = readFileSync(new URL('../app/api/visuals/route.ts', import.meta.url), 'utf8')

  assert.match(route, /const MAX_GENERATION_ATTEMPTS = 2/)
  assert.match(route, /classifyVisualRequest\(/)
  assert.match(route, /readUserReferenceImage\(body\)/)
  assert.match(route, /verifyReferenceConditionedPeopleImage/)
  assert.match(route, /verifyGeneratedVisualOutput/)
  assert.match(route, /failed_entities: unresolvedPeople/)
  assert.match(route, /objectiveSha256/)
  assert.match(route, /classifier-decision/)
  assert.match(route, /reference-resolution/)
  assert.match(route, /generation-attempt/)
  assert.match(route, /verification-attempt/)
  assert.match(route, /final-decision/)
  assert.match(route, /trace_id: traceId/)
  assert.match(route, /output_verification_passed: true/)
  assert.doesNotMatch(route, /objective:\s*objective[,}]/)
})

test('the complete visual pipeline contract is mandatory in the Vercel gate', () => {
  const gate = readFileSync(new URL('../scripts/vercel-cos-gates.mjs', import.meta.url), 'utf8')
  assert.match(gate, /tests\/visualPipelineContract\.node\.test\.ts/)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { detectConciergeVisualIntent, extractNamedPeople, isConciergeVisualObjective } from '../lib/visuals/intent.ts'
import { selectCommonsCandidate } from '../lib/visuals/referenceAssets.ts'
import {
  clearVerifiedPersonReferenceCacheForTests,
  resolveVerifiedPersonReference,
  selectCommonsPersonCandidate,
} from '../lib/visuals/personReferences.ts'
import { generateReferenceConditionedImage } from '../lib/visuals/referenceImageGeneration.ts'
import { verifyReferenceConditionedPeopleImage } from '../lib/visuals/personImageVerification.ts'

const REQUEST_LULA_TRUMP = 'faca uma imagem do Luiz Inácio Lula da Silva, e do President Trump walking next to each other'
const REQUEST_LULA_TRAILING_CONJUNCTION = 'faca uma imagem do Luiz Inácio Lula da Silva, e'
const REQUEST_TRUMP = 'create a image of President Trump'

function fakeJpegBytes(marker = 0): Uint8Array {
  const bytes = new Uint8Array(160)
  bytes.fill(marker)
  bytes[0] = 0xff
  bytes[1] = 0xd8
  bytes[2] = 0xff
  return bytes
}

function fakeJpegBase64(marker = 0): string {
  return Buffer.from(fakeJpegBytes(marker)).toString('base64')
}

const lulaReference = Object.freeze({
  canonicalName: 'Luiz Inácio Lula da Silva',
  b64: fakeJpegBase64(1),
  mime: 'image/jpeg' as const,
  title: 'Foto oficial de Luiz Inácio Lula da Silva (2023–2027).jpg',
  provider: 'wikimedia-commons' as const,
  sourcePageUrl: 'https://commons.wikimedia.org/wiki/File:Foto_oficial_de_Luiz_Inacio_Lula_da_Silva.jpg',
  assetUrl: 'https://upload.wikimedia.org/example-lula.jpg',
})

const trumpReference = Object.freeze({
  canonicalName: 'Donald Trump',
  b64: fakeJpegBase64(2),
  mime: 'image/jpeg' as const,
  title: 'January 2025 Official Presidential Portrait of Donald J. Trump.jpg',
  provider: 'wikimedia-commons' as const,
  sourcePageUrl: 'https://commons.wikimedia.org/wiki/File:January_2025_Official_Presidential_Portrait_of_Donald_J._Trump.jpg',
  assetUrl: 'https://upload.wikimedia.org/example-trump.jpg',
})

function verifierResponse(input: {
  pass: boolean
  principalPeople: number
  matches: boolean[]
  duplicate?: boolean
  reasons?: string[]
}, status = 200): Response {
  if (status !== 200) return new Response('temporary verifier failure', { status })
  return new Response(JSON.stringify({
    choices: [{
      message: {
        content: JSON.stringify({
          pass: input.pass,
          principal_people: input.principalPeople,
          reference_matches: input.matches,
          duplicate_or_substitution: input.duplicate === true,
          reason_codes: input.reasons || [],
        }),
      },
    }],
  }), { status: 200, headers: { 'content-type': 'application/json' } })
}

test('all three reported prompts route to the public-figure visual path with canonical identities', () => {
  for (const prompt of [REQUEST_LULA_TRUMP, REQUEST_LULA_TRAILING_CONJUNCTION, REQUEST_TRUMP]) {
    assert.equal(isConciergeVisualObjective(prompt), true, prompt)
  }

  assert.deepEqual(extractNamedPeople(REQUEST_LULA_TRUMP), ['Luiz Inácio Lula da Silva', 'Donald Trump'])
  assert.deepEqual(detectConciergeVisualIntent(REQUEST_LULA_TRUMP), {
    filename: 'luiz-inacio-lula-da-silva-donald-trump-illustration.png',
    mode: 'reference-people',
    referencePeople: ['Luiz Inácio Lula da Silva', 'Donald Trump'],
  })

  assert.deepEqual(extractNamedPeople(REQUEST_LULA_TRAILING_CONJUNCTION), ['Luiz Inácio Lula da Silva'])
  assert.deepEqual(detectConciergeVisualIntent(REQUEST_LULA_TRAILING_CONJUNCTION)?.referencePeople, ['Luiz Inácio Lula da Silva'])

  assert.deepEqual(extractNamedPeople(REQUEST_TRUMP), ['Donald Trump'])
  assert.deepEqual(detectConciergeVisualIntent(REQUEST_TRUMP)?.referencePeople, ['Donald Trump'])

  assert.equal(detectConciergeVisualIntent('Please sketch two kids playing with a dog in the rain.')?.mode, 'generate')
  assert.equal(detectConciergeVisualIntent('Create a fictional portrait of President Trump lookalike')?.mode, 'generate')
  assert.equal(isConciergeVisualObjective('Who is President Trump?'), false)
})

test('existing named marks use verified assets while original marks remain creative work', () => {
  assert.deepEqual(detectConciergeVisualIntent('desenhe o distintivo do time do palmeiras'), {
    filename: 'palmeiras-mark.png',
    mode: 'reference-mark',
    referenceQuery: 'palmeiras',
  })
  assert.equal(detectConciergeVisualIntent('Crie um distintivo original para meu time')?.mode, 'generate')
})

test('curated Trump reference resolves through the stable Wikimedia file redirect without search', { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch
  const calls: string[] = []
  clearVerifiedPersonReferenceCacheForTests()

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input)
    calls.push(url)
    if (url.startsWith('https://commons.wikimedia.org/wiki/Special:Redirect/file/')) {
      assert.match(decodeURIComponent(url), /January 2025 Official Presidential Portrait of Donald J\. Trump\.jpg/)
      return new Response(null, {
        status: 302,
        headers: { location: 'https://upload.wikimedia.org/wikipedia/commons/trump-portrait-768.jpg' },
      })
    }
    if (url === 'https://upload.wikimedia.org/wikipedia/commons/trump-portrait-768.jpg') {
      return new Response(fakeJpegBytes(5), {
        status: 200,
        headers: { 'content-type': 'image/jpeg', 'content-length': String(fakeJpegBytes(5).byteLength) },
      })
    }
    throw new Error(`unexpected fetch: ${url}`)
  }) as typeof fetch

  try {
    const reference = await resolveVerifiedPersonReference('President Trump')
    assert.equal(reference?.canonicalName, 'Donald Trump')
    assert.equal(reference?.mime, 'image/jpeg')
    assert.match(String(reference?.sourcePageUrl), /January_2025_Official_Presidential_Portrait/)
    assert.equal(calls.length, 2)
    assert.equal(calls.some((url) => url.includes('/w/api.php')), false)
  } finally {
    globalThis.fetch = originalFetch
    clearVerifiedPersonReferenceCacheForTests()
  }
})

test('Commons portrait selection rejects group scenes and selects an official single-person portrait', () => {
  const selected = selectCommonsPersonCandidate('Luiz Inácio Lula da Silva', [
    {
      title: 'File:Luiz Inácio Lula da Silva with supporters.jpg',
      imageinfo: [{
        thumburl: 'https://upload.wikimedia.org/wikipedia/commons/lula-with-supporters.jpg',
        extmetadata: { ImageDescription: { value: 'Group meeting with supporters.' } },
      }],
    },
    {
      title: 'File:Foto oficial de Luiz Inácio Lula da Silva 2023.jpg',
      imageinfo: [{
        thumburl: 'https://upload.wikimedia.org/wikipedia/commons/lula-official.jpg',
        extmetadata: { ImageDescription: { value: 'Official portrait of Luiz Inácio Lula da Silva.' } },
      }],
    },
  ])

  assert.equal(selected?.title, 'Foto oficial de Luiz Inácio Lula da Silva 2023.jpg')
})

test('verified mark selection rejects lookalikes and selects the matching crest', () => {
  const selected = selectCommonsCandidate('palmeiras', [
    {
      title: 'File:Palmeiras false flag.png',
      imageinfo: [{
        thumburl: 'https://upload.wikimedia.org/wikipedia/commons/palmeiras-false-flag.png',
        extmetadata: { ImageDescription: { value: 'A false flag, not the official crest.' } },
      }],
    },
    {
      title: 'File:Palmeiras logo.svg',
      imageinfo: [{
        thumburl: 'https://upload.wikimedia.org/wikipedia/commons/palmeiras-logo.png',
        extmetadata: { ImageDescription: { value: 'Logo of Sociedade Esportiva Palmeiras.' } },
      }],
    },
  ])

  assert.equal(selected?.title, 'Palmeiras logo.svg')
})

test('named people are generated by FLUX.2 Max with all ordered references and a portrait frame', { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch
  const oldKey = process.env.LOCAL_AI_API_KEY
  const oldBase = process.env.LOCAL_AI_BASE_URL
  let body: Record<string, unknown> | null = null

  process.env.LOCAL_AI_API_KEY = 'test-key'
  process.env.LOCAL_AI_BASE_URL = 'https://api.deepinfra.com/v1/openai'
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    assert.match(url, /\/v1\/inference\/black-forest-labs\/FLUX-2-max$/)
    body = JSON.parse(String(init?.body || '{}'))
    return new Response(JSON.stringify({ images: [`data:image/jpeg;base64,${fakeJpegBase64(9)}`] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch

  try {
    const generated = await generateReferenceConditionedImage({
      prompt: 'Show Lula and Trump walking next to each other.',
      references: [lulaReference, trumpReference],
      size: '1024x1024',
    })
    assert.equal(generated.ok, true)
    assert.equal(generated.mime, 'image/jpeg')
    assert.equal(body?.width, 1024)
    assert.equal(body?.height, 1280)
    assert.equal(body?.input_image, lulaReference.b64)
    assert.equal(body?.input_image_2, trumpReference.b64)
    assert.match(String(body?.prompt), /exactly 2 dominant foreground people/)
    assert.match(String(body?.prompt), /no other visible human faces/)
    assert.match(String(body?.prompt), /Never duplicate, merge, average, swap, substitute, omit, or invent/)
  } finally {
    globalThis.fetch = originalFetch
    if (oldKey === undefined) delete process.env.LOCAL_AI_API_KEY
    else process.env.LOCAL_AI_API_KEY = oldKey
    if (oldBase === undefined) delete process.env.LOCAL_AI_BASE_URL
    else process.env.LOCAL_AI_BASE_URL = oldBase
  }
})

test('single-person verification uses a one-person schema instead of the old hard-coded two-person schema', { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch
  const oldKey = process.env.LOCAL_AI_API_KEY
  const oldBase = process.env.LOCAL_AI_BASE_URL
  let requestBody: any = null

  process.env.LOCAL_AI_API_KEY = 'test-key'
  process.env.LOCAL_AI_BASE_URL = 'https://api.deepinfra.com/v1/openai'
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    requestBody = JSON.parse(String(init?.body || '{}'))
    return verifierResponse({ pass: true, principalPeople: 1, matches: [true] })
  }) as typeof fetch

  try {
    const result = await verifyReferenceConditionedPeopleImage({
      generated: { b64: fakeJpegBase64(12), mime: 'image/jpeg' },
      references: [trumpReference],
    })
    assert.equal(result.ok, true)
    assert.equal(requestBody.model, 'Qwen/Qwen2.5-VL-32B-Instruct')
    const prompt = requestBody.messages[0].content.at(-1).text
    assert.match(prompt, /exactly 1 distinct principal person/)
    assert.match(prompt, /"principal_people":1/)
    assert.match(prompt, /"reference_matches":\[true\]/)
    assert.equal(requestBody.messages[0].content.filter((item: any) => item.type === 'image_url').length, 2)
  } finally {
    globalThis.fetch = originalFetch
    if (oldKey === undefined) delete process.env.LOCAL_AI_API_KEY
    else process.env.LOCAL_AI_API_KEY = oldKey
    if (oldBase === undefined) delete process.env.LOCAL_AI_BASE_URL
    else process.env.LOCAL_AI_BASE_URL = oldBase
  }
})

test('two-person verification requires two distinct matches', { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch
  const oldKey = process.env.LOCAL_AI_API_KEY
  const oldBase = process.env.LOCAL_AI_BASE_URL
  let requestBody: any = null

  process.env.LOCAL_AI_API_KEY = 'test-key'
  process.env.LOCAL_AI_BASE_URL = 'https://api.deepinfra.com/v1/openai'
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    requestBody = JSON.parse(String(init?.body || '{}'))
    return verifierResponse({ pass: true, principalPeople: 2, matches: [true, true] })
  }) as typeof fetch

  try {
    const result = await verifyReferenceConditionedPeopleImage({
      generated: { b64: fakeJpegBase64(13), mime: 'image/jpeg' },
      references: [lulaReference, trumpReference],
    })
    assert.equal(result.ok, true)
    const prompt = requestBody.messages[0].content.at(-1).text
    assert.match(prompt, /exactly 2 distinct principal people/)
    assert.match(prompt, /"reference_matches":\[true,true\]/)
    assert.equal(requestBody.messages[0].content.filter((item: any) => item.type === 'image_url').length, 3)
  } finally {
    globalThis.fetch = originalFetch
    if (oldKey === undefined) delete process.env.LOCAL_AI_API_KEY
    else process.env.LOCAL_AI_API_KEY = oldKey
    if (oldBase === undefined) delete process.env.LOCAL_AI_BASE_URL
    else process.env.LOCAL_AI_BASE_URL = oldBase
  }
})

test('the smaller verifier is used only after a technical primary failure', { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch
  const oldKey = process.env.LOCAL_AI_API_KEY
  const oldBase = process.env.LOCAL_AI_BASE_URL
  const models: string[] = []

  process.env.LOCAL_AI_API_KEY = 'test-key'
  process.env.LOCAL_AI_BASE_URL = 'https://api.deepinfra.com/v1/openai'
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body || '{}'))
    models.push(body.model)
    return models.length === 1
      ? verifierResponse({ pass: false, principalPeople: 1, matches: [false] }, 503)
      : verifierResponse({ pass: true, principalPeople: 1, matches: [true] })
  }) as typeof fetch

  try {
    const result = await verifyReferenceConditionedPeopleImage({
      generated: { b64: fakeJpegBase64(14), mime: 'image/jpeg' },
      references: [trumpReference],
    })
    assert.equal(result.ok, true)
    assert.deepEqual(models, ['Qwen/Qwen2.5-VL-32B-Instruct', 'Qwen/Qwen2.5-VL-7B-Instruct'])
  } finally {
    globalThis.fetch = originalFetch
    if (oldKey === undefined) delete process.env.LOCAL_AI_API_KEY
    else process.env.LOCAL_AI_API_KEY = oldKey
    if (oldBase === undefined) delete process.env.LOCAL_AI_BASE_URL
    else process.env.LOCAL_AI_BASE_URL = oldBase
  }
})

test('a valid identity rejection is not overruled by a smaller model', { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch
  const oldKey = process.env.LOCAL_AI_API_KEY
  const oldBase = process.env.LOCAL_AI_BASE_URL
  let calls = 0

  process.env.LOCAL_AI_API_KEY = 'test-key'
  process.env.LOCAL_AI_BASE_URL = 'https://api.deepinfra.com/v1/openai'
  globalThis.fetch = (async () => {
    calls += 1
    return verifierResponse({
      pass: false,
      principalPeople: 2,
      matches: [false, true],
      reasons: ['identity_reference_mismatch'],
    })
  }) as typeof fetch

  try {
    const result = await verifyReferenceConditionedPeopleImage({
      generated: { b64: fakeJpegBase64(15), mime: 'image/jpeg' },
      references: [lulaReference, trumpReference],
    })
    assert.equal(result.ok, false)
    assert.deepEqual(result.reasonCodes, ['identity_reference_mismatch'])
    assert.equal(calls, 1)
  } finally {
    globalThis.fetch = originalFetch
    if (oldKey === undefined) delete process.env.LOCAL_AI_API_KEY
    else process.env.LOCAL_AI_API_KEY = oldKey
    if (oldBase === undefined) delete process.env.LOCAL_AI_BASE_URL
    else process.env.LOCAL_AI_BASE_URL = oldBase
  }
})

test('Concierge keeps verified people on the visual path and renders successful files inline', () => {
  const browserRoute = readFileSync(new URL('../app/api/cos-browser/route.ts', import.meta.url), 'utf8')
  const visualRoute = readFileSync(new URL('../app/api/visuals/route.ts', import.meta.url), 'utf8')
  const personReferences = readFileSync(new URL('../lib/visuals/personReferences.ts', import.meta.url), 'utf8')
  const referenceGeneration = readFileSync(new URL('../lib/visuals/referenceImageGeneration.ts', import.meta.url), 'utf8')
  const personVerification = readFileSync(new URL('../lib/visuals/personImageVerification.ts', import.meta.url), 'utf8')
  const home = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8')

  assert.match(browserRoute, /classifyVisualRequest\(/)
  assert.match(browserRoute, /hasUserReferenceImage\(body\)/)
  assert.match(browserRoute, /inlineVisualResponse\(await visualPost\(visualRequest\), appendPreviewToReply\)/)
  assert.match(browserRoute, /visual:\s*\{[\s\S]*previewUrl/)
  assert.match(home, /data-concierge-visual-preview="true"/)
  assert.match(home, /src=\{turn\.visualPreviewUrl\}/)

  assert.match(visualRoute, /classification\.requestType === 'named-person'/)
  assert.match(visualRoute, /classification\.requestType === 'multiple-named-people'/)
  assert.match(visualRoute, /resolveVerifiedPersonReference/)
  assert.match(visualRoute, /generateReferenceConditionedImage/)
  assert.match(visualRoute, /verifyReferenceConditionedPeopleImage/)
  assert.match(visualRoute, /synthetic_media: isGenerated/)
  assert.doesNotMatch(visualRoute, /classification\.requestType === '(?:named-person|multiple-named-people)'[\s\S]{0,1400}createPlatformImagePort\(\)\.generate/)

  assert.match(personReferences, /Special:Redirect\/file/)
  assert.match(personReferences, /January 2025 Official Presidential Portrait of Donald J\. Trump\.jpg/)
  assert.match(personReferences, /Foto oficial de Luiz Inácio Lula da Silva \(2023–2027\)\.jpg/)
  assert.match(referenceGeneration, /black-forest-labs\/FLUX-2-max/)
  assert.doesNotMatch(referenceGeneration, /\/v1\/images\/edits/)
  assert.match(referenceGeneration, /There is no[\s\S]*text-only identity fallback/i)
  assert.match(personVerification, /expectedPassExample\(referenceCount/)
  assert.match(personVerification, /Qwen\/Qwen2\.5-VL-32B-Instruct/)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { detectConciergeVisualIntent, extractNamedPeople, isConciergeVisualObjective } from '../lib/visuals/intent.ts'
import { selectCommonsCandidate } from '../lib/visuals/referenceAssets.ts'
import { selectCommonsPersonCandidate } from '../lib/visuals/personReferences.ts'
import { generateReferenceConditionedImage } from '../lib/visuals/referenceImageGeneration.ts'
import { verifyReferenceConditionedPeopleImage } from '../lib/visuals/personImageVerification.ts'
import { hydrateLocalizedSource } from './helpers/hydrateLocalizedSource.ts'

const LULA_TRUMP_PROMPT = 'faça uma imagem do Luiz Inácio Lula da Silva e do President Trump walking next to each other'
const TRUMP_LULA_PROMPT = 'faça um imagem do presidente Trump e do presidente Lula walking next to each other'

function fakeJpegBase64(marker = 0): string {
  const bytes = Buffer.alloc(80, marker)
  bytes[0] = 0xff
  bytes[1] = 0xd8
  bytes[2] = 0xff
  return bytes.toString('base64')
}

const lulaReference = Object.freeze({
  canonicalName: 'Luiz Inácio Lula da Silva',
  b64: fakeJpegBase64(1),
  mime: 'image/jpeg' as const,
  title: 'Foto oficial de Luiz Inácio Lula da Silva (2023–2027).jpg',
  provider: 'wikimedia-commons' as const,
  sourcePageUrl: 'https://commons.wikimedia.org/wiki/File:Foto_oficial_de_Luiz_In%C3%A1cio_Lula_da_Silva_(2023%E2%80%932027).jpg',
  assetUrl: 'https://upload.wikimedia.org/example-lula.jpg',
})

const trumpReference = Object.freeze({
  canonicalName: 'Donald Trump',
  b64: fakeJpegBase64(2),
  mime: 'image/jpeg' as const,
  title: 'Official Presidential Portrait of President Donald J. Trump (2025).jpg',
  provider: 'wikimedia-commons' as const,
  sourcePageUrl: 'https://commons.wikimedia.org/wiki/File:Official_Presidential_Portrait_of_President_Donald_J._Trump_(2025).jpg',
  assetUrl: 'https://upload.wikimedia.org/example-trump.jpg',
})

test('explicit visual requests are routed to the authenticated visual tool', () => {
  const explicitVisualRequests = [
    'Please sketch two kids playing with a dog in the rain.',
    'Create a colorful diagram of my new office.',
    'desenhe o distintivo do time do palmeiras',
    'crie o distintivo do time do palmeiras',
    'Dibuja el escudo de un club de fútbol.',
    'Stwórz herb drużyny piłkarskiej.',
    'Нарисуй эмблему футбольной команды.',
    'Design a coat of arms for the family.',
    LULA_TRUMP_PROMPT,
    TRUMP_LULA_PROMPT,
  ]
  for (const prompt of explicitVisualRequests) {
    assert.equal(isConciergeVisualObjective(prompt), true, prompt)
  }

  assert.equal(isConciergeVisualObjective('What is a diagram?'), false)
  assert.equal(isConciergeVisualObjective('Qual é a história do distintivo do Palmeiras?'), false)
  assert.equal(isConciergeVisualObjective('Descreva o distintivo do Palmeiras.'), false)
})

test('existing named marks use verified-reference mode while original design requests still generate', () => {
  const drawPalmeiras = detectConciergeVisualIntent('desenhe o distintivo do time do palmeiras')
  assert.deepEqual(drawPalmeiras, {
    filename: 'palmeiras-mark.png',
    mode: 'reference-mark',
    referenceQuery: 'palmeiras',
  })

  const createPalmeiras = detectConciergeVisualIntent('crie o distintivo do time do palmeiras')
  assert.equal(createPalmeiras?.mode, 'reference-mark')
  assert.equal(createPalmeiras?.referenceQuery, 'palmeiras')

  assert.equal(detectConciergeVisualIntent('Design a new original logo for Acme')?.mode, 'generate')
  assert.equal(detectConciergeVisualIntent('Crie um distintivo para meu time')?.mode, 'generate')
  assert.equal(detectConciergeVisualIntent('Design a coat of arms for the family')?.mode, 'generate')
  assert.equal(detectConciergeVisualIntent('Dibuja el escudo de un club de fútbol')?.mode, 'generate')
  assert.equal(detectConciergeVisualIntent('Stwórz herb drużyny piłkarskiej')?.mode, 'generate')
  assert.equal(detectConciergeVisualIntent('Нарисуй эмблему футбольной команды')?.mode, 'generate')
})

test('named real people use ordered verified references instead of text-only identity generation', () => {
  assert.deepEqual(extractNamedPeople(LULA_TRUMP_PROMPT), ['Luiz Inácio Lula da Silva', 'Donald Trump'])
  assert.deepEqual(detectConciergeVisualIntent(LULA_TRUMP_PROMPT), {
    filename: 'luiz-inacio-lula-da-silva-donald-trump-illustration.png',
    mode: 'reference-people',
    referencePeople: ['Luiz Inácio Lula da Silva', 'Donald Trump'],
  })

  assert.deepEqual(extractNamedPeople(TRUMP_LULA_PROMPT), ['Donald Trump', 'Luiz Inácio Lula da Silva'])
  assert.deepEqual(detectConciergeVisualIntent(TRUMP_LULA_PROMPT)?.referencePeople, ['Donald Trump', 'Luiz Inácio Lula da Silva'])
  assert.deepEqual(detectConciergeVisualIntent('Create a portrait of Barack Obama standing beside Angela Merkel')?.referencePeople, ['Barack Obama', 'Angela Merkel'])
  assert.equal(detectConciergeVisualIntent('Please sketch two kids playing with a dog in the rain.')?.mode, 'generate')
  assert.equal(detectConciergeVisualIntent('Create a fictional portrait of President Trump lookalike')?.mode, 'generate')
})

test('verified Commons mark selection rejects lookalikes and chooses the matching logo', () => {
  const selected = selectCommonsCandidate('palmeiras', [
    {
      title: 'File:Palmeiras false flag.png',
      imageinfo: [{
        thumburl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/00/Palmeiras_false_flag.png/640px-Palmeiras_false_flag.png',
        extmetadata: { ImageDescription: { value: 'A false flag, not the official crest.' } },
      }],
    },
    {
      title: 'File:Palmeiras logo.svg',
      imageinfo: [{
        thumburl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/Palmeiras_logo.svg/1024px-Palmeiras_logo.svg.png',
        extmetadata: { ImageDescription: { value: 'Logo of Sociedade Esportiva Palmeiras.' } },
      }],
    },
    {
      title: 'File:Unrelated club logo.svg',
      imageinfo: [{
        thumburl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b0/Unrelated.svg/1024px-Unrelated.svg.png',
        extmetadata: { ImageDescription: { value: 'Logo of another football club.' } },
      }],
    },
  ])

  assert.equal(selected?.title, 'Palmeiras logo.svg')
  assert.match(String(selected?.assetUrl), /^https:\/\/upload\.wikimedia\.org\//)
})

test('verified Commons person selection rejects group scenes and chooses a matching official portrait', () => {
  const selected = selectCommonsPersonCandidate('Luiz Inácio Lula da Silva', [
    {
      title: 'File:Luiz Inácio Lula da Silva with supporters.jpg',
      imageinfo: [{
        thumburl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Lula_with_supporters.jpg/512px-Lula_with_supporters.jpg',
        extmetadata: { ImageDescription: { value: 'Group meeting with supporters.' } },
      }],
    },
    {
      title: 'File:Foto oficial de Luiz Inácio Lula da Silva 2023.jpg',
      imageinfo: [{
        thumburl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b1/Lula_official.jpg/512px-Lula_official.jpg',
        extmetadata: { ImageDescription: { value: 'Official portrait of Luiz Inácio Lula da Silva.' } },
      }],
    },
    {
      title: 'File:Official portrait of another president.jpg',
      imageinfo: [{
        thumburl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c1/Other.jpg/512px-Other.jpg',
        extmetadata: { ImageDescription: { value: 'Official portrait.' } },
      }],
    },
  ])

  assert.equal(selected?.title, 'Foto oficial de Luiz Inácio Lula da Silva 2023.jpg')
})

test('reference-conditioned generation sends both identity images to FLUX.2 Klein', { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch
  const oldKey = process.env.LOCAL_AI_API_KEY
  const oldBase = process.env.LOCAL_AI_BASE_URL
  const outputB64 = fakeJpegBase64(9)
  let nativeBody: Record<string, unknown> | null = null

  process.env.LOCAL_AI_API_KEY = 'test-key'
  process.env.LOCAL_AI_BASE_URL = 'https://api.deepinfra.com/v1/openai'
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    assert.match(url, /\/v1\/inference\/black-forest-labs\/FLUX-2-klein-4b$/)
    nativeBody = JSON.parse(String(init?.body || '{}'))
    return new Response(JSON.stringify({ images: [`data:image/jpeg;base64,${outputB64}`] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch

  try {
    const generated = await generateReferenceConditionedImage({
      prompt: 'Reference image 1 is Lula. Reference image 2 is Trump. Show both once.',
      references: [lulaReference, trumpReference],
      size: '1024x1024',
    })
    assert.equal(generated.ok, true)
    assert.equal(generated.mime, 'image/jpeg')
    assert.equal(nativeBody?.model, undefined)
    assert.equal(nativeBody?.input_image, lulaReference.b64)
    assert.equal(nativeBody?.input_image_2, trumpReference.b64)
  } finally {
    globalThis.fetch = originalFetch
    if (oldKey === undefined) delete process.env.LOCAL_AI_API_KEY
    else process.env.LOCAL_AI_API_KEY = oldKey
    if (oldBase === undefined) delete process.env.LOCAL_AI_BASE_URL
    else process.env.LOCAL_AI_BASE_URL = oldBase
  }
})

test('visual identity QA requires two distinct verified matches and rejects duplication', { concurrency: false }, async () => {
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
            principal_people: 2,
            reference_matches: [true, true],
            duplicate_or_substitution: false,
            reason_codes: [],
          }),
        },
      }],
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch

  try {
    const verification = await verifyReferenceConditionedPeopleImage({
      generated: { b64: fakeJpegBase64(7), mime: 'image/jpeg' },
      references: [lulaReference, trumpReference],
    })
    assert.equal(verification.ok, true)
    assert.equal(requestBody.model, 'Qwen/Qwen2.5-VL-7B-Instruct')
    assert.equal(requestBody.messages[0].content.filter((item: any) => item.type === 'image_url').length, 3)
    assert.match(requestBody.messages[0].content.at(-1).text, /exactly 2 distinct principal people/)
  } finally {
    globalThis.fetch = originalFetch
    if (oldKey === undefined) delete process.env.LOCAL_AI_API_KEY
    else process.env.LOCAL_AI_API_KEY = oldKey
    if (oldBase === undefined) delete process.env.LOCAL_AI_BASE_URL
    else process.env.LOCAL_AI_BASE_URL = oldBase
  }
})

test('Concierge renders visuals inline and existing identities cannot fall back to text-only hallucination', () => {
  const browserRoute = hydrateLocalizedSource(readFileSync(new URL('../app/api/cos-browser/route.ts', import.meta.url), 'utf8'))
  const visualRoute = hydrateLocalizedSource(readFileSync(new URL('../app/api/visuals/route.ts', import.meta.url), 'utf8'))
  const referenceAssets = hydrateLocalizedSource(readFileSync(new URL('../lib/visuals/referenceAssets.ts', import.meta.url), 'utf8'))
  const personReferences = hydrateLocalizedSource(readFileSync(new URL('../lib/visuals/personReferences.ts', import.meta.url), 'utf8'))
  const referenceGeneration = hydrateLocalizedSource(readFileSync(new URL('../lib/visuals/referenceImageGeneration.ts', import.meta.url), 'utf8'))
  const personVerification = hydrateLocalizedSource(readFileSync(new URL('../lib/visuals/personImageVerification.ts', import.meta.url), 'utf8'))
  const imagePort = hydrateLocalizedSource(readFileSync(new URL('../lib/cos/aiPort.ts', import.meta.url), 'utf8'))
  const fileRoute = hydrateLocalizedSource(readFileSync(new URL('../app/api/builder/workspaces/[workspaceId]/files/[...path]/route.ts', import.meta.url), 'utf8'))
  const home = hydrateLocalizedSource(readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8'))

  assert.match(browserRoute, /isConciergeVisualObjective\(prompt\)/)
  assert.match(browserRoute, /inlineVisualResponse\(await visualPost\(visualRequest\)\)/)
  assert.match(browserRoute, /visual:\s*\{[\s\S]*previewUrl/)
  assert.doesNotMatch(browserRoute, /reply:\s*`\$\{payload\.reply\}\\n\\n<IMAGE>/)
  assert.match(home, /const IMAGE_FILE_RE = \/\\\.\(\?:png\|jpe\?g\|webp\)\$\/i/)
  assert.match(home, /structuredVisualPreviewUrl \|\| builderPreviewUrl\(builderWorkspaceId, imagePath\)/)
  assert.match(home, /data-concierge-visual-preview="true"/)
  assert.match(home, /aspectRatio: '1 \/ 1'/)
  assert.match(home, /height=\{512\}/)
  assert.match(home, /width=\{512\}/)
  assert.match(home, /src=\{turn\.visualPreviewUrl\}/)
  assert.equal(home.indexOf('data-concierge-visual-preview="true"') < home.indexOf('turn.builderFiles.map'), true)
  assert.doesNotMatch(home, /hasInlineImage/)
  assert.doesNotMatch(home, /\/\\\\\.\(\?:png\|jpe\?g\|webp\)/)

  assert.match(visualRoute, /resolveVerifiedReferenceVisual/)
  assert.match(visualRoute, /intent\.mode === 'reference-mark'/)
  assert.match(visualRoute, /visual_reference_not_verified/)
  assert.match(visualRoute, /Não encontrei uma imagem verificável desse distintivo/)
  assert.match(visualRoute, /external_retrieval_used: Boolean\(verifiedReference \|\| isPeopleVisual\)/)
  assert.match(visualRoute, /createPlatformImagePort\(\)\.generate/)
  assert.ok(visualRoute.indexOf('resolveVerifiedReferenceVisual') < visualRoute.indexOf('createPlatformImagePort().generate'))
  assert.match(visualRoute, /Do not reconstruct, imitate, or claim to reproduce an existing named brand or team mark/)
  assert.doesNotMatch(visualRoute, /Include a named brand or team mark only when it is the explicit subject/)

  assert.match(visualRoute, /intent\.mode === 'reference-people'/)
  assert.match(visualRoute, /resolveVerifiedPersonReference/)
  assert.match(visualRoute, /generateReferenceConditionedImage/)
  assert.match(visualRoute, /verifyReferenceConditionedPeopleImage/)
  assert.match(visualRoute, /Do not duplicate, clone, merge, average, swap, substitute, omit, or invent/)
  assert.match(visualRoute, /synthetic_media: isPeopleVisual/)
  assert.match(visualRoute, /identity_verification_passed: isPeopleVisual/)
  assert.match(visualRoute, /A cena gerada não preservou claramente todas as identidades solicitadas/)
  assert.doesNotMatch(visualRoute, /reference-people[\s\S]{0,1200}createPlatformImagePort\(\)\.generate/)

  assert.match(referenceAssets, /www\.palmeiras\.com\.br\/wp-content\/uploads\/2021\/10\/escudos-inst_3\.png/)
  assert.match(referenceAssets, /sourcePageUrl: 'https:\/\/www\.palmeiras\.com\.br\/escudos\/'/)
  assert.match(referenceAssets, /commons\.wikimedia\.org\/w\/api\.php/)
  assert.match(referenceAssets, /upload\.wikimedia\.org/)
  assert.match(referenceAssets, /MAX_IMAGE_BYTES/)
  assert.match(referenceAssets, /returns null so the caller can fail closed/)

  assert.match(personReferences, /Foto oficial de Luiz Inácio Lula da Silva \(2023–2027\)\.jpg/)
  assert.match(personReferences, /Official Presidential Portrait of President Donald J\. Trump \(2025\)\.jpg/)
  assert.match(personReferences, /returns null so COS never substitutes, duplicates, or invents/)
  assert.match(referenceGeneration, /black-forest-labs\/FLUX-2-klein-4b/)
  assert.match(referenceGeneration, /input_image_\$\{index \+ 1\}/)
  assert.match(referenceGeneration, /there is no text-only identity fallback/)
  assert.match(personVerification, /Qwen\/Qwen2\.5-VL-7B-Instruct/)
  assert.match(personVerification, /missing, substituted, duplicated, cloned, merged/)

  assert.match(visualRoute, /artifact-image-base64:/)
  assert.doesNotMatch(imagePort, /response_format/)
  assert.doesNotMatch(imagePort, /OPENAI/)
  assert.match(imagePort, /api\.deepinfra\.com\/v1\/openai\/images\/generations/)
  assert.match(imagePort, /model: 'black-forest-labs\/FLUX-2-klein-4b'/)
  assert.match(imagePort, /concierge-visual-runtime-failure/)
  assert.match(fileRoute, /artifact-image-base64:/)
  assert.match(fileRoute, /isImagePreview/)
  assert.equal(fileRoute.includes(String.raw`([\\s\\S]+)$`), false)
  assert.equal(fileRoute.includes(String.raw`([\s\S]+)$`), true)
  assert.match(home, /<img/)
})

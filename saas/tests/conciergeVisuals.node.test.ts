import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { detectConciergeVisualIntent, isConciergeVisualObjective } from '../lib/visuals/intent.ts'
import { selectCommonsCandidate } from '../lib/visuals/referenceAssets.ts'
import { hydrateLocalizedSource } from './helpers/hydrateLocalizedSource.ts'

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

test('verified Commons selection rejects lookalikes and chooses the matching logo', () => {
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

test('Concierge renders visuals inline and existing marks cannot fall back to generative hallucination', () => {
  const browserRoute = hydrateLocalizedSource(readFileSync(new URL('../app/api/cos-browser/route.ts', import.meta.url), 'utf8'))
  const visualRoute = hydrateLocalizedSource(readFileSync(new URL('../app/api/visuals/route.ts', import.meta.url), 'utf8'))
  const referenceAssets = hydrateLocalizedSource(readFileSync(new URL('../lib/visuals/referenceAssets.ts', import.meta.url), 'utf8'))
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
  assert.match(visualRoute, /external_retrieval_used: Boolean\(verifiedReference\)/)
  assert.match(visualRoute, /createPlatformImagePort\(\)\.generate/)
  assert.ok(visualRoute.indexOf('resolveVerifiedReferenceVisual') < visualRoute.indexOf('createPlatformImagePort().generate'))
  assert.match(visualRoute, /Do not reconstruct, imitate, or claim to reproduce an existing named brand or team mark/)
  assert.doesNotMatch(visualRoute, /Include a named brand or team mark only when it is the explicit subject/)

  assert.match(referenceAssets, /www\.palmeiras\.com\.br\/wp-content\/uploads\/2021\/10\/escudos-inst_3\.png/)
  assert.match(referenceAssets, /sourcePageUrl: 'https:\/\/www\.palmeiras\.com\.br\/escudos\/'/)
  assert.match(referenceAssets, /commons\.wikimedia\.org\/w\/api\.php/)
  assert.match(referenceAssets, /upload\.wikimedia\.org/)
  assert.match(referenceAssets, /MAX_IMAGE_BYTES/)
  assert.match(referenceAssets, /returns null so the caller can fail closed/)

  assert.match(visualRoute, /artifact-image-base64:/)
  assert.doesNotMatch(imagePort, /response_format/)
  assert.doesNotMatch(imagePort, /OPENAI/)
  assert.match(imagePort, /api\.deepinfra\.com\/v1\/openai\/images\/generations/)
  assert.match(imagePort, /model: 'black-forest-labs\/FLUX-1-schnell'/)
  assert.match(imagePort, /concierge-visual-runtime-failure/)
  assert.match(fileRoute, /artifact-image-base64:/)
  assert.match(fileRoute, /isImagePreview/)
  assert.equal(fileRoute.includes(String.raw`([\\s\\S]+)$`), false)
  assert.equal(fileRoute.includes(String.raw`([\s\S]+)$`), true)
  assert.match(home, /<img/)
})

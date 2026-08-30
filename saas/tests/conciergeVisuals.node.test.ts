import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { decodeBuilderImageArtifact } from '../lib/builder/image-artifact.ts'
import { isConciergeVisualObjective } from '../lib/visuals/intent.ts'
import { hydrateLocalizedSource } from './helpers/hydrateLocalizedSource.ts'

test('stored visual artifacts decode to real image bytes', () => {
  const expected = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
  const decoded = decodeBuilderImageArtifact(`artifact-image-base64:image/jpeg:${expected.toString('base64')}`)

  assert.ok(decoded)
  assert.equal(decoded.mime, 'image/jpeg')
  assert.deepEqual(decoded.bytes, expected)
  assert.equal(decodeBuilderImageArtifact('artifact-image-base64:image/gif:AAAA'), null)
})

test('explicit visual requests are routed to the authenticated visual tool', () => {
  assert.equal(isConciergeVisualObjective('Please sketch two kids playing with a dog in the rain.'), true)
  assert.equal(isConciergeVisualObjective('Create a colorful diagram of my new office.'), true)
  assert.equal(isConciergeVisualObjective('What is a diagram?'), false)

  const browserRoute = hydrateLocalizedSource(readFileSync(new URL('../app/api/cos-browser/route.ts', import.meta.url), 'utf8'))
  const visualRoute = hydrateLocalizedSource(readFileSync(new URL('../app/api/visuals/route.ts', import.meta.url), 'utf8'))
  const imagePort = hydrateLocalizedSource(readFileSync(new URL('../lib/cos/aiPort.ts', import.meta.url), 'utf8'))
  const fileRoute = hydrateLocalizedSource(readFileSync(new URL('../app/api/builder/workspaces/[workspaceId]/files/[...path]/route.ts', import.meta.url), 'utf8'))
  const home = hydrateLocalizedSource(readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8'))

  assert.match(browserRoute, /isConciergeVisualObjective\(prompt\)/)
  assert.match(browserRoute, /inlineVisualResponse\(await visualPost\(visualRequest\)\)/)
  assert.match(browserRoute, /visual:\s*\{[\s\S]*previewUrl/)
  assert.doesNotMatch(browserRoute, /reply:\s*\`\$\{payload\.reply\}\\n\\n<IMAGE>/)
  assert.match(home, /visualPreviewUrl/)
  assert.match(home, /src=\{turn\.visualPreviewUrl\}/)
  assert.match(visualRoute, /createPlatformImagePort\(\)\.generate/)
  assert.match(visualRoute, /artifact-image-base64:/)
  assert.doesNotMatch(imagePort, /response_format/)
  assert.doesNotMatch(imagePort, /OPENAI/)
  assert.match(imagePort, /api\\.deepinfra\\.com\\/v1\\/openai\\/images\\/generations/)
  assert.match(imagePort, /model: 'black-forest-labs\\/FLUX-1-schnell'/)
  assert.match(imagePort, /concierge-visual-runtime-failure/)
  assert.match(fileRoute, /decodeBuilderImageArtifact\(file\.content\)/)
  assert.match(fileRoute, /imageArtifact \? imageArtifact\.mime/)
  assert.match(fileRoute, /isImagePreview/)
  assert.match(home, /\\.\(\?:png\|jpe\?g\|webp\)/)
  assert.match(home, /<img/)
})

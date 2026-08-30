import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { isConciergeVisualObjective } from '../lib/visuals/intent.ts'
import { hydrateLocalizedSource } from './helpers/hydrateLocalizedSource.ts'

test('explicit visual requests are routed to the authenticated visual tool', () => {
  assert.equal(isConciergeVisualObjective('Please sketch two kids playing with a dog in the rain.'), true)
  assert.equal(isConciergeVisualObjective('Create a colorful diagram of my new office.'), true)
  assert.equal(isConciergeVisualObjective('What is a diagram?'), false)

  const browserRoute = hydrateLocalizedSource(readFileSync(new URL('../app/api/cos-browser/route.ts', import.meta.url), 'utf8'))
  const visualRoute = hydrateLocalizedSource(readFileSync(new URL('../app/api/visuals/route.ts', import.meta.url), 'utf8'))
  const fileRoute = hydrateLocalizedSource(readFileSync(new URL('../app/api/builder/workspaces/[workspaceId]/files/[...path]/route.ts', import.meta.url), 'utf8'))
  const home = hydrateLocalizedSource(readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8'))

  assert.match(browserRoute, /isConciergeVisualObjective\(prompt\)/)
  assert.match(browserRoute, /visualPost\(visualRequest\)/)
  assert.match(visualRoute, /createPlatformImagePort\(\)\.generate/)
  assert.match(visualRoute, /artifact-image-base64:/)
  assert.match(fileRoute, /artifact-image-base64:/)
  assert.match(fileRoute, /isImagePreview/)
  assert.match(home, /\\.\(\?:png\|jpe\?g\|webp\)/)
  assert.match(home, /<img/)
})

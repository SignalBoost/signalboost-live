import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { isCosCreativeImageRequest } from '../lib/ai/cos/creativeImageIntent.ts'

const entrypoint = readFileSync(new URL('../lib/ai/cos/cosFirstAnswer.ts', import.meta.url), 'utf8')

test('routes explicit visual creation to COS image generation', () => {
  assert.equal(isCosCreativeImageRequest('Generate an image of an alien spaceship over Miami.'), true)
  assert.equal(isCosCreativeImageRequest('Please create a 16:9 graphic for our launch.'), true)
  assert.equal(isCosCreativeImageRequest('Draw an illustration of a futuristic command center.'), true)
})

test('does not steal image research, analysis, OCR, or editing requests', () => {
  assert.equal(isCosCreativeImageRequest('Find an image of an alien spaceship.'), false)
  assert.equal(isCosCreativeImageRequest('Describe this image for me.'), false)
  assert.equal(isCosCreativeImageRequest('OCR this photo.'), false)
  assert.equal(isCosCreativeImageRequest('Edit this image and remove the background.'), false)
})

test('executes owner image creation without replacing the governed COS entrypoint', () => {
  assert.match(entrypoint, /async function tryCosCreativeImage/)
  assert.match(entrypoint, /input\.privileged !== true \|\| isPublicDeliveryScope\(\)/)
  assert.doesNotMatch(entrypoint, /cosFirstAnswerLegacy/)

  const image = entrypoint.indexOf('tryCosCreativeImage(input)')
  const neural = entrypoint.indexOf('tryOwnerNeuralSelfKnowledge(input)')
  const core = entrypoint.indexOf('tryCoreCOSFirstAnswer(input)')
  assert.ok(image > 0 && neural > image && core > neural)
})

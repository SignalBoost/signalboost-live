import assert from 'node:assert/strict'
import test from 'node:test'
import { isCosCreativeImageRequest } from '../lib/ai/cos/creativeImageIntent.ts'

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

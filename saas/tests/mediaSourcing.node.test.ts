import assert from 'node:assert/strict'
import test from 'node:test'
import { enrichSiteMedia, wantsGeneratedMedia } from '../lib/media/sourcing.ts'

test('detects explicit requests for generated imagery', () => {
  assert.equal(wantsGeneratedMedia('build a restaurant website with photos and logo'), true)
  assert.equal(wantsGeneratedMedia('build a restaurant website with reservations'), false)
})

test('maps football prompts to grassroots field images when no URLs are provided', () => {
  const site = enrichSiteMedia({
    businessName: 'Sunday FC',
    sections: [
      { type: 'hero', heading: 'Sunday FC' },
      { type: 'contact', heading: 'Join us' },
    ],
  }, 'Build a football club website with images')

  assert.equal(site.sections?.[0]?.type, 'hero-split')
  assert.match(String(site.sections?.[0]?.image_url), /images\.unsplash\.com/)
  const gallery = site.sections?.find(section => section.type === 'gallery')
  assert.match(String(gallery?.items?.[0]?.imageAlt), /grassroots football field/)
})

test('preserves supplied media URLs instead of replacing them', () => {
  const supplied = 'https://example.com/my-team.jpg'
  const site = enrichSiteMedia({
    businessName: 'Cafe Example',
    sections: [{ type: 'gallery', items: [{ title: 'Room', image_url: supplied }] }],
  }, 'Build a restaurant website with photos')

  assert.equal(site.sections?.[0]?.items?.[0]?.image_url, supplied)
})

test('still sources imagery when the prompt contains a non-image business URL', () => {
  const site = enrichSiteMedia({
    businessName: 'Example Bistro',
    sections: [{ type: 'hero', heading: 'Example Bistro' }],
  }, 'Use https://example.com as reference and make a restaurant site with photos')

  assert.match(String(site.sections?.[0]?.image_url), /images\.unsplash\.com/)
})

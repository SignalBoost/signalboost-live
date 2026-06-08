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
  assert.match(String(site.sections?.[0]?.image_url), /^\/media\/generated\/football-.*\.webp$/)
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

  assert.match(String(site.sections?.[0]?.image_url), /^\/media\/generated\/food-.*\.webp$/)
})


test('football prompts inject hero, gallery, and sponsor logo imagery without explicit photo words', () => {
  const site = enrichSiteMedia({
    businessName: 'DNA da Várzea',
    sections: [
      { type: 'hero', heading: 'DNA da Várzea' },
      { type: 'feature-grid', heading: 'Times da quebrada', items: [{ title: 'Botafogo do Jaçanã' }] },
      { type: 'contact', heading: 'Fale com a liga' },
    ],
  }, 'Crie um site para DNA da Várzea com times de futebol amador de São Paulo')

  const hero = site.sections?.find(section => section.type === 'hero-split')
  assert.match(String(hero?.image_url), /^\/media\/generated\/football-.*\.webp$/)

  const imageLed = site.sections?.find(section => section.type === 'feature-grid' || section.type === 'gallery')
  assert.equal(imageLed?.items?.filter(item => item.image_url).length, 3)

  const logos = site.sections?.find(section => section.type === 'logos')
  assert.ok(logos, 'football prompts should include a sponsor/logo section')
  assert.ok((logos?.items || []).every(item => /^\/media\/generated\/football-.*\.webp$/.test(String(item.logo_url))))
})


test('replaces generic generated image paths with existing generated asset paths', () => {
  const site = enrichSiteMedia({
    businessName: 'Luxury Bakery',
    sections: [
      { type: 'hero-split', heading: 'Luxury Bakery', image_url: 'hero.jpg' },
      { type: 'gallery', items: [{ title: 'Croissant counter', image_url: '/images/croissant.png' }] },
    ],
    logo_url: 'logo.png',
  }, 'Build a luxury bakery landing page')

  assert.match(String(site.sections?.[0]?.image_url), /^\/media\/generated\/bakery-.*\.webp$/)
  assert.match(String(site.sections?.[1]?.items?.[0]?.image_url), /^\/media\/generated\/bakery-.*\.webp$/)
  assert.match(String(site.logo_url), /^\/media\/generated\/bakery-.*\.webp$/)
})

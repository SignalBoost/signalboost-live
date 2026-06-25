import assert from 'node:assert/strict'
import test from 'node:test'
import { enrichSiteMedia, wantsGeneratedMedia } from '../lib/media/sourcing.ts'

// The old Unsplash Source endpoint (images.unsplash.com/featured/...) was sunset
// by Unsplash in June 2024, so sourcing was rewritten to use the official
// Unsplash API with a Picsum fallback. Every asset it produces is tagged
// sbsrc=1 (so cached sites stay stable and dead URLs get healed). These tests
// assert that durable tag rather than a specific provider, so they hold in CI
// (no key -> Picsum) and in production (key -> Unsplash) alike. enrichSiteMedia
// is async — it may call the Unsplash API — so every case awaits it.
const SOURCED = /[?&]sbsrc=1\b/
const isSourced = (url) => typeof url === 'string' && url.startsWith('https://') && SOURCED.test(url)

test('wantsGeneratedMedia always offers sourcing (per-asset decisions happen in enrichSiteMedia)', () => {
  assert.equal(wantsGeneratedMedia('build a restaurant website with photos and logo'), true)
  assert.equal(wantsGeneratedMedia('build a restaurant website with reservations'), true)
})

test('maps football prompts to grassroots field images when no URLs are provided', async () => {
  const site = await enrichSiteMedia({
    businessName: 'Sunday FC',
    sections: [
      { type: 'hero', heading: 'Sunday FC' },
      { type: 'contact', heading: 'Join us' },
    ],
  }, 'Build a football club website with images')

  assert.equal(site.sections?.[0]?.type, 'hero-split')
  assert.ok(isSourced(site.sections?.[0]?.image_url), 'hero image should be a sourced asset')
  const gallery = site.sections?.find(section => section.type === 'gallery')
  assert.match(String(gallery?.items?.[0]?.imageAlt), /grassroots football field/)
})

test('preserves supplied media URLs only when the prompt itself provides an image URL', async () => {
  const supplied = 'https://example.com/my-team.jpg'

  // Prompt carries an image URL -> respect the user's supplied asset.
  const kept = await enrichSiteMedia({
    businessName: 'Cafe Example',
    sections: [{ type: 'gallery', items: [{ title: 'Room', image_url: supplied }] }],
  }, 'Reference https://example.com/ref.jpg and build a restaurant website')
  assert.equal(kept.sections?.[0]?.items?.[0]?.image_url, supplied)

  // Prompt has no image URL -> replace the AI-emitted asset with a sourced one
  // to control image quality.
  const replaced = await enrichSiteMedia({
    businessName: 'Cafe Example',
    sections: [{ type: 'gallery', items: [{ title: 'Room', image_url: supplied }] }],
  }, 'Build a restaurant website with photos')
  assert.notEqual(replaced.sections?.[0]?.items?.[0]?.image_url, supplied)
  assert.ok(isSourced(replaced.sections?.[0]?.items?.[0]?.image_url), 'replacement should be a sourced asset')
})

test('still sources imagery when the prompt contains a non-image business URL', async () => {
  const site = await enrichSiteMedia({
    businessName: 'Example Bistro',
    sections: [{ type: 'hero', heading: 'Example Bistro' }],
  }, 'Use https://example.com as reference and make a restaurant site with photos')

  assert.ok(isSourced(site.sections?.[0]?.image_url), 'hero image should be sourced despite the non-image URL')
})

test('football prompts inject hero, gallery, and sponsor logo imagery without explicit photo words', async () => {
  const site = await enrichSiteMedia({
    businessName: 'DNA da Várzea',
    sections: [
      { type: 'hero', heading: 'DNA da Várzea' },
      { type: 'feature-grid', heading: 'Times da quebrada', items: [{ title: 'Botafogo do Jaçanã' }] },
      { type: 'contact', heading: 'Fale com a liga' },
    ],
  }, 'Crie um site para DNA da Várzea com times de futebol amador de São Paulo')

  const hero = site.sections?.find(section => section.type === 'hero-split')
  assert.ok(isSourced(hero?.image_url), 'hero-split should carry a sourced image')

  const imageLed = site.sections?.find(section => section.type === 'feature-grid' || section.type === 'gallery')
  assert.equal(imageLed?.items?.filter(item => item.image_url).length, 3)

  const logos = site.sections?.find(section => section.type === 'logos')
  assert.ok(logos, 'football prompts should include a sponsor/logo section')
  assert.ok((logos?.items || []).every(item => isSourced(item.logo_url)), 'every sponsor logo should be a sourced asset')
})

test('replaces generic generated image placeholders with sourced assets', async () => {
  const site = await enrichSiteMedia({
    businessName: 'Luxury Bakery',
    sections: [
      { type: 'hero-split', heading: 'Luxury Bakery', image_url: 'hero.jpg' },
      { type: 'gallery', items: [{ title: 'Croissant counter', image_url: '/images/croissant.png' }] },
    ],
    logo_url: 'logo.png',
  }, 'Build a luxury bakery landing page')

  assert.ok(isSourced(site.sections?.[0]?.image_url), 'placeholder hero.jpg should be replaced with a sourced asset')
  assert.ok(isSourced(site.sections?.[1]?.items?.[0]?.image_url), 'placeholder croissant.png should be replaced')
  assert.ok(isSourced(site.logo_url), 'placeholder logo.png should be replaced')
})

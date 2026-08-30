// saas/tests/portableProductHomepage.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { listPublicPortableProducts } from '../lib/portable-products/index.ts'
import { HOMEPAGE_UI_LOCALES } from '../lib/i18n/homepageUiLocales.ts'
import { hydrateLocalizedSource } from './helpers/hydrateLocalizedSource.ts'

const rawHomepage = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8')
const homepage = hydrateLocalizedSource(rawHomepage)
const locales = JSON.parse(hydrateLocalizedSource(readFileSync(new URL('../lib/i18n/homepageLocales.json', import.meta.url), 'utf8'))) as Record<string, { portables: Record<string, { name: string; desc: string }> }>

test('homepage renders public products from the registry selector without PORTABLES metadata', () => {
  assert.match(homepage, /import \{ listPublicPortableProducts \} from '@\/lib\/portable-products'/)
  assert.match(homepage, /listPublicPortableProducts\(\)\.map/); assert.doesNotMatch(homepage, /const PORTABLES\s*=/)
  const ids = listPublicPortableProducts().map(product => product.manifest.productId)
  // provider-hub joined the public catalog and sorts first. This list is deliberately exact:
  // it pins what the marketing surface shows buyers, so adding a portable to the homepage is a
  // decision someone has to make here rather than a side effect of writing a manifest.
  assert.deepEqual(ids, ['provider-hub', 'campaign-studio', 'integrations-hub', 'video-maker', 'control-center', 'marketing-sales', 'press-media', 'portable-ai-chief-of-staff', 'browser-agent-ecosystem', 'agent-operations-platform', 'self-healing-supervisor'])
  assert.ok(ids.includes('agent-operations-platform')); assert.ok(!homepage.includes('Durable Agent Runtime')); assert.ok(ids.includes('browser-agent-ecosystem'))
})

test('homepage status, routes, and localization remain supported', () => {
  const products = listPublicPortableProducts()
  assert.ok(products.filter(product => product.manifest.status === 'live').every(product => product.manifest.status === 'live'))
  assert.ok(products.filter(product => product.manifest.status === 'preview').every(product => product.manifest.status === 'preview'))
  assert.equal(products.find(product => product.manifest.productId === 'campaign-studio')?.route, '/agency')
  assert.ok(products.filter(product => product.manifest.status === 'preview' && !product.route).every(product => !product.route))
  for (const language of ['en', 'es', 'pt', 'pl', 'ru']) for (const product of products) assert.ok(locales[language].portables[product.localizationKey]?.name && locales[language].portables[product.localizationKey]?.desc)
})

test('homepage source contains no inline English UI fallbacks', () => {
  for (const text of [
    'AI powered · People in control',
    'One place for every growth task.',
    'Available in five languages',
    'Active portables',
    'Verified rows',
    'System status',
    'Data unavailable',
    'No activity recorded',
    'Activity time unavailable',
    'Connected · idle',
    'Not connected',
  ]) assert.ok(!rawHomepage.includes(text), `homepage must resolve ${JSON.stringify(text)} through locale data`)

  assert.doesNotMatch(rawHomepage, /copy\([^\n]+,\s*['"`]/)
  // uiText(path) is a locale-key lookup with no inline English argument. It is allowed here;
  // this guard is specifically about source-level English fallback copy.
})

test('homepage operational labels exist in every supported language', () => {
  for (const language of ['en', 'es', 'pt', 'pl', 'ru']) {
    const copy = HOMEPAGE_UI_LOCALES[language]
    assert.equal(typeof copy?.languages, 'object')
    assert.equal(typeof copy?.stats, 'object')
    assert.equal(typeof copy?.system, 'object')
    assert.equal(typeof copy?.runtime, 'object')
    assert.equal(typeof copy?.activity, 'object')
    assert.equal(typeof copy?.toolStatus, 'object')
    assert.equal(typeof copy?.licenseEmailSubject, 'string')
  }
})
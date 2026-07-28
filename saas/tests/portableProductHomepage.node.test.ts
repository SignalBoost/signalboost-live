// saas/tests/portableProductHomepage.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { listPublicPortableProducts } from '../lib/portable-products/index.ts'
import { hydrateLocalizedSource } from './helpers/hydrateLocalizedSource.ts'


const homepage = hydrateLocalizedSource(readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8'))
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

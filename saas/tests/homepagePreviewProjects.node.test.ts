import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const homepage = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8')
const preview = readFileSync(new URL('../components/home/PreviewProjects.tsx', import.meta.url), 'utf8')

test('homepage keeps roadmap previews separate from live portable runtime cards', () => {
  assert.match(homepage, /<PreviewProjects\s*\/>/)
  assert.match(homepage, /listPublicPortableProducts\(\)\.map/)
  assert.doesNotMatch(preview, /\/api\/portable-products\/live/)
  assert.doesNotMatch(preview, /License|mailto:/)
})

test('strategic project previews are visible, explicit, and multilingual', () => {
  for (const id of [
    'portable-product-platform',
    'universal-provider-framework',
    'governed-socket',
    'enterprise-autonomy-engine',
    'browser-provider-layer',
    'multi-provider-onboarding',
    'robotics-protocol-adapters',
  ]) assert.match(preview, new RegExp(`id: '${id}'`))

  assert.match(preview, /Preview only: not a claim of commercial readiness/)
  assert.match(preview, /production execution/)
  for (const language of ['en', 'es', 'pt', 'pl', 'ru']) {
    assert.match(preview, new RegExp(`${language}:`))
  }
})

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { PUBLIC_BRAND, publicBrandText } from '../lib/public-brand.ts'

test('iTMounts is the canonical public brand and origin', () => {
  assert.equal(PUBLIC_BRAND.name, 'iTMounts')
  assert.equal(PUBLIC_BRAND.siteUrl, 'https://itmounts.com')
  assert.equal(PUBLIC_BRAND.tagline, 'AI software that works for you')
})

test('legacy public brand names become iTMounts without rewriting implementation identifiers', () => {
  assert.equal(publicBrandText('SignalBoostAi'), 'iTMounts')
  assert.equal(publicBrandText('Powered by SignalBoost AI'), 'Powered by iTMounts')
  assert.equal(publicBrandText('Your SignalBoost concierge'), 'Your iTMounts concierge')
  assert.equal(publicBrandText('saas.signalboostapp.com'), 'saas.signalboostapp.com')
  assert.equal(publicBrandText('COS Builder'), 'COS Builder')
})

test('root metadata no longer pins the legacy SaaS origin', () => {
  const here = fileURLToPath(new URL('.', import.meta.url))
  const layout = readFileSync(new URL('../app/layout.tsx', `file://${here}`), 'utf8')
  assert.doesNotMatch(layout, /https:\/\/saas\.signalboostapp\.com/)
  assert.match(layout, /PUBLIC_BRAND\.siteUrl/)
})

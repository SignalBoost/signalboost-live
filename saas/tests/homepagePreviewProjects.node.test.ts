import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { readUiSource } from './helpers/sourceWithUiCopy.mjs'

const homepage = readUiSource(new URL('../app/page.tsx', import.meta.url))
const preview = readUiSource(new URL('../components/home/PreviewProjects.tsx', import.meta.url))
const workspaceCss = readFileSync(new URL('../app/concierge-workspace.css', import.meta.url), 'utf8')

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

test('homepage Concierge answers use the full workspace instead of a centered response card', () => {
  assert.match(workspaceCss, /\.concierge-shell \.exchange\s*\{[\s\S]*?width:\s*100%\s*!important;[\s\S]*?max-width:\s*none\s*!important;/)
  assert.match(workspaceCss, /\.concierge-shell \.assistant-message\s*\{[\s\S]*?width:\s*100%\s*!important;[\s\S]*?max-width:\s*none\s*!important;/)
  assert.match(workspaceCss, /\.concierge-shell \.assistant-content\s*\{[\s\S]*?width:\s*100%\s*!important;[\s\S]*?max-width:\s*none\s*!important;/)
})

test('generated visual preview has no card chrome or artificial square constraint', () => {
  const previewRule = workspaceCss.match(/\.concierge-shell \[data-concierge-visual-preview="true"\]\s*\{([\s\S]*?)\}/)?.[1] || ''
  assert.match(previewRule, /width:\s*100%\s*!important;/)
  assert.match(previewRule, /aspect-ratio:\s*auto\s*!important;/)
  assert.match(previewRule, /padding:\s*0\s*!important;/)
  assert.match(previewRule, /border:\s*0\s*!important;/)
  assert.match(previewRule, /border-radius:\s*0\s*!important;/)
  assert.match(previewRule, /background:\s*transparent\s*!important;/)
})

test('conversation surface cannot create a page-wide horizontal scrollbar', () => {
  const threadRule = workspaceCss.match(/\.concierge-shell \.thread\s*\{([\s\S]*?)\}/)?.[1] || ''
  assert.match(threadRule, /min-width:\s*0\s*!important;/)
  assert.match(threadRule, /overflow-x:\s*hidden\s*!important;/)
  assert.match(threadRule, /box-sizing:\s*border-box;/)
  assert.match(workspaceCss, /\.concierge-shell \.assistant-message pre\s*\{[\s\S]*?overflow-x:\s*auto;/)
})
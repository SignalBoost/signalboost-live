// saas/tests/conciergeFullBleedWorkspace.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'

test('homepage Concierge answers use the full workspace instead of a centered response card', async () => {
  const fs = await import('node:fs/promises')
  const css = await fs.readFile('app/concierge-workspace.css', 'utf8')

  assert.match(css, /\.concierge-shell \.exchange\s*\{[\s\S]*?width:\s*100%\s*!important;[\s\S]*?max-width:\s*none\s*!important;/)
  assert.match(css, /\.concierge-shell \.assistant-message\s*\{[\s\S]*?width:\s*100%\s*!important;[\s\S]*?max-width:\s*none\s*!important;/)
  assert.match(css, /\.concierge-shell \.assistant-content\s*\{[\s\S]*?width:\s*100%\s*!important;[\s\S]*?max-width:\s*none\s*!important;/)
})

test('generated visual preview has no card chrome or artificial square constraint', async () => {
  const fs = await import('node:fs/promises')
  const css = await fs.readFile('app/concierge-workspace.css', 'utf8')

  const previewRule = css.match(/\.concierge-shell \[data-concierge-visual-preview="true"\]\s*\{([\s\S]*?)\}/)?.[1] || ''
  assert.match(previewRule, /width:\s*100%\s*!important;/)
  assert.match(previewRule, /aspect-ratio:\s*auto\s*!important;/)
  assert.match(previewRule, /padding:\s*0\s*!important;/)
  assert.match(previewRule, /border:\s*0\s*!important;/)
  assert.match(previewRule, /border-radius:\s*0\s*!important;/)
  assert.match(previewRule, /background:\s*transparent\s*!important;/)
})

test('conversation surface cannot create a page-wide horizontal scrollbar', async () => {
  const fs = await import('node:fs/promises')
  const css = await fs.readFile('app/concierge-workspace.css', 'utf8')

  const threadRule = css.match(/\.concierge-shell \.thread\s*\{([\s\S]*?)\}/)?.[1] || ''
  assert.match(threadRule, /min-width:\s*0\s*!important;/)
  assert.match(threadRule, /overflow-x:\s*hidden\s*!important;/)
  assert.match(threadRule, /box-sizing:\s*border-box;/)
  assert.match(css, /\.concierge-shell \.assistant-message pre\s*\{[\s\S]*?overflow-x:\s*auto;/)
})
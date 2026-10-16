import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const shell = readFileSync(new URL('../components/layout/AppShell.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../app/concierge-workspace.css', import.meta.url), 'utf8')

test('one shared AppShell selects content and full-canvas modes', () => {
  assert.match(shell, /const isContentPage =/)
  assert.match(shell, /const layoutMode = isConciergeHome \? 'home' : isContentPage \? 'content' : 'canvas'/)
  assert.match(shell, /sb-ai-app-shell--\$\{layoutMode\}/)
})
test('reading width cap never applies to COS, Builder, LAB or dashboard canvases', () => {
  assert.match(css, /\.sb-ai-app-shell--content > \.sb-ai-workspace \{[\s\S]*max-width: 1200px !important/)
  assert.match(css, /\.sb-ai-app-shell--canvas > \.sb-ai-workspace \{[\s\S]*max-width: none !important/)
  assert.match(css, /@media \(max-width: 768px\)/)
})

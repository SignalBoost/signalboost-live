import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const shell = readFileSync(new URL('components/layout/AppShell.tsx', root), 'utf8')
const css = readFileSync(new URL('app/concierge-workspace.css', root), 'utf8')
const globals = readFileSync(new URL('app/globals.css', root), 'utf8')
const home = readFileSync(new URL('app/page.tsx', root), 'utf8')

test('global shell never mounts a Concierge dock on non-home pages', () => {
  assert.doesNotMatch(shell, /<Concierge\s*\/?\s*>/)
  assert.doesNotMatch(shell, /import Concierge/)
  assert.match(shell, /sb-ai-app-shell--canvas/)
  assert.match(shell, /pathname === '\/'/)
})
test('homepage retains its own complete Concierge chat experience', () => {
  assert.match(home, /className=\{'concierge-shell'/)
  assert.match(home, /<AssistantMessage content=\{turn\.response\}/)
})
test('responsive canvas does not reserve global dock width or truncate chart media', () => {
  assert.match(globals, /\.sb-ai-app-shell \{[^}]*display: block;[^}]*max-width: none;/)
  assert.doesNotMatch(globals, /\.sb-ai-app-shell \{[^}]*grid-template-columns/)
  assert.doesNotMatch(globals, /min\(1184px/)
  assert.match(css, /\.concierge-shell \.assistant-content img/)
  assert.match(css, /max-width: 100%;/)
  assert.match(css, /object-fit: contain/)
})

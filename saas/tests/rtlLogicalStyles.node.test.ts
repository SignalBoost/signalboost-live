// saas/tests/rtlLogicalStyles.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { writingDirection } from '../lib/i18n/supportedLanguages.ts'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
test('Arabic is the only right-to-left platform language', () => {
  assert.equal(writingDirection('ar'), 'rtl')
  for (const lang of ['en', 'es', 'pt', 'pl', 'ru', 'de', 'fr', 'it', 'ja', 'ko']) assert.equal(writingDirection(lang), 'ltr')
})
test('UI styling in app/ and components/ uses direction-aware properties', () => {
  const output = execFileSync(process.execPath, ['scripts/check-rtl-logical-styles.mjs'], { cwd: root, encoding: 'utf8' })
  assert.match(output, /\[validate:rtl-logical-styles\] PASS/)
})
test('global shell CSS mirrors for right-to-left', () => {
  const css = fs.readFileSync(path.join(root, 'app/globals.css'), 'utf8')
  assert.doesNotMatch(css, /text-align:\s*(left|right)|(margin|padding)-(left|right):\s*(?:auto|[1-9.])|border-(left|right):/)
  assert.match(css, /\[dir="rtl"\] \.sb-ai-dock-tab:hover/)
})
test('computed positions and translate-centred elements stay physical', () => {
  const dir = fs.mkdtempSync(path.join(root, 'components', '.rtl-fixture-'))
  try {
    fs.writeFileSync(path.join(dir, 'Fixture.tsx'), [
      "export const A = ({ x }: { x: number }) => <div style={{ position: 'absolute', left: x }} />",
      "export const B = () => <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)' }} />",
      "export const C = () => <div className=\"absolute left-1/2 -translate-x-1/2\" />",
      "export const D = () => <div className=\"pl-4 md:text-left\" style={{ marginLeft: 8, position: 'absolute', right: 0 }} />",
    ].join('\n'))
    let output = ''
    try { execFileSync(process.execPath, ['scripts/check-rtl-logical-styles.mjs'], { cwd: root, encoding: 'utf8', stdio: 'pipe' }) } catch (error: any) { output = String(error.stderr) }
    const fixture = output.split('\n').filter(line => line.includes('.rtl-fixture-'))
    assert.deepEqual(fixture.map(line => line.split('\t')[1]).sort(), ['className "pl-4 md:text-left"', 'marginLeft → marginInlineStart', 'right → insetInlineEnd'])
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

test('dashboard mounts the assistant composer reset guard', () => {
  const layout = readFileSync(join(process.cwd(), 'app/dashboard/layout.tsx'), 'utf8')
  assert.match(layout, /AssistantComposerResetGuard/)
  assert.match(layout, /<AssistantComposerResetGuard \/>/)
})

test('new chat clears the controlled composer in all five locales', () => {
  const source = readFileSync(join(process.cwd(), 'components/AssistantComposerResetGuard.tsx'), 'utf8')
  for (const label of ['new chat', 'nuevo chat', 'novo chat', 'nowy czat', 'новый чат']) {
    assert.match(source, new RegExp(label, 'iu'))
  }
  assert.match(source, /descriptor\?\.set\?\.call\(textarea, ''\)/)
  assert.match(source, /dispatchEvent\(new Event\('input', \{ bubbles: true \}\)\)/)
  assert.match(source, /removeStalePromptQuery\(\)/)
})

test('send and enter collapse an emptied multiline composer', () => {
  const source = readFileSync(join(process.cwd(), 'components/AssistantComposerResetGuard.tsx'), 'utf8')
  assert.match(source, /SEND_LABELS/)
  assert.match(source, /event\.key !== 'Enter' \|\| event\.shiftKey/)
  assert.match(source, /if \(textarea && !textarea\.value\) collapseComposer\(textarea\)/)
  assert.match(source, /textarea\.style\.height = 'auto'/)
  assert.match(source, /textarea\.scrollTop = 0/)
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

test('assistant owns composer reset in React state instead of a DOM click guard', () => {
  const page = readFileSync(join(process.cwd(), 'app/dashboard/assistant/page.tsx'), 'utf8')
  const layout = readFileSync(join(process.cwd(), 'app/dashboard/layout.tsx'), 'utf8')
  assert.match(page, /const composerRef = useRef<HTMLTextAreaElement>\(null\)/)
  assert.match(page, /function clearComposer\(removeQuery = false\)/)
  assert.match(page, /setInput\(''\)/)
  assert.match(page, /textarea\.style\.height = 'auto'/)
  assert.match(page, /ref=\{composerRef\}/)
  assert.doesNotMatch(layout, /AssistantComposerResetGuard/)
})

test('new chat and send clear the composer and stale handoff query', () => {
  const page = readFileSync(join(process.cwd(), 'app/dashboard/assistant/page.tsx'), 'utf8')
  assert.match(page, /function startNewChat\(\)[\s\S]*clearComposer\(true\)/)
  assert.match(page, /async function send\(text: string\)[\s\S]*clearComposer\(true\)/)
  assert.match(page, /for \(const key of \['prompt', 'conversation', 'draft'\]\)/)
})

test('homepage continues with persisted conversation instead of reinjecting the old prompt', () => {
  const home = readFileSync(join(process.cwd(), 'app/page.tsx'), 'utf8')
  const assistant = readFileSync(join(process.cwd(), 'app/dashboard/assistant/page.tsx'), 'utf8')
  assert.match(home, /const conversationId = crypto\.randomUUID\(\)/)
  assert.match(home, /currentPage: '\/', timezone: [^\n]+conversationId/)
  assert.match(home, /\/dashboard\/assistant\?conversation=/)
  assert.doesNotMatch(home, /\/dashboard\/assistant\?prompt=/)
  assert.match(assistant, /params\.get\('conversation'\)/)
  assert.match(assistant, /loadConversation\(conversation, true\)/)
})

test('legacy prompt query no longer repopulates composer unless caller explicitly opts into draft mode', () => {
  const page = readFileSync(join(process.cwd(), 'app/dashboard/assistant/page.tsx'), 'utf8')
  assert.match(page, /const explicitDraft = params\.get\('draft'\) === '1'/)
  assert.match(page, /if \(prompt && explicitDraft\)/)
  assert.match(page, /if \(prompt\) removeHandoffQuery\(\)/)
})

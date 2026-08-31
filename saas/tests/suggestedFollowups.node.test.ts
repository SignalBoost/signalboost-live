import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { suggestFollowups } from '../lib/ai/cos/suggestedFollowups.ts'

test('suggested followup cascades are disabled for successful answers', async () => {
  const result = await suggestFollowups({
    prompt: "should men play in women's sport?",
    reply: 'A completed answer.',
    sources: [{ title: 'Example source' }],
  })
  assert.deepEqual(result, [])
})

test('suggested followup cascades remain disabled for failed-closed answers', async () => {
  const result = await suggestFollowups({
    prompt: 'What is the current rule?',
    reply: 'Live verification was insufficient.',
    failedClosed: true,
  })
  assert.deepEqual(result, [])
})

test('the retired compatibility seam performs no model generation or policy fallback', () => {
  const source = readFileSync(new URL('../lib/ai/cos/suggestedFollowups.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /callLocalModel|fallbackFollowups|repairFollowups|validateSuggestedFollowups/)
  assert.match(source, /return \[\]/)
})

test('all existing response decorators consume the disabled compatibility seam', () => {
  const primary = readFileSync(new URL('../app/api/cos-primary/route.ts', import.meta.url), 'utf8')
  const browser = readFileSync(new URL('../app/api/cos-browser/route.ts', import.meta.url), 'utf8')
  assert.match(primary, /suggestFollowups/)
  assert.match(browser, /suggestFollowups/)
})

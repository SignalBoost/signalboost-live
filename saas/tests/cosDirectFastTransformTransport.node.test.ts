import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isFastTextTransform } from '../lib/ai/cos/fastTextTransformIntent.ts'

test('middleware fast edits delegate to the canonical COS editor', () => {
  const fast = readFileSync(join(process.cwd(), 'app/api/cos-fast-transform/route.ts'), 'utf8')
  const primary = readFileSync(join(process.cwd(), 'app/api/cos-primary/route.ts'), 'utf8')

  assert.match(fast, /provenanceBrowserPost/)
  assert.match(fast, /headers\.delete\('x-signalboost-fast-transform-attempted'\)/)
  assert.doesNotMatch(fast, /runDirectFastTextEdit/)
  assert.doesNotMatch(fast, /cos-fast-text-edit-direct/)

  assert.match(primary, /if\(!fastEditAlreadyAttempted&&isFastTextTransform/)
  assert.match(primary, /feature:'cos_fast_text_transform'/)
  assert.match(primary, /deepseek-ai\/DeepSeek-V4-Flash-0731/)
  assert.match(primary, /FAST_TEXT_TRANSFORM_ATTEMPT_MS = 9_000/)
  assert.match(primary, /FAST_TEXT_TRANSFORM_TIMEOUT_MS = 18_000/)
})


test('middleware uses the shared contextual classifier', () => {
  const proxy = readFileSync(join(process.cwd(), 'proxy.ts'), 'utf8')
  assert.match(proxy, /fastTextTransformRequest\(req\)/)
  assert.match(proxy, /isFastTextTransform\(latestUser, \{ previousAssistant \}\)/)
  assert.match(proxy, /target\.pathname = '\/api\/cos-fast-transform'/)
  assert.doesNotMatch(proxy, /DIRECT_FAST_TEXT_TRANSFORM/)
})

test('edit prefix cannot swallow a factual CAP question', () => {
  assert.equal(
    isFastTextTransform('edit - can you explain what CAPs are and who is allowed to open them?'),
    false,
  )
  assert.equal(
    isFastTextTransform('edit - I see, sorry, they came last week. I think they are called CAPs. They come unclassified and must be opened by cleared Americans.'),
    true,
  )
  assert.equal(
    isFastTextTransform('fix grammar of the following: they came last week and must be opened by cleared Americans.'),
    true,
  )
})

test('terse edit continuation requires a real prior draft', () => {
  assert.equal(isFastTextTransform('shorten', { previousAssistant: 'This is a usable draft that can be shortened.' }), true)
  assert.equal(isFastTextTransform('edit', { previousAssistant: 'COS could not complete this text edit within the fast-path deadline.' }), false)
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isFastTextTransform } from '../lib/ai/cos/fastTextTransformIntent.ts'

test('browser fast edits stay bounded but fall through after a miss', () => {
  const browser = readFileSync(join(process.cwd(), 'app/api/cos-browser/route.ts'), 'utf8')
  const fast = readFileSync(join(process.cwd(), 'app/api/cos-fast-transform/route.ts'), 'utf8')
  const direct = readFileSync(join(process.cwd(), 'lib/ai/cos/fastTextEditDirect.ts'), 'utf8')

  const fastBranch = browser.indexOf("if (!fastEditAlreadyAttempted && isFastTextTransform")
  const auth = browser.indexOf('const access = await getAccess()')
  assert.ok(fastBranch >= 0 && auth > fastBranch, 'verified fast edit must run before auth')
  assert.match(browser, /x-signalboost-fast-transform-attempted/)
  assert.doesNotMatch(browser, /cos-fast-text-edit-direct-timeout/)

  assert.match(fast, /fallThroughToNormalCos/)
  assert.match(fast, /provenanceBrowserPost/)
  assert.match(fast, /x-signalboost-fast-transform-attempted/)
  assert.doesNotMatch(fast, /cos-fast-text-edit-direct-timeout/)

  assert.match(direct, /new AbortController\(\)/)
  assert.match(direct, /signal: controller\.signal/)
  assert.match(direct, /setTimeout\(\(\) => controller\.abort\(\), input\.timeoutMs\)/)
  assert.match(direct, /DEFAULT_DEADLINE_MS = 20_000/)
  assert.match(direct, /DEFAULT_ATTEMPT_MS = 6_000/)
  assert.match(direct, /reasoning_effort: 'none'/)
  assert.match(direct, /COS_FAST_TEXT_MODEL/)
  assert.match(direct, /deepseek-ai\/DeepSeek-V4-Flash/)
  assert.match(direct, /for \(const model of modelCandidates\(baseUrl, configuredModel\)\)/)
  assert.match(direct, /Math\.min\(attemptMs\(\), remainingMs\)/)
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

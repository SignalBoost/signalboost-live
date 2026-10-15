import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const sourceUrl = new URL('../app/api/cos-primary/route.ts', import.meta.url)

test('canonical COS edits never run unbounded model or QA fallback cascades', async () => {
  const source = await readFile(sourceUrl, 'utf8')
  const fast = source.slice(source.indexOf('async function runFastTextTransform('), source.indexOf('export const FAST_AUTHORING_TIMEOUT_MS'))
  assert.match(source, /FAST_TEXT_TRANSFORM_TIMEOUT_MS\s*=\s*15_000/)
  assert.match(source, /FAST_TEXT_TRANSFORM_ATTEMPT_MS\s*=\s*7_000/)
  assert.match(fast, /const models=\[\.\.\.new Set\(\[editorModel,alternateModel\]/)
  // The primary editor gets the attempt budget; the alternate is a hedge started after
  // FAST_TEXT_HEDGE_MS (or at once if the primary fails), with its own 5.5 s bound.
  assert.match(source, /FAST_TEXT_HEDGE_MS = 3_000/)
  assert.match(fast, /draftWith\(models\[0\],FAST_TEXT_TRANSFORM_ATTEMPT_MS,'fast_editor_primary'\)/)
  assert.match(fast, /draftWith\(models\[1\],5_500,'fast_editor_hedge'\)/)
  assert.match(fast, /const timeLeft=FAST_TEXT_TRANSFORM_TIMEOUT_MS-/)
  assert.match(fast, /selfReviewedDraft:true/)
  assert.match(fast, /timeoutMs:attemptMs/)
  assert.match(fast, /disableThinking:true/)
  assert.match(fast, /allowConfiguredFallback:false/)
  assert.match(fast, /persistUsage:false/)
  assert.match(fast, /zai-org\/GLM-5\.3-Flash/)
  const branch = source.slice(source.indexOf('if(!artifactContinuation&&!fastEditAlreadyAttempted&&isFastTextTransform('), source.indexOf('const hasAttachments='))
  assert.match(branch, /cos-fast-text-transform-unavailable/)
  assert.match(branch, /status:503/)
  assert.doesNotMatch(branch, /buildHonestRefusalReply|tryCOSFirstAnswer/)
})

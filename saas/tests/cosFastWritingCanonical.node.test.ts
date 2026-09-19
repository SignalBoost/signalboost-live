import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { isAuthoringObjectiveWithoutLiveLookup, isCosCodingObjective } from '../lib/ai/cos/cosReasoningRolePolicy.ts'

const primary = readFileSync(new URL('../app/api/cos-primary/route.ts', import.meta.url), 'utf8')
const browser = readFileSync(new URL('../app/api/cos-browser/route.ts', import.meta.url), 'utf8')

const ANNIVERSARY = 'my inlaws today celebrate their wedding 50 aniversary. Please write a nice messsage to them in Polish and show me the english translation'

test('anniversary writing qualifies for canonical fast authoring and is not coding', () => {
  assert.equal(isAuthoringObjectiveWithoutLiveLookup(ANNIVERSARY), true)
  assert.equal(isCosCodingObjective(ANNIVERSARY), false)
})

test('canonical COS fast authoring runs before auth, retrieval, and enterprise reasoning', () => {
  const eligible = primary.indexOf('const fastAuthoringEligible=')
  const run = primary.indexOf('const fast=await runFastAuthoring(input)', eligible)
  const auth = primary.indexOf('const access=await getAccess()', eligible)
  const enterprise = primary.indexOf('tryCOSFirstAnswer({prompt:reasoningPrompt', eligible)

  assert.ok(eligible > 0)
  assert.ok(run > eligible)
  assert.ok(auth > run)
  assert.ok(enterprise > auth)
  assert.match(primary, /deepseek-ai\/DeepSeek-V4-Flash/)
  assert.match(primary, /FAST_AUTHORING_TIMEOUT_MS = 18_000/)
  assert.match(primary, /FAST_AUTHORING_ATTEMPT_MS = 9_000/)
  assert.match(primary, /usageContext:\{feature:'cos_fast_authoring'/)
  assert.match(primary, /source:'cos-fast-authoring'/)
  assert.match(primary, /startsWith\('cos-fast-authoring'\)/)
})

test('browser direct edits delegate to canonical COS instead of running a competing reasoner', () => {
  assert.doesNotMatch(browser, /tryDirectTextTransformation/)
  const direct = browser.indexOf('if (directTextTransformation && !directTextHasAttachments)')
  const delegate = browser.indexOf('cosPrimaryPost(req)', direct)
  const identity = browser.indexOf('resolveSemanticPublicIdentity(prompt)')
  assert.ok(direct > 0)
  assert.ok(delegate > direct)
  assert.ok(identity > delegate)
})

test('canonical edit lane shares the same bounded interactive budget', () => {
  assert.match(primary, /FAST_TEXT_TRANSFORM_TIMEOUT_MS = 18_000/)
  assert.match(primary, /FAST_TEXT_TRANSFORM_ATTEMPT_MS = 9_000/)
  assert.match(primary, /usageContext:\{feature:'cos_fast_text_transform'/)
})

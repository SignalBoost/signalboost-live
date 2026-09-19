import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { isAuthoringObjectiveWithoutLiveLookup, isCosCodingObjective } from '../lib/ai/cos/cosReasoningRolePolicy.ts'

const primary = readFileSync(new URL('../app/api/cos-primary/route.ts', import.meta.url), 'utf8')
const browser = readFileSync(new URL('../app/api/cos-browser/route.ts', import.meta.url), 'utf8')

const ANNIVERSARY = 'my inlaws today celebrate their wedding 50 aniversary. Please write a nice messsage to them in Polish and show me the english translation'

const MULTILINGUAL_AUTHORING = [
  'Create a warm greeting for my parents for their golden anniversary and give me Polish and English versions.',
  'Napisz ciepłe życzenia dla moich rodziców z okazji złotych godów.',
  'Escreva uma mensagem carinhosa para meus sogros pelas bodas de ouro.',
  'Redacta un mensaje bonito para mis suegros por sus bodas de oro.',
  'Напиши тёплое поздравление моим родителям с золотой свадьбой.',
] as const

test('anniversary writing qualifies for canonical fast authoring and is not coding', () => {
  assert.equal(isAuthoringObjectiveWithoutLiveLookup(ANNIVERSARY), true)
  assert.equal(isCosCodingObjective(ANNIVERSARY), false)
})

test('common human authoring phrasing is not tied to the English routing vocabulary', () => {
  for (const prompt of MULTILINGUAL_AUTHORING) {
    assert.equal(isAuthoringObjectiveWithoutLiveLookup(prompt), true, prompt)
    assert.equal(isCosCodingObjective(prompt), false, prompt)
  }
})

test('production routing has a semantic authoring rescue and does not branch on the anniversary fixture text', () => {
  assert.match(primary, /semanticIntentIsSelfContainedContentGeneration/)
  assert.match(primary, /cos-fast-authoring-semantic-rescue/)
  assert.doesNotMatch(primary, /my inlaws today celebrate their wedding 50 aniversary/i)
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
  assert.match(primary, /source='cos-fast-authoring'/)
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

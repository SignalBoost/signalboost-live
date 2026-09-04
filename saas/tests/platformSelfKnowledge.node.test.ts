// saas/tests/platformSelfKnowledgeEscape.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isPlatformSelfKnowledgePrompt } from '../lib/ai/cos/cosFreshnessPolicy.ts'

// Production 2026-09-04: an edit request came back as the canned implementation-disclosure reply.
// cosFirstAnswerCore answers a platform self-knowledge prompt deterministically BEFORE reaching
// tryDirectTextTransformation, so a misclassification here means the editor never runs at all.

test('an edit request mentioning the platform is not a self-knowledge question', () => {
  assert.equal(isPlatformSelfKnowledgePrompt('edit this in a diplomatic way for the platform model review'), false)
})

test('an edit request that names COS and a reasoner is still an edit request', () => {
  assert.equal(isPlatformSelfKnowledgePrompt('COS still not writing elegantly and in a diplomatic way, edit this: our reasoner model needs work'), false)
})

test('a pasted draft carrying an instruction reaches the editor', () => {
  const prompt = 'edit in a very very diplomatic way - I struggle all night whether I should address this email chain again, but as a colleague noted, if not for us we should help others.'
  assert.equal(isPlatformSelfKnowledgePrompt(prompt), false)
})

test('a translation request naming the platform keeps its own path', () => {
  assert.equal(isPlatformSelfKnowledgePrompt('translate to Spanish: our platform model card is published quarterly'), false)
})

test('the genuine owner stack question is still caught', () => {
  assert.equal(isPlatformSelfKnowledgePrompt('what is your model/specs?'), true)
})

test('the genuine platform stack question is still caught', () => {
  assert.equal(isPlatformSelfKnowledgePrompt('what model powers COS?'), true)
  assert.equal(isPlatformSelfKnowledgePrompt('what llm does this platform use'), true)
})

test('an empty or whitespace prompt is not a self-knowledge question', () => {
  assert.equal(isPlatformSelfKnowledgePrompt(''), false)
  assert.equal(isPlatformSelfKnowledgePrompt('   '), false)
})

test('the escape is decided by intent detectors, not by new vocabulary', () => {
  const source = readFileSync(join(process.cwd(), 'lib/ai/cos/cosFreshnessPolicy.ts'), 'utf8')
  const fn = source.slice(source.indexOf('export function isPlatformSelfKnowledgePrompt'))
  const body = fn.slice(0, fn.indexOf('\n}'))
  assert.ok(body.indexOf('isContentGenerationRequest') < body.indexOf('isSignalboostIdentityQuestion'), 'authoring escape must precede the hard predicates')
  assert.ok(body.indexOf('detectDirectTextTransformation') < body.indexOf('PLATFORM_STACK_ASK'), 'transformation escape must precede the stack regex')
})

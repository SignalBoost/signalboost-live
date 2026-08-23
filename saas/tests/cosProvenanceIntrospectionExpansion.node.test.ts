import assert from 'node:assert/strict'
import test from 'node:test'
import { asksWhereTheAnswerCameFrom } from '../lib/ai/cos/provenanceIntrospectionIntent.ts'

test('long operator provenance requests bypass the casual-phrase length cap', () => {
  const request = 'Show me the complete provenance for the answer you just gave. Identify the primary model that generated the reasoning. List every COS internal system that materially contributed: semantic cache, Enterprise Memory, Knowledge Graph, learned corpus, autonomous research, local reasoning engine, and any external AI provider. For each one, state whether it was actually used, what evidence it contributed, and whether any new knowledge was retrieved or learned during this request.'
  assert.ok(request.length > 300)
  assert.equal(asksWhereTheAnswerCameFrom(request), true)
})

test('provenance and contributor phrasing works across supported languages', () => {
  for (const input of [
    'show me the provenance of your answer',
    'what is the provenance of that answer?',
    'show me the execution telemetry for your reply',
    'which systems contributed to that answer?',
    'list every system that contributed to your last answer',
    'pokaż mi proweniencję tej odpowiedzi',
    'покажи происхождение этого ответа',
  ]) assert.equal(asksWhereTheAnswerCameFrom(input), true, input)
})

test('ordinary provenance and contributor topics remain content questions', () => {
  for (const input of [
    'what is the provenance of this painting?',
    'trace the provenance of this artifact for the museum catalogue',
    'which suppliers contributed to the delay?',
    'what systems do you recommend for CRM?',
  ]) assert.equal(asksWhereTheAnswerCameFrom(input), false, input)
})

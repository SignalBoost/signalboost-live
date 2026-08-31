import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const synthesis = readFileSync(new URL('../lib/ai/cos/freshEvidenceSynthesisContract.ts', import.meta.url), 'utf8')

const motivatingTopicTerms = /pay gap|gender pay|women earn|men earn|equal work/i

test('umbrella predicates separate descriptive observations from stronger causal and legal claims', () => {
  assert.match(synthesis, /surface predicate can hide multiple materially different propositions/i)
  assert.match(synthesis, /descriptive difference or association distinct from explanation, causation, intent, discriminatory treatment, or a legal\/normative violation/i)
  assert.match(synthesis, /observed group-level disparity or adjusted residual does not by itself establish why the difference exists/i)
  assert.match(synthesis, /group membership caused it/i)
  assert.match(synthesis, /any conduct was unlawful/i)
  assert.doesNotMatch(synthesis, motivatingTopicTerms)
})

test('semantic ambiguity can require a neutral evidence map even when descriptive sources agree', () => {
  assert.match(synthesis, /umbrella term that reasonably spans both a descriptive proposition and a stronger causal, intentional, discriminatory, or legal proposition/i)
  assert.match(synthesis, /presentationMode="neutral_evidence_map" and directBinaryAnswerSafe=false even when the descriptive evidence is internally consistent/i)
  assert.match(synthesis, /materially different control structures, comparison bases, or operational definitions answer different readings/i)
  assert.match(synthesis, /single yes\/no verdict is not safe unless the QUESTION itself clearly limits the meaning/i)
})

test('answer synthesis never promotes a statistical difference into proof of wrongdoing', () => {
  assert.match(synthesis, /Keep descriptive evidence separate from explanation, causation, intent, discrimination, and legal conclusions/i)
  assert.match(synthesis, /statistical disparity, association, or adjusted residual may establish a measured difference; it does not by itself establish why the difference exists or that unlawful treatment occurred/i)
  assert.match(synthesis, /state that boundary explicitly rather than letting the descriptive result stand in for the stronger claim/i)
})

test('independent faithfulness review can override an unsafe binary framing without deterministic topic code', () => {
  assert.match(synthesis, /Independently evaluate whether the answer’s opening and framing are semantically safe/i)
  assert.match(synthesis, /do not blindly defer to directBinaryAnswerSafe/i)
  assert.match(synthesis, /yes\/no lead can reasonably be read as applying to a stronger causal, intentional, discriminatory, or legal proposition/i)
  assert.match(synthesis, /measured disparity or adjusted residual proves motive, intent, causation, discrimination, or illegality/i)
  assert.doesNotMatch(synthesis, motivatingTopicTerms)
})

test('neural repair removes a verdict that collapsed descriptive and stronger meanings even if the plan allowed it', () => {
  assert.match(synthesis, /REMOVE the binary lead even when directBinaryAnswerSafe=true/i)
  assert.match(synthesis, /directBinaryAnswerSafe permits a binary lead; it never requires one/i)
  assert.match(synthesis, /keep descriptive observations distinct from stronger causal, intentional, discriminatory, or legal interpretations/i)
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { COS_GENERAL_REASONING_DISCIPLINE } from '../lib/ai/cos/cosGeneralReasoningDiscipline.ts'

const read = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8')

test('general reasoning discipline resolves ambiguity without exposing hidden chain of thought', () => {
  assert.match(COS_GENERAL_REASONING_DISCIPLINE, /unresolved referents/i)
  assert.match(COS_GENERAL_REASONING_DISCIPLINE, /comparison baselines/i)
  assert.match(COS_GENERAL_REASONING_DISCIPLINE, /ask one concise clarification/i)
  assert.match(COS_GENERAL_REASONING_DISCIPLINE, /never invent missing context/i)
  assert.match(COS_GENERAL_REASONING_DISCIPLINE, /do not expose hidden scratchpad or chain-of-thought/i)
  assert.match(COS_GENERAL_REASONING_DISCIPLINE, /strict JSON/i)
})

test('every reasoning worker receives the general discipline, including primary', () => {
  const source = read('../lib/ai/cos/cosReasoningWorkers.ts')
  assert.match(source, /COS_GENERAL_REASONING_DISCIPLINE/)
  assert.match(source, /\[request\.systemPrompt, COS_GENERAL_REASONING_DISCIPLINE, roleGuidance\]/)
})

test('validated skill retrieval can use structural triggers but never bypasses lifecycle status', () => {
  const source = read('../lib/ai/cos/cognitiveSkillContext.ts')
  assert.match(source, /detectCognitiveReasoningTriggers/)
  assert.match(source, /matchingCognitiveReasoningTriggers/)
  assert.match(source, /\.in\('status', \['validated', 'learned', 'mastered'\]\)/)
  assert.doesNotMatch(source, /\.in\('status', \[[^\]]*'encountered'/)
})

test('seeded generalized ambiguity procedure is falsifiable candidate, not fake learned knowledge', () => {
  const migration = read('../supabase/migrations/20260822_cos_general_ambiguity_reasoning_candidate.sql')
  assert.match(migration, /reasoning\.context_ambiguity_resolution\.v1/)
  assert.match(migration, /'deictic_predicate_question'/)
  assert.match(migration, /'unresolved_referent_followup'/)
  assert.match(migration, /'underspecified_comparison'/)
  assert.match(migration, /'vague_temporal_reference'/)
  assert.match(migration, /'observables'/)
  assert.match(migration, /'falsifiers'/)
  assert.match(migration, /'encountered'/)
  assert.match(migration, /automaticSkillPromotionAllowed', false/)
  assert.match(migration, /requiresIndependentHoldouts', true/)
  assert.doesNotMatch(migration, /'validated'\s*,\s*true/)
})

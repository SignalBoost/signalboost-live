import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { COS_GENERAL_REASONING_DISCIPLINE } from '../lib/ai/cos/cosGeneralReasoningDiscipline.ts'

const read = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8')

test('global reasoning guidance is safety-only and does not smuggle an unvalidated ambiguity skill into live prompts', () => {
  assert.match(COS_GENERAL_REASONING_DISCIPLINE, /do not invent missing context/i)
  assert.match(COS_GENERAL_REASONING_DISCIPLINE, /validated cognitive-skill path/i)
  assert.match(COS_GENERAL_REASONING_DISCIPLINE, /do not expose hidden scratchpad or chain-of-thought/i)
  assert.match(COS_GENERAL_REASONING_DISCIPLINE, /strict JSON/i)
  assert.doesNotMatch(COS_GENERAL_REASONING_DISCIPLINE, /ask one concise clarification/i)
  assert.doesNotMatch(COS_GENERAL_REASONING_DISCIPLINE, /unresolved referents/i)
  assert.doesNotMatch(COS_GENERAL_REASONING_DISCIPLINE, /comparison baselines/i)
})

test('crisis and compliance scenarios do not manufacture legal obligations', () => {
  const rule = COS_GENERAL_REASONING_DISCIPLINE
  assert.match(rule, /do not turn prudent governance advice into a claimed legal obligation/i)
  assert.match(rule, /do not name statutes or regulatory regimes such as GDPR or CCPA/i)
  assert.match(rule, /Legal\/Privacy\/Compliance must determine the notification duties, scope, recipients, and deadlines/i)
  assert.match(rule, /Customer disclosure is a decision point unless the supplied facts or verified authority establish a mandatory notice/i)
  assert.match(rule, /do not invent a requirement that a particular executive or Legal must approve/i)
})

test('a stakeholder secrecy proposal does not cause COS to refuse a legitimate crisis protocol request', () => {
  assert.match(COS_GENERAL_REASONING_DISCIPLINE, /not a request to conceal misconduct merely because one stakeholder in the scenario proposes secrecy/i)
  assert.match(COS_GENERAL_REASONING_DISCIPLINE, /Draft the protocol directly/i)
})

test('backup brain carries the same crisis legal-grounding invariants', () => {
  const brain = read('../../cos-core/brain.md')
  assert.match(brain, /never claim that a statute, regulation, customer-notification duty, approval authority, or legal deadline applies/i)
  assert.match(brain, /Do not name GDPR, CCPA/i)
  assert.match(brain, /Legal\/Privacy\/Compliance assessment a decision gate/i)
  assert.match(brain, /proposal to keep an incident quiet does not make a request for a crisis-response protocol improper/i)
})

test('every reasoning worker receives only the lifecycle-neutral safety invariants, including primary', () => {
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

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  acceptFreshEvidencePredicateAudit,
  applyFreshEvidencePredicateAudit,
  freshEvidencePredicateAuditPrompt,
  freshEvidencePredicateAuditSystemPrompt,
} from '../lib/ai/cos/freshEvidencePredicateAudit.ts'
import {
  acceptFreshEvidenceSynthesis,
  type FreshEvidenceSemanticPlan,
} from '../lib/ai/cos/freshEvidenceSynthesisContract.ts'

const motivatingTopicTerms = /pay gap|gender pay|women earn|men earn|equal work/i

const sources = [
  { id: 'LIVE1', title: 'Broad measure', url: 'https://stats.example.org/broad', snippet: 'A broad population measure reports a difference between two groups.' },
  { id: 'LIVE2', title: 'Adjusted measure', url: 'https://research.example.edu/adjusted', snippet: 'An adjusted comparison reports a smaller residual difference after controls.' },
] as any

const plannerBinaryPlan: FreshEvidenceSemanticPlan = {
  presentationMode: 'direct',
  directBinaryAnswerSafe: true,
  scopes: [
    { scopeId: 'S1', label: 'broad population difference', finding: 'The broad measure reports a difference.', evidenceIds: ['LIVE1'] },
    { scopeId: 'S2', label: 'adjusted comparison', finding: 'The adjusted comparison reports a smaller residual difference.', evidenceIds: ['LIVE2'] },
  ],
}

const plannerNeutralPlan: FreshEvidenceSemanticPlan = {
  ...plannerBinaryPlan,
  presentationMode: 'neutral_evidence_map',
  directBinaryAnswerSafe: false,
}

const unsafeAudit = {
  binaryVerdictSafe: false,
  requiresNeutralEvidenceMap: true,
  ambiguityKinds: ['descriptive_vs_causal', 'factual_vs_legal'],
} as const

const safeAudit = {
  binaryVerdictSafe: true,
  requiresNeutralEvidenceMap: false,
  ambiguityKinds: [],
} as const

test('predicate audit is structurally independent from the semantic plan and candidate answer', () => {
  const prompt = freshEvidencePredicateAuditPrompt({ input: 'Does this group difference exist?', sources, retrievedAt: '2026-08-31T02:23:11.000Z' })
  const system = freshEvidencePredicateAuditSystemPrompt('en')
  assert.match(system, /INDEPENDENT BINARY-VERDICT ADVERSARIAL AUDITOR/)
  assert.match(system, /do not assume a prior planner or draft exists/i)
  assert.match(prompt, /QUESTION \+ LIVE EVIDENCE|QUESTION:/i)
  assert.doesNotMatch(prompt, /SEMANTIC SCOPE PLAN|CANDIDATE ANSWER/)
  assert.doesNotMatch(`${prompt}\n${system}`, motivatingTopicTerms)
})

test('audit parser accepts only coherent safe or neutral verdicts', () => {
  assert.deepEqual(acceptFreshEvidencePredicateAudit(JSON.stringify(unsafeAudit)), unsafeAudit)
  assert.deepEqual(acceptFreshEvidencePredicateAudit(JSON.stringify(safeAudit)), safeAudit)
  assert.equal(acceptFreshEvidencePredicateAudit(JSON.stringify({
    binaryVerdictSafe: true,
    requiresNeutralEvidenceMap: true,
    ambiguityKinds: ['descriptive_vs_causal'],
  })), null)
  assert.equal(acceptFreshEvidencePredicateAudit(JSON.stringify({
    binaryVerdictSafe: false,
    requiresNeutralEvidenceMap: true,
    ambiguityKinds: [],
  })), null)
  assert.equal(acceptFreshEvidencePredicateAudit(JSON.stringify({
    binaryVerdictSafe: false,
    requiresNeutralEvidenceMap: true,
    ambiguityKinds: ['invented_kind'],
  })), null)
})

test('two-key release overrides a planner binary verdict when the independent audit finds material ambiguity', () => {
  const effective = applyFreshEvidencePredicateAudit(plannerBinaryPlan, unsafeAudit as any)
  assert.equal(effective.presentationMode, 'neutral_evidence_map')
  assert.equal(effective.directBinaryAnswerSafe, false)
  assert.deepEqual(effective.scopes, plannerBinaryPlan.scopes)
})

test('missing or malformed second key fails safe to neutral presentation without losing the answer scopes', () => {
  const missing = applyFreshEvidencePredicateAudit(plannerBinaryPlan, null)
  assert.equal(missing.presentationMode, 'neutral_evidence_map')
  assert.equal(missing.directBinaryAnswerSafe, false)
  assert.deepEqual(missing.scopes, plannerBinaryPlan.scopes)
})

test('binary framing survives only when both neural decisions affirm it', () => {
  const effective = applyFreshEvidencePredicateAudit(plannerBinaryPlan, safeAudit as any)
  assert.deepEqual(effective, plannerBinaryPlan)
})

test('an already-neutral planner can never be made binary-safe by the audit', () => {
  assert.deepEqual(applyFreshEvidencePredicateAudit(plannerNeutralPlan, safeAudit as any), plannerNeutralPlan)
})

test('the exact runtime failure class cannot release a Yes lead after the independent audit overrides the planner', () => {
  const effective = applyFreshEvidencePredicateAudit(plannerBinaryPlan, unsafeAudit as any)
  const rejected = acceptFreshEvidenceSynthesis({
    text: JSON.stringify({
      answer: 'Yes. The broad measure and adjusted comparison both report a difference.',
      evidenceIds: ['LIVE1', 'LIVE2'],
      scopeIds: ['S1', 'S2'],
    }),
    input: 'Does this group difference exist?',
    sources,
    semanticPlan: effective,
  })
  assert.equal(rejected, null)

  const accepted = acceptFreshEvidenceSynthesis({
    text: JSON.stringify({
      answer: 'The evidence measures two different things: a broad population difference and a smaller adjusted residual. Those descriptive results do not by themselves establish why the difference exists or any stronger causal or legal conclusion.',
      evidenceIds: ['LIVE1', 'LIVE2'],
      scopeIds: ['S1', 'S2'],
    }),
    input: 'Does this group difference exist?',
    sources,
    semanticPlan: effective,
  })
  assert.ok(accepted)
  assert.doesNotMatch(accepted.answer, /^\s*(?:yes|no)\b/i)
})

test('local Production path requires the audit before an answer is synthesized', () => {
  const local = readFileSync(new URL('../lib/ai/cos/freshEvidenceLocalSynthesis.ts', import.meta.url), 'utf8')
  assert.match(local, /auditBinaryRelease/)
  assert.match(local, /applyFreshEvidencePredicateAudit/)
  assert.match(local, /predicateAuditRequired/)
  assert.match(local, /\[cos-fresh-predicate-audit\]/)
  const auditIndex = local.indexOf('semanticPlan = applyFreshEvidencePredicateAudit')
  const answerIndex = local.indexOf('prompt: freshEvidenceSynthesisPrompt')
  assert.ok(auditIndex >= 0 && answerIndex > auditIndex, 'binary audit must run before answer synthesis')
})

test('governed provider fallback uses the same two-key binary-release rule', () => {
  const external = readFileSync(new URL('../lib/ai/cos/freshEvidenceExternalSynthesis.ts', import.meta.url), 'utf8')
  assert.match(external, /freshEvidencePredicateAuditPrompt/)
  assert.match(external, /acceptFreshEvidencePredicateAudit/)
  assert.match(external, /applyFreshEvidencePredicateAudit/)
  assert.match(external, /cos-fresh-external-predicate-audit/)
})

test('runtime predicate-audit implementation contains no motivating-topic classifier or template', () => {
  const audit = readFileSync(new URL('../lib/ai/cos/freshEvidencePredicateAudit.ts', import.meta.url), 'utf8')
  const local = readFileSync(new URL('../lib/ai/cos/freshEvidenceLocalSynthesis.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(audit, motivatingTopicTerms)
  assert.doesNotMatch(local, motivatingTopicTerms)
  assert.match(audit, /descriptive_vs_causal/)
  assert.match(audit, /factual_vs_legal/)
  assert.match(audit, /two-key release rule/i)
})

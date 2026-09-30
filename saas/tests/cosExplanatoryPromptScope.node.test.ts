import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { COS_REASONER_SYSTEM_PROMPT } from '../lib/ai/cos/cosFirstAnswerEnterprise.ts'
import { COS_EXPLANATORY_REASONING_DISCIPLINE, COS_GENERAL_REASONING_DISCIPLINE } from '../lib/ai/cos/cosGeneralReasoningDiscipline.ts'
import { COS_BEHAVIORAL_CONTRACT } from '../lib/ai/cos/cosBehavioralContract.ts'
import { EXPLANATORY_QUESTION_SCOPE_LINE, reasonerPromptScopeFor } from '../lib/ai/cos/cosReasonerPromptScope.ts'
import { estimateQwenContextTokens } from '../lib/ai/context-window-manager.ts'

const owner = (question: string) => COS_REASONER_SYSTEM_PROMPT('English', { privileged: true, audience: 'owner' as never, question })

test('general "what is / how does" questions are scoped as explanatory; tasks, situations and figures are not', () => {
  for (const question of [
    'What does a Kubernetes ClusterIP Service do?',
    'How does a Kubernetes NetworkPolicy restrict traffic between pods?',
    'What is the difference between a Deployment and a StatefulSet, and when would you use each?',
    'How does Kubernetes keep applications reliable when a node goes down?',
  ]) assert.equal(reasonerPromptScopeFor(question, 'English').explanatory, true, question)
  for (const question of [
    'Should we move our API to Kubernetes?',
    'Write a Deployment manifest for nginx',
    'Why is my pod stuck in CrashLoopBackOff?',
    'What is COS University?',
    'How much does a GPU cost per hour?',
    'What does "we are fine" mean in this message?',
    'What do you remember about me?',
    '¿Qué es un pod de Kubernetes?',
  ]) assert.equal(reasonerPromptScopeFor(question, 'English').explanatory, false, question)
})

test('production 2026-09-30 06:06 UTC: the ClusterIP question read ~10K instruction tokens; scoped it reads under 4K', () => {
  const question = 'What does a Kubernetes ClusterIP Service do?'
  const prompt = owner(question)
  const tokens = estimateQwenContextTokens(prompt) + estimateQwenContextTokens(COS_EXPLANATORY_REASONING_DISCIPLINE)
  assert.ok(tokens < 4_000, `instruction tokens ${tokens}`)
  for (const gone of ['WORK COMPLETION', 'STRATEGY AND OPERATIONAL ANCHOR', 'OWNER-TRUST RELEASE AUDIT', 'DECISION RIGHTS:', 'RE-READ YOUR OWN ANSWER', 'NEVER INVENT A DATE', 'AN UNSPECIFIED TASK SHAPE', 'MISSING EVIDENCE IS NOT A REASON', 'OWNER-APPROVED PLATFORM GLOSSARY', 'SELF-KNOWLEDGE AND IMPROVEMENT BOUNDARIES']) {
    assert.ok(!prompt.includes(gone), gone)
  }
  // What the answer itself depends on stays: length rule, evidence citation, first-person writing, honesty, the JSON contract.
  for (const kept of ['CHAT ANSWER LENGTH', 'CITING INTERNAL EVIDENCE:', 'NEVER cite an item that did not change what you wrote', 'DELIVER CONCLUSIONS', 'HONESTY:', 'Return ONLY strict JSON', 'Reply in English.', EXPLANATORY_QUESTION_SCOPE_LINE]) {
    assert.ok(prompt.includes(kept), kept)
  }
  assert.ok(prompt.indexOf(EXPLANATORY_QUESTION_SCOPE_LINE) < prompt.indexOf('Reply in English.'))
})

test('every explanatory question gets the identical instructions, so the RunPod server can reuse its cached prefix', () => {
  assert.equal(owner('What does a Kubernetes ClusterIP Service do?'), owner('What is a Kubernetes namespace used for?'))
})

test('any other request keeps the full instructions and the full discipline', () => {
  const prompt = owner('Should we move our API to Kubernetes?')
  assert.ok(!prompt.includes(EXPLANATORY_QUESTION_SCOPE_LINE))
  for (const kept of ['WORK COMPLETION', 'DECISION RIGHTS:', 'RE-READ YOUR OWN ANSWER', 'AN UNSPECIFIED TASK SHAPE']) assert.ok(prompt.includes(kept), kept)
  assert.ok(COS_GENERAL_REASONING_DISCIPLINE.startsWith(COS_BEHAVIORAL_CONTRACT))
  assert.match(COS_GENERAL_REASONING_DISCIPLINE, /Cash exhaustion, revenue change/)
})

test('the explanatory discipline keeps the contract version, priority, honesty and output-contract lines verbatim', () => {
  const compact = COS_EXPLANATORY_REASONING_DISCIPLINE
  assert.ok(compact.length < COS_GENERAL_REASONING_DISCIPLINE.length / 2)
  assert.match(compact, /COS BEHAVIORAL CONTRACT cos-behavioral-contract-v2/)
  assert.match(compact, /safety first, then accuracy/)
  assert.match(compact, /Do not invent missing context/)
  assert.match(compact, /Preserve every caller output contract/)
  assert.doesNotMatch(compact, /Cash exhaustion|GDPR|crisis-response/)
})

test('the reasoning workers pick the compact discipline only for a prompt carrying the explanatory scope line', () => {
  const source = readFileSync(new URL('../lib/ai/cos/cosReasoningWorkers.ts', import.meta.url), 'utf8')
  assert.match(source, /includes\(EXPLANATORY_QUESTION_SCOPE_LINE\)\) \{\n\s*return \[request\.systemPrompt, COS_EXPLANATORY_REASONING_DISCIPLINE, roleGuidance\]/)
  assert.match(source, /return \[request\.systemPrompt, COS_GENERAL_REASONING_DISCIPLINE, roleGuidance\]/)
})
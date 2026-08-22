import assert from 'node:assert/strict'
import test from 'node:test'
import {
  COS_ROLE_TOKEN_CAPS,
  boundedRoleMaxTokens,
  cosRoutingObjective,
  selectCosReasoningWorkerRole,
} from '../lib/ai/cos/cosReasoningRolePolicy.ts'

test('routing isolates the actual USER QUESTION from injected evidence', () => {
  const prompt = 'KNOWLEDGE GRAPH FACTS:\n[KG1] code compiler regression\n\nUSER QUESTION:\nWho is the current CEO of Example Corp?'
  assert.equal(cosRoutingObjective(prompt), 'Who is the current CEO of Example Corp?')
  assert.equal(selectCosReasoningWorkerRole(prompt).role, 'verifier')
})

test('fresh evidence Original question marker routes current facts to verifier', () => {
  const prompt = 'CURRENT-FACT LIVE EVIDENCE\nOriginal question: What is the latest release?\nSNIPPET: code implementation details'
  const decision = selectCosReasoningWorkerRole(prompt)
  assert.equal(decision.role, 'verifier')
  assert.equal(decision.objective, 'What is the latest release?')
})

test('code work routes to coder before broader explanatory signals', () => {
  assert.equal(selectCosReasoningWorkerRole('Explain how to refactor this TypeScript function.').role, 'coder')
})

test('diagnostic work routes to critic', () => {
  assert.equal(selectCosReasoningWorkerRole('Diagnose the root cause of a p95 latency regression.').role, 'critic')
})

test('stable explanatory research routes to researcher', () => {
  assert.equal(selectCosReasoningWorkerRole('What is semantic caching and how does it work?').role, 'researcher')
})

test('ordinary reasoning stays on primary', () => {
  assert.equal(selectCosReasoningWorkerRole('Give me three sensible priorities for tomorrow.').role, 'primary')
})

test('role token caps bound explicit budgets without increasing unspecified budgets', () => {
  assert.equal(boundedRoleMaxTokens('verifier', 6000), COS_ROLE_TOKEN_CAPS.verifier)
  assert.equal(boundedRoleMaxTokens('researcher', 1800), 1800)
  assert.equal(boundedRoleMaxTokens('coder', undefined), undefined)
})

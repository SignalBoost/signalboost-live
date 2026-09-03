// saas/tests/publicGovernanceParity.node.test.ts
//
// Source-level assertions. The public compatibility/governance pipeline now lives in
// cosFirstAnswerCore.ts; cosFirstAnswer.ts is the thin authenticated owner neural entrypoint.
// The gates themselves are unit-tested in releaseSignalSeverity.node.test.ts and the
// reasonerQuality suite.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const PUBLIC = readFileSync('lib/ai/cos/cosFirstAnswerCore.ts', 'utf8')
const OWNER = readFileSync('lib/ai/cos/cosFirstAnswerEnterprise.ts', 'utf8')
const ENTRYPOINT = readFileSync('lib/ai/cos/cosFirstAnswer.ts', 'utf8')

test('both channels run the executive claim gate', () => {
  for (const [name, source] of [['public', PUBLIC], ['owner', OWNER]] as const) {
    assert.match(source, /executiveDecisionUnsupportedClaims\(/, `${name} must run the claim gate`)
  }
})

test('both channels apply the blocking/advisory severity split', () => {
  for (const [name, source] of [['public', PUBLIC], ['owner', OWNER]] as const) {
    assert.match(source, /blockingReleaseSignals\(/, `${name} must use the severity split`)
  }
})

test('a failed public repair fails the turn closed with no draft', () => {
  const at = PUBLIC.indexOf('const publicClaimSignals')
  assert.ok(at > 0)
  const branch = PUBLIC.slice(at, at + 2600)
  assert.match(branch, /Public answer release rejected/)
  assert.ok(!/bestEffortReply\s*:/.test(branch), 'a draft with unsupported claims must not be surfaced')
})

test('the claim gate runs before scope and disclosure handling', () => {
  const claim = PUBLIC.indexOf('const publicClaimSignals')
  const scope = PUBLIC.indexOf('const scopeViolations = publicScenarioScopeViolations')
  const disclosure = PUBLIC.indexOf('const disclosures = publicDisclosureViolations')
  assert.ok(claim > 0 && scope > 0 && disclosure > 0)
  assert.ok(claim < scope, 'claim gate must precede scope repair')
  assert.ok(claim < disclosure, 'claim gate must precede disclosure redaction')
})

test('the public path still retrieves no private context', () => {
  const at = PUBLIC.indexOf('async function tryPublicStatelessAnswer')
  const body = PUBLIC.slice(at, PUBLIC.indexOf('async function tryFreshCurrentFact'))
  for (const forbidden of [
    /enterpriseMemory/i,
    /retrieveEnterpriseMemory/,
    /knowledgeGraph/i,
    /userMemory/i,
  ]) {
    assert.ok(!forbidden.test(body), `public path must not touch ${forbidden}`)
  }
})

test('public identity disclosure intercept still precedes every public reasoner call', () => {
  const intercept = PUBLIC.indexOf('if (asksAboutServiceIdentity(userRequest)) {')
  const firstCall = PUBLIC.indexOf('await callCosReasoner(')
  assert.ok(intercept > 0 && firstCall > 0)
  assert.ok(intercept < firstCall, 'public self-identity must never reach the model')
})

test('authenticated owner entrypoint is allowed to reason neurally before compatibility core', () => {
  const neural = ENTRYPOINT.indexOf('tryOwnerNeuralSelfKnowledge(input)')
  const core = ENTRYPOINT.indexOf('tryCoreCOSFirstAnswer(input)')
  assert.ok(neural > 0 && core > neural)
})

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

// ONE COS PIPELINE (owner decision 2026-09-26). Owner and public questions are reasoned by the same
// enterprise pipeline; the audience changes retrieval scope, the WHO IS ASKING block, and the release
// step — never which pipeline answers. These tests replace the old two-channel parity checks.

test('public questions run the same COS pipeline as the owner, then the public release step', () => {
  const branch = PUBLIC.slice(PUBLIC.indexOf('if (isPublicDeliveryScope()) {\n    // ONE COS PIPELINE'))
  assert.match(branch, /const brain = await tryEnterpriseCOSFirstAnswer\(input\)/)
  assert.match(branch, /return learnFromTurn\(input, await releaseToPublic\(input, brain\)\)/)
  assert.doesNotMatch(PUBLIC, /tryPublicStatelessAnswer/, 'the separate public-only pipeline must not return')
})

test('the one pipeline runs the executive claim gate with the severity split', () => {
  assert.match(OWNER, /executiveDecisionUnsupportedClaims\(/)
  assert.match(OWNER, /blockingReleaseSignals\(/)
})

test('a failed public release fails the turn closed with no draft', () => {
  const release = PUBLIC.slice(PUBLIC.indexOf('async function releaseToPublic('), PUBLIC.indexOf('function harvestCatalogNames('))
  for (const marker of ['Public answer violated scope isolation', 'Public answer disclosed internal information']) {
    const at = release.indexOf(marker)
    assert.ok(at > 0, marker)
    const failure = release.slice(release.lastIndexOf('return {', at), at + 200)
    assert.ok(!/bestEffortReply\s*:/.test(failure), `${marker}: no draft may be surfaced`)
  }
})

test('scope isolation runs before disclosure redaction in the public release step', () => {
  const release = PUBLIC.slice(PUBLIC.indexOf('async function releaseToPublic('), PUBLIC.indexOf('function harvestCatalogNames('))
  const scope = release.indexOf('const scopeViolations = publicScenarioScopeViolations')
  const disclosure = release.indexOf('const disclosures = publicDisclosureViolations')
  assert.ok(scope > 0 && disclosure > scope)
})

test('the public audience retrieves no private context', () => {
  const retrieval = OWNER.slice(OWNER.indexOf('async function retrieveInternalContext('), OWNER.indexOf('function executionFunnel('))
  assert.match(OWNER, /if \(isPublicDeliveryScope\(\)\) return 'public'/)
  assert.match(retrieval, /const publicAudience = audience === 'public'/)
  assert.match(retrieval, /if \(userId && !publicAudience\)/)
  assert.match(retrieval, /status:'not_available_public_delivery'/)
})

test('audiences never share cached answers', () => {
  assert.match(OWNER, /cosCacheTaskId\(`cos-first-answer:\$\{audience\}`, policyVersion\)/)
})

test('public identity disclosure intercept still precedes every public reasoner call', () => {
  const branchAt = PUBLIC.indexOf('if (isPublicDeliveryScope()) {\n    // ONE COS PIPELINE')
  const intercept = PUBLIC.indexOf('if (asksAboutServiceIdentity(userRequest)) {', branchAt)
  const call = PUBLIC.indexOf('await tryEnterpriseCOSFirstAnswer(input)', branchAt)
  assert.ok(branchAt > 0 && intercept > branchAt && call > intercept, 'public self-identity must never reach the model')
})

test('owner self-knowledge releases deterministic runtime facts before bounded neural fallback', () => {
  const guard = ENTRYPOINT.indexOf('const ownerSelfKnowledge = input.privileged === true')
  const core = ENTRYPOINT.indexOf('const deterministicSelfKnowledge = await tryCoreCOSFirstAnswer(input)')
  const release = ENTRYPOINT.indexOf('return deterministicSelfKnowledge', core)
  const neuralFallback = ENTRYPOINT.indexOf('tryOwnerNeuralSelfKnowledge(input, { compatibilitySignal: true })')
  assert.ok(guard > 0)
  assert.ok(core > guard)
  assert.ok(release > core && release < neuralFallback, 'verified runtime facts must release before neural fallback')
})

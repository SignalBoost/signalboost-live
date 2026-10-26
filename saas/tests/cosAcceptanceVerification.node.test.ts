import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyCosAcceptance } from '../scripts/cos-acceptance-verification.mjs'

const sha = 'a'.repeat(40)
const code = { commit: sha, ci: 'passed', playwright: 'passed', ciCommit: sha, playwrightCommit: sha }
const production = { ...code, deployment: 'ready', deploymentCommit: sha, deploymentUrlVerified: true }
const live = { ...production, live: 'passed', liveCommit: sha, authenticated: true, liveUnmocked: true, review: 'passed', history: 'passed', budget: 'passed' }

test('green CI and mocked Playwright certify code only', () => {
  assert.equal(classifyCosAcceptance(code).status, 'CODE_VERIFIED')
  assert.equal(classifyCosAcceptance({ ...code, playwrightCommit: 'b'.repeat(40) }).status, 'PARTIAL')
  assert.equal(classifyCosAcceptance({ ...code, ci: 'failed' }).status, 'PARTIAL')
})
test('verified deployment is separate from authenticated live acceptance', () => {
  assert.equal(classifyCosAcceptance(production).status, 'PRODUCTION_VERIFIED')
  assert.equal(classifyCosAcceptance(production).operatorReviewRequired, true)
  assert.equal(classifyCosAcceptance({ ...production, deploymentUrlVerified: false }).status, 'CODE_VERIFIED')
})
test('end-to-end needs unmocked authenticated evidence and independent review', () => {
  assert.equal(classifyCosAcceptance(live).status, 'END_TO_END_VERIFIED')
  for (const key of ['authenticated', 'liveUnmocked', 'deploymentUrlVerified']) {
    assert.notEqual(classifyCosAcceptance({ ...live, [key]: false }).status, 'END_TO_END_VERIFIED')
  }
  for (const key of ['review', 'history', 'budget']) {
    assert.notEqual(classifyCosAcceptance({ ...live, [key]: 'blocked' }).status, 'END_TO_END_VERIFIED')
  }
  assert.equal(classifyCosAcceptance({ ...live, liveCommit: 'b'.repeat(40) }).status, 'PRODUCTION_VERIFIED')
})

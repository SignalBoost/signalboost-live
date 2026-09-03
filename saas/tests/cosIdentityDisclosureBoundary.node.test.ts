// saas/tests/cosIdentityDisclosureBoundary.node.test.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const shared = readFileSync(new URL('../lib/ai/cos/cosFirstAnswer.ts', import.meta.url), 'utf8')
const enterprise = readFileSync(new URL('../lib/ai/cos/cosFirstAnswerEnterprise.ts', import.meta.url), 'utf8')

// ONE GOVERNANCE (owner decision, 2026-08-26). COS is the only reasoner; Concierge renders.
// The identity/model/provider answer is deterministic and scope-aware, and it is decided in the
// SHARED entrypoint before any reasoner runs. These assertions exist so the arrangement does not
// have to be re-explained to every agent: if you are about to move disclosure into the enterprise
// file, read the ordering test below first - it is why that refactor does not work.
test('identity and platform-stack questions are answered deterministically, before any reasoner', () => {
  const intercept = shared.indexOf('isPlatformStackQuestion(input.prompt) || asksAboutServiceIdentity(input.prompt)')
  const enterpriseCall = shared.indexOf('tryEnterpriseCOSFirstAnswer', intercept)
  assert.ok(intercept >= 0, 'the shared entrypoint must own the identity intercept')
  assert.ok(enterpriseCall > intercept, 'the intercept must run BEFORE the enterprise reasoner')
  assert.match(shared, /selfKnowledgeDeterministic: true/)
})

test('scope decides disclosure: public gets the boundary, owner gets the real stack', () => {
  assert.match(shared, /isPublicDeliveryScope\(\)\s*\n?\s*\?\s*publicImplementationDisclosureReply\(input\.language\)/)
  assert.match(shared, /:\s*ownerPlatformStackReply\(input\.language\)/)
})

test('the enterprise reasoner never carries a disclosure path of its own', () => {
  // Disclosure lives in exactly one place. A second copy here would be reachable on a path that
  // the scope check above does not guard.
  assert.doesNotMatch(enterprise, /ownerPlatformStackReply/)
  assert.doesNotMatch(enterprise, /publicImplementationDisclosureReply/)
})

test('the owner stack reply is defined once and reached only through the scope check', () => {
  const definitions = shared.match(/function ownerPlatformStackReply\(/g) || []
  const callSites = shared.match(/ownerPlatformStackReply\(input\.language\)/g) || []
  assert.equal(definitions.length, 1)
  assert.equal(callSites.length, 1)
})

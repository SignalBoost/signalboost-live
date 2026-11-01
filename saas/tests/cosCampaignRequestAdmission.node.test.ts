// saas/tests/cosCampaignRequestAdmission.node.test.ts
// Production 2026-10-29 16:09 UTC: the owner pasted the COS-PAC-001 document on the Assistant. It was queued as a background
// COS turn, no campaign job was created, and the answer was a capability denial. The owner's campaign request is now
// admitted on the request path.
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { namesVerificationCampaign } from '../lib/builder/campaign/catalog.ts'
import { isExternalActionCommand } from '../lib/ai/cos/externalActionCommandIntent.ts'
import { isProvenanceIntrospection } from '../lib/ai/cos/provenanceIntrospection.ts'
import { isContentGenerationRequest } from '../lib/ai/cos/contentGenerationIntent.ts'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')
const campaignDocument = read('tests/fixtures/cos-production-acceptance-campaign.txt')

test('a pasted campaign document is not authorization to start twenty production tests', () => {
  assert.equal(namesVerificationCampaign(campaignDocument), false)
  assert.equal(isProvenanceIntrospection(campaignDocument), false)
  assert.equal(isContentGenerationRequest(campaignDocument), false)
  assert.equal(isExternalActionCommand(campaignDocument), true)
})

test("the signed-in owner's campaign request is never queued as a background COS turn", () => {
  const route = read('app/api/cos-provenance-browser/route.ts')
  assert.match(route, /const ownerCampaignRequest = Boolean\(prompt\) && namesVerificationCampaign\(prompt\)\s*&& \(await getAccess\(\)\.catch\(\(\) => null\)\)\?\.isOwner === true/)
  assert.match(route, /const durableConversationTurn = ordinaryConversationTurn && externalActionRequested && !ownerCampaignRequest\n/)
  // It runs on the request path, where cos-browser starts the campaign job for the owner before any COS answer exists.
  const browser = read('app/api/cos-browser/route.ts')
  const admission = browser.indexOf('if (authenticatedOwner && access?.userId && namesVerificationCampaign(prompt)) {')
  assert.ok(admission > 0)
  assert.ok(browser.indexOf('startVerificationCampaignResponse({ userId: access.userId, body, prompt, language })', admission) > admission)
  assert.equal(browser.slice(browser.indexOf('async function executeBrowserTurn'), admission).includes('cosPrimaryPost(req)'), true, 'only the explicit text-edit lane precedes admission')
})

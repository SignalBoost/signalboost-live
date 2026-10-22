import test from 'node:test'
import assert from 'node:assert/strict'
import { pendingOwnerSoftwareRepair } from '../lib/ai/cos/softwareRepairContinuation.ts'
import { readFileSync } from 'node:fs'

const answer = 'I can fix that. Attach the file or files involved, paste the code here, or send the link to a public GitHub repository, and I will find the problem.'
test('COS uses the earlier software repair after a canned source request and explicit follow-up', () => {
  const first = 'Fix the Failed to fetch error on the Builder page'
  for (const prompt of ['go', 'yes', 'fix it', 'continue']) {
    assert.equal(pendingOwnerSoftwareRepair([
      { role: 'user', content: first },
      { role: 'assistant', content: answer },
      { role: 'user', content: prompt },
    ], prompt), first)
  }
})
test('ordinary chat and third-party authority cannot arise from a generic affirmation', () => {
  assert.equal(pendingOwnerSoftwareRepair([{ role: 'user', content: 'fix my car' }, { role: 'assistant', content: answer }, { role: 'user', content: 'go' }], 'go'), null)
  assert.equal(pendingOwnerSoftwareRepair([{ role: 'user', content: 'Fix the Builder page' }, { role: 'assistant', content: 'I completed that' }, { role: 'user', content: 'go' }], 'go'), null)
  assert.equal(pendingOwnerSoftwareRepair([{ role: 'user', content: 'Fix the Builder page' }, { role: 'assistant', content: answer }, { role: 'user', content: 'what time?' }], 'what time?'), null)
  const route = readFileSync(new URL('../app/api/cos-browser/route.ts', import.meta.url), 'utf8')
  assert.match(route, /authenticatedOwner && isSignalBoostDeploymentContext\(req\) && ownerRepairFollowup/)
  assert.match(route, /objective: specialistObjective/)
  assert.match(route, /allowRepositoryRepair: false/)
})

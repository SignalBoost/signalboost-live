// saas/tests/cosAnswersActionRequestsWithoutExecutor.node.test.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { isExternalActionCommand } from '../lib/ai/cos/externalActionCommandIntent.ts'

const route = readFileSync(new URL('../app/api/cos-primary/route.ts', import.meta.url), 'utf8')

test('ordinary requests are worded as actions, so the action rule must not decide whether COS answers', () => {
  for (const request of [
    'Create a campaign plan for our new product launch.',
    'Check the production logs and tell me what failed.',
    'Fix the failing test in my repo.',
    readFileSync(new URL('./fixtures/cos-production-acceptance-campaign.txt', import.meta.url), 'utf8'),
  ]) assert.equal(isExternalActionCommand(request), true)
})

test('COS skips its own answer for an action only when a governed executor is reachable', () => {
  assert.match(route, /const requestedAction=externalFallbackEnabled\(\)&&requestsExternalAction\(input\)/)
  // The refusal branch is the one taken when the executor path is off; with requestedAction false there,
  // every COS answer attempt before it runs.
  const decided = route.indexOf('const requestedAction=')
  const firstAttempt = route.indexOf('if(!requestedAction&&(!requiresFreshEvidence||freshMissUseLocal)){')
  const refusalBranch = route.indexOf('if(!externalFallbackEnabled()){')
  assert.ok(decided > 0 && decided < firstAttempt && firstAttempt < refusalBranch)
})

// saas/tests/assistantDashboardTransportGuard.node.test.ts
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const source = fs.readFileSync(path.join(process.cwd(), 'app/dashboard/assistant/page.tsx'), 'utf8')

test('assistant transport recovery reads durable history instead of replaying concierge POST', () => {
  assert.match(source, /recoverCompletedTurn\(conversationId, content, sentAtMs\)/)
  assert.match(source, /\/api\/assistant\/chats\?id=/)
  assert.match(source, /findRecoveredAssistantReply/)

  const postMatches = source.match(/fetch\('\/api\/cos-primary'/g) ?? []
  assert.equal(postMatches.length, 1, 'transport recovery must not retry the mutating POST')
  // The public-scoped concierge endpoint must no longer be the assistant page's transport at all —
  // it forced the owner's session down to guest (owner-verified 2026-08-24).
  assert.equal((source.match(/fetch\('\/api\/concierge'/g) ?? []).length, 0, 'assistant page must not post to the public-scoped concierge endpoint')
})

test('generic timeout copy does not mention outreach or companies', () => {
  const timedOutLine = source.split('\n').find(line => line.includes('timedOut:')) ?? ''
  assert.ok(timedOutLine.includes('Check History'))
  assert.doesNotMatch(timedOutLine, /Outreach|company|companies/i)
})

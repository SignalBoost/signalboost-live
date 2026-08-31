import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { isCosCodingObjective } from '../lib/ai/cos/cosReasoningRolePolicy.ts'

const transport = fs.readFileSync(path.join(process.cwd(), 'components/AssistantTransportBoundary.tsx'), 'utf8')
const builderRoute = fs.readFileSync(path.join(process.cwd(), 'app/api/builder/route.ts'), 'utf8')
const assistantPage = fs.readFileSync(path.join(process.cwd(), 'app/dashboard/assistant/page.tsx'), 'utf8')

test('explicit technical repair prompts reach Builder', () => {
  assert.equal(
    isCosCodingObjective('Please fix the problem - https://github.com/SignalBoost/signalboost-live/'),
    true,
  )
  assert.equal(isCosCodingObjective('The Builder is not working. Repair it.'), true)
  assert.equal(isCosCodingObjective('Please fix my email grammar.'), false)
})

test('Builder handoff preserves the assistant conversation id', () => {
  assert.match(
    transport,
    /body: JSON\.stringify\(\{ objective, files: builderFilesFromBody\(body\), conversationId \}\)/,
  )
  assert.match(
    transport,
    /executeBuilderFromConcierge\(originalFetch, body, userContent, conversationId, init\?\.signal/,
  )
  assert.match(builderRoute, /conversationId = String\(body\?\.conversationId \|\| ''\)\.trim\(\)/)
  assert.match(builderRoute, /Invalid conversation id\./)
})

test('Builder persists terminal results before replying so History can recover a lost response', () => {
  assert.match(builderRoute, /import \{ persistTurn \} from '@\/lib\/ai\/tools\/conversationHistory'/)
  assert.match(builderRoute, /async function persistBuilderTurn/)
  assert.match(builderRoute, /assistantReply: builderHistoryReply/)
  assert.match(builderRoute, /Builder files:/)

  const successPersist = builderRoute.indexOf('await persistBuilderTurn({ conversationId, userId: access.userId, objective, reply: result.answer, workspaceId, files })')
  const successReturn = builderRoute.indexOf('return NextResponse.json({ workspaceId, reply: result.answer, files, trace })', successPersist)
  assert.ok(successPersist >= 0)
  assert.ok(successReturn > successPersist)

  const failureBranch = builderRoute.indexOf('if (result.ok === false)')
  const failurePersist = builderRoute.indexOf('await persistBuilderTurn({ conversationId, userId: access.userId, objective, reply, workspaceId, files })', failureBranch)
  const failureReturn = builderRoute.indexOf('return NextResponse.json(', failurePersist)
  assert.ok(failureBranch >= 0)
  assert.ok(failurePersist > failureBranch)
  assert.ok(failureReturn > failurePersist)

  assert.match(assistantPage, /recoverCompletedTurn\(conversationId, content, sentAtMs\)/)
  assert.equal((assistantPage.match(/fetch\('\/api\/cos-primary'/g) ?? []).length, 1)
})

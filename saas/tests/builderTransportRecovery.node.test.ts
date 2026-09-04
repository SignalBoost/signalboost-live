import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { isConciergeBuilderObjective } from '../lib/ai/cos/cosReasoningRolePolicy.ts'

const transport = fs.readFileSync(path.join(process.cwd(), 'components/AssistantTransportBoundary.tsx'), 'utf8')
const builderRoute = fs.readFileSync(path.join(process.cwd(), 'app/api/builder/route.ts'), 'utf8')
const migration = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20260831174502_builder_jobs_and_history_order.sql'), 'utf8')
const assistantPage = fs.readFileSync(path.join(process.cwd(), 'app/dashboard/assistant/page.tsx'), 'utf8')
const progressClient = fs.readFileSync(path.join(process.cwd(), 'lib/ai/cos/agentProgressClient.ts'), 'utf8')

test('only concrete coding requests reach Builder', () => {
  assert.equal(isConciergeBuilderObjective('Please fix the problem - https://github.com/SignalBoost/signalboost-live/'), false)
  assert.equal(isConciergeBuilderObjective('The Builder is not working. Repair it.'), false)
  assert.equal(isConciergeBuilderObjective('Please fix my email grammar.'), false)
  assert.equal(isConciergeBuilderObjective('Debug the attached file in Builder.', {
    attachmentNames: ['broken.js'],
    attachmentMimeTypes: ['text/javascript'],
  }), true)
})

test('Builder handoff preserves the exact assistant conversation id', () => {
  assert.match(
    transport,
    /body: JSON\.stringify\(\{ objective, files: builderFilesFromBody\(body\), conversationId \}\)/,
  )
  assert.match(
    transport,
    /executeBuilderFromConcierge\(originalFetch, body, userContent, conversationId, init\?\.signal/,
  )
  assert.match(builderRoute, /conversationId = String\(body\?\.conversationId \|\| ''\)\.trim\(\) \|\| crypto\.randomUUID\(\)/)
  assert.match(builderRoute, /Invalid conversation id\./)
  assert.match(migration, /p_conversation_id uuid/)
})

test('Builder persists running before 202 and replaces it with the terminal result', () => {
  const enqueue = builderRoute.indexOf('await enqueueBuilderJob({')
  const schedule = builderRoute.indexOf('after(async () => {', enqueue)
  const accepted = builderRoute.indexOf("{ status: 202 }", schedule)
  assert.ok(enqueue >= 0)
  assert.ok(schedule > enqueue)
  assert.ok(accepted > schedule)

  assert.match(migration, /insert into public\.assistant_messages[\s\S]*'running'/)
  assert.match(migration, /update public\.assistant_messages[\s\S]*where id = v_history_message_id/)
  assert.match(transport, /recoverAssistantReplyFromHistory/)
  assert.match(transport, /BUILDER_HISTORY_POLL_ATTEMPTS = 11/)
  assert.match(transport, /BUILDER_HISTORY_POLL_DELAY_MS = 2_500/)
  assert.match(assistantPage, /recoverCompletedTurn\(conversationId, content, sentAtMs\)/)
  // The page delegates its single send to the progress client. That client still POSTs once;
  // subsequent durable Builder observations are read-only GETs by job id. Owner COS enters the
  // canonical browser dispatcher first so Software Specialist selection cannot be bypassed.
  assert.equal((assistantPage.match(/postWithAgentProgress\(/g) ?? []).length, 1)
  assert.equal((progressClient.match(/\/api\/cos-browser/g) ?? []).length, 1)
  assert.equal((progressClient.match(/\/api\/cos-primary/g) ?? []).length, 0)
  assert.equal((progressClient.match(/method: 'POST'/g) ?? []).length, 1)
  assert.match(progressClient, /method: 'GET'/)
})

test('transport recovery never sends a second Builder POST', () => {
  assert.equal((transport.match(/fetchImpl\('\/api\/builder',\s*\{/g) ?? []).length, 1)
  assert.match(transport, /Polling is read-only/)
  assert.match(transport, /never replay the action/)
})

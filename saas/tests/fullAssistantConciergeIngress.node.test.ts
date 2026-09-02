import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('Full Assistant routes every pasted operational log through the canonical browser ingress', () => {
  const boundary = readFileSync(new URL('../components/AssistantTransportBoundary.tsx', import.meta.url), 'utf8')
  assert.match(boundary, /hasExplicitOperationalLogRepairIntent/)
  assert.match(boundary, /isPastedOperationalLog/)
  assert.match(boundary, /let operationalRepair = isPastedOperationalLog\(userContent\) \|\| shouldUseConciergeRepairIngress\(body\)/)
  assert.match(boundary, /executeOperationalRepairFromConcierge/)
  assert.match(boundary, /sendUrl: '\/api\/cos-primary'/)
  assert.match(boundary, /const previous = users\.at\(-2\) \|\| ''/)
  assert.match(boundary, /hasExplicitOperationalLogRepairIntent\(previous\)/)
})

test('Full Assistant recovers missing previous repair intent from durable conversation History', () => {
  const boundary = readFileSync(new URL('../components/AssistantTransportBoundary.tsx', import.meta.url), 'utf8')
  assert.match(boundary, /async function durablePreviousRepairIntent/)
  assert.match(boundary, /`\/api\/assistant\/chats\?id=\$\{encodeURIComponent\(conversationId\)\}`/)
  assert.match(boundary, /if \(!operationalRepair && isPastedOperationalLog\(userContent\)\)/)
  assert.match(boundary, /const recoveredRepairIntent = await durablePreviousRepairIntent/)
  assert.match(boundary, /hasExplicitOperationalLogRepairIntent\(content\) \? content : null/)
})

test('recovered repair intent is forwarded in the server-visible browser-ingress transcript', () => {
  const boundary = readFileSync(new URL('../components/AssistantTransportBoundary.tsx', import.meta.url), 'utf8')
  assert.match(boundary, /function bodyWithPreviousUserTurn/)
  assert.match(boundary, /sendBody = bodyWithPreviousUserTurn\(body, recoveredRepairIntent\)/)
  assert.match(boundary, /executeOperationalRepairFromConcierge\([\s\S]{0,180}sendBody/)
  assert.match(boundary, /\{ role: 'user', content: previousUserContent \}/)
})

test('Full Assistant keeps direct Builder interception for source-backed objectives', () => {
  const boundary = readFileSync(new URL('../components/AssistantTransportBoundary.tsx', import.meta.url), 'utf8')
  assert.match(boundary, /isConciergeBuilderObjective\(userContent, builderRoutingContext\(body\)\)/)
  assert.match(boundary, /executeBuilderFromConcierge\(originalFetch/)
})

test('Full Assistant renders terminal output from queued operational Builder jobs', () => {
  const boundary = readFileSync(new URL('../components/AssistantTransportBoundary.tsx', import.meta.url), 'utf8')
  assert.match(boundary, /async function executeOperationalRepairFromConcierge/)
  assert.match(boundary, /response\.status !== 202 \|\| !jobId/)
  assert.match(boundary, /pollBuilderJob\(fetchImpl, jobId, signal\)/)
  assert.match(boundary, /'operational-repair-terminal'/)
})

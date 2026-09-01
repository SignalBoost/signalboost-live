import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('Full Assistant routes only explicit pasted-log repair through the canonical browser ingress', () => {
  const boundary = readFileSync(new URL('../components/AssistantTransportBoundary.tsx', import.meta.url), 'utf8')
  assert.match(boundary, /hasExplicitOperationalLogRepairIntent/)
  assert.match(boundary, /isPastedOperationalLog/)
  assert.match(boundary, /let operationalRepair = shouldUseConciergeRepairIngress\(body\)/)
  assert.match(boundary, /sendUrl: operationalRepair \? '\/api\/cos-browser' : '\/api\/cos-primary'/)
  assert.doesNotMatch(boundary, /sendUrl: operationalRepair \? '\/api\/concierge'/)
  assert.match(boundary, /const previous = users\.at\(-2\) \|\| ''/)
  assert.match(boundary, /hasExplicitOperationalLogRepairIntent\(previous\)/)
})

test('Full Assistant recovers missing previous repair intent from durable conversation History', () => {
  const boundary = readFileSync(new URL('../components/AssistantTransportBoundary.tsx', import.meta.url), 'utf8')
  assert.match(boundary, /async function durablePreviousRepairIntent/)
  assert.match(boundary, /currentUserContent: string/)
  assert.match(boundary, /`\/api\/assistant\/chats\?id=\$\{encodeURIComponent\(conversationId\)\}`/)
  assert.match(boundary, /let skippedCurrentTurn = false/)
  assert.match(boundary, /if \(!skippedCurrentTurn && content === currentUserContent\)/)
  assert.match(boundary, /skippedCurrentTurn = true\s+continue/)
  assert.match(boundary, /return hasExplicitOperationalLogRepairIntent\(content\) \? content : null/)
  assert.match(boundary, /durablePreviousRepairIntent\([\s\S]*conversationId,[\s\S]*userContent,/)
})

test('History recovery inspects only the immediately preceding distinct user turn', () => {
  const boundary = readFileSync(new URL('../components/AssistantTransportBoundary.tsx', import.meta.url), 'utf8')
  const recovery = boundary.slice(
    boundary.indexOf('async function durablePreviousRepairIntent'),
    boundary.indexOf('function bodyWithPreviousUserTurn'),
  )
  assert.match(recovery, /return hasExplicitOperationalLogRepairIntent\(content\) \? content : null/)
  assert.doesNotMatch(recovery, /if \(hasExplicitOperationalLogRepairIntent\(content\)\) return content/)
})

test('recovered repair intent is forwarded in the server-visible browser-ingress transcript', () => {
  const boundary = readFileSync(new URL('../components/AssistantTransportBoundary.tsx', import.meta.url), 'utf8')
  assert.match(boundary, /function bodyWithPreviousUserTurn/)
  assert.match(boundary, /sendBody = bodyWithPreviousUserTurn\(body, recoveredRepairIntent\)/)
  assert.match(boundary, /sendAssistantTurnAndRecover\(userContent, sendBody as Record<string, unknown>/)
  assert.match(boundary, /\{ role: 'user', content: previousUserContent \}/)
})

test('Full Assistant keeps direct Builder interception for source-backed objectives', () => {
  const boundary = readFileSync(new URL('../components/AssistantTransportBoundary.tsx', import.meta.url), 'utf8')
  assert.match(boundary, /isConciergeBuilderObjective\(userContent, builderRoutingContext\(body\)\)/)
  assert.match(boundary, /executeBuilderFromConcierge\(originalFetch/)
})

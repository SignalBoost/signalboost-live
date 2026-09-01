import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('Full Assistant routes only explicit pasted-log repair through Concierge', () => {
  const boundary = readFileSync(new URL('../components/AssistantTransportBoundary.tsx', import.meta.url), 'utf8')
  assert.match(boundary, /hasExplicitOperationalLogRepairIntent/)
  assert.match(boundary, /isPastedOperationalLog/)
  assert.match(boundary, /let operationalRepair = shouldUseConciergeRepairIngress\(body\)/)
  assert.match(boundary, /sendUrl: operationalRepair \? '\/api\/concierge' : '\/api\/cos-primary'/)
  assert.match(boundary, /const previous = users\.at\(-2\) \|\| ''/)
  assert.match(boundary, /hasExplicitOperationalLogRepairIntent\(previous\)/)
})

test('Full Assistant recovers missing previous repair intent from durable conversation History', () => {
  const boundary = readFileSync(new URL('../components/AssistantTransportBoundary.tsx', import.meta.url), 'utf8')
  assert.match(boundary, /async function hasDurablePreviousRepairIntent/)
  assert.match(boundary, /`\/api\/assistant\/chats\?id=\$\{encodeURIComponent\(conversationId\)\}`/)
  assert.match(boundary, /if \(!operationalRepair && isPastedOperationalLog\(userContent\)\)/)
  assert.match(boundary, /operationalRepair = await hasDurablePreviousRepairIntent/)
  assert.match(boundary, /return hasExplicitOperationalLogRepairIntent\(message\.content\)/)
})

test('Full Assistant keeps direct Builder interception for source-backed objectives', () => {
  const boundary = readFileSync(new URL('../components/AssistantTransportBoundary.tsx', import.meta.url), 'utf8')
  assert.match(boundary, /isConciergeBuilderObjective\(userContent, builderRoutingContext\(body\)\)/)
  assert.match(boundary, /executeBuilderFromConcierge\(originalFetch/)
})

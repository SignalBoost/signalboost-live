import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('Full Assistant routes every pasted operational log through the canonical browser ingress', () => {
  const boundary = readFileSync(new URL('../components/AssistantTransportBoundary.tsx', import.meta.url), 'utf8')
  assert.match(boundary, /hasExplicitOperationalLogRepairIntent/)
  assert.match(boundary, /isOperationalLogEvidence/)
  assert.match(boundary, /isPastedOperationalLog/)
  assert.match(boundary, /let operationalRepair = isOperationalLogEvidence\(userContent\) \|\| shouldUseConciergeRepairIngress\(body\)/)
  assert.match(boundary, /executeOperationalRepairFromConcierge/)
  assert.match(boundary, /sendUrl: '\/api\/cos-primary'/)
})

test('Full Assistant carries a passive operational log into the next explicit fix-it turn', () => {
  const boundary = readFileSync(new URL('../components/AssistantTransportBoundary.tsx', import.meta.url), 'utf8')
  assert.match(boundary, /hasExplicitOperationalLogRepairIntent\(current\) && isPastedOperationalLog\(previous\)/)
  assert.match(boundary, /function bodyWithOperationalRepairFollowup/)
  assert.match(boundary, /content: `\$\{current\}\\n\\n\$\{operationalLog\.trim\(\)\}`/)
  assert.match(boundary, /if \(hasExplicitOperationalLogRepairIntent\(userContent\)\)/)
  assert.match(boundary, /previousOperationalLog = isPastedOperationalLog\(previousUserContent\)/)
  assert.match(boundary, /sendBody = bodyWithOperationalRepairFollowup\(body, previousOperationalLog\)/)
})

test('Full Assistant can recover the prior passive log from durable History when the request transcript is clipped', () => {
  const boundary = readFileSync(new URL('../components/AssistantTransportBoundary.tsx', import.meta.url), 'utf8')
  assert.match(boundary, /async function durablePreviousOperationalLog/)
  assert.match(boundary, /`\/api\/assistant\/chats\?id=\$\{encodeURIComponent\(conversationId\)\}`/)
  assert.match(boundary, /return isPastedOperationalLog\(content\) \? content : null/)
  assert.match(boundary, /previousOperationalLog = await durablePreviousOperationalLog/)
})

test('Full Assistant preserves reverse-order repair-intent recovery for clipped transcripts', () => {
  const boundary = readFileSync(new URL('../components/AssistantTransportBoundary.tsx', import.meta.url), 'utf8')
  assert.match(boundary, /async function durablePreviousRepairIntent/)
  assert.match(boundary, /if \(isPastedOperationalLog\(userContent\) && !hasExplicitOperationalLogRepairIntent\(previousUserContent\)\)/)
  assert.match(boundary, /const recoveredRepairIntent = await durablePreviousRepairIntent/)
  assert.match(boundary, /hasExplicitOperationalLogRepairIntent\(content\) \? content : null/)
})

test('recovered reverse-order repair intent is forwarded in the server-visible browser-ingress transcript', () => {
  const boundary = readFileSync(new URL('../components/AssistantTransportBoundary.tsx', import.meta.url), 'utf8')
  assert.match(boundary, /function bodyWithPreviousUserTurn/)
  assert.match(boundary, /sendBody = bodyWithPreviousUserTurn\(body, recoveredRepairIntent\)/)
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
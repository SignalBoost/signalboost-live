import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('Full Assistant ordinary COS turns use canonical Concierge ingress without relying on Referer', () => {
  const boundary = readFileSync(new URL('../components/AssistantTransportBoundary.tsx', import.meta.url), 'utf8')
  assert.match(boundary, /sendUrl: '\/api\/concierge'/)
  assert.doesNotMatch(boundary, /sendUrl: '\/api\/cos-primary'/)
  assert.match(boundary, /isConciergeBuilderObjective\(userContent, builderRoutingContext\(body\)\)/)
  assert.match(boundary, /executeBuilderFromConcierge\(originalFetch/)
})

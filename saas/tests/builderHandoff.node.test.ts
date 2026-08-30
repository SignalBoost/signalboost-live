import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { isConciergeBuilderObjective, isCosCodingObjective } from '../lib/ai/cos/cosReasoningRolePolicy.ts'
import { hydrateLocalizedSource } from './helpers/hydrateLocalizedSource.ts'


test('coding objectives route to Builder, not a public execution endpoint', () => {
  assert.equal(isCosCodingObjective('Fix this TypeScript stack trace and run the test.'), true)
  assert.equal(isCosCodingObjective('Create a file named hello.js, run it with Node.js, and give me the file to download.'), true)
  assert.equal(isCosCodingObjective('Design a landing page for a travel service.'), true)
  assert.equal(isCosCodingObjective('Explain the Bay of Pigs invasion.'), false)
  assert.equal(isConciergeBuilderObjective('What is a SQL query?'), false)
  assert.equal(isConciergeBuilderObjective('Design a modern website for a travel service.'), true)
  assert.equal(isConciergeBuilderObjective('Create a responsive landing page.'), true)
  assert.equal(isConciergeBuilderObjective('Build me a dashboard.'), true)
  const assistant = hydrateLocalizedSource(readFileSync(new URL('../app/dashboard/assistant/page.tsx', import.meta.url), 'utf8'))
  const transport = hydrateLocalizedSource(readFileSync(new URL('../components/AssistantTransportBoundary.tsx', import.meta.url), 'utf8'))
  assert.match(assistant, /window\.location\.assign\(`\/dashboard\/developer\?objective=/)
  assert.match(assistant, /cos-builder-handoff-files-v1/)
  assert.doesNotMatch(assistant, /isCosCodingObjective\(content\) && builderFiles/)
  assert.doesNotMatch(assistant, /\/api\/concierge[^\n]*builder/)
  assert.match(transport, /isCosCodingObjective\(userContent\)/)
  assert.match(transport, /dashboard\/developer\?objective=/)
})

test('Concierge hands off only explicit Builder objectives and never drops attachments', () => {
  const conciergeRoute = hydrateLocalizedSource(readFileSync(new URL('../app/api/concierge/route.ts', import.meta.url), 'utf8'))
  const concierge = hydrateLocalizedSource(readFileSync(new URL('../components/Concierge.tsx', import.meta.url), 'utf8'))
  assert.match(conciergeRoute, /isConciergeBuilderObjective\(input\)/)
  assert.match(conciergeRoute, /directBuilder\(body, input\)/)
  assert.match(conciergeRoute, /hasAttachments\(body\)/)
  assert.match(concierge, /builderWorkspaceId/)
  assert.match(concierge, /\/api\/builder\/workspaces\//)
})

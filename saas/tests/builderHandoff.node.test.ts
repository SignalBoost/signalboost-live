import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { isCosCodingObjective } from '../lib/ai/cos/cosReasoningRolePolicy.ts'

test('coding objectives route to Builder, not a public execution endpoint', () => {
  assert.equal(isCosCodingObjective('Fix this TypeScript stack trace and run the test.'), true)
  assert.equal(isCosCodingObjective('Explain the Bay of Pigs invasion.'), false)
  const assistant = readFileSync(new URL('../app/dashboard/assistant/page.tsx', import.meta.url), 'utf8')
  assert.match(assistant, /window\.location\.assign\(\`\/dashboard\/developer\?objective=/)
  assert.doesNotMatch(assistant, /\/api\/concierge[^\n]*builder/)
})

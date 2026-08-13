import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const supportRoute = readFileSync(new URL('../app/api/support/route.ts', import.meta.url), 'utf8')
const assistantPage = readFileSync(new URL('../app/dashboard/assistant/page.tsx', import.meta.url), 'utf8')

test('provenance introspection is persisted before its response is returned', () => {
  const branch = supportRoute.match(/if\(prompt&&isProvenanceIntrospection\(prompt\)&&userId\)\{([\s\S]*?)\n  \}\n\n  const response=/)?.[1] ?? ''
  assert.ok(branch, 'expected dedicated provenance-introspection branch')
  assert.match(branch, /await persistProvenanceReply\(/)
  assert.match(branch, /formatAuthoritativeProvenance/)
  assert.match(branch, /source:'cos-authoritative-provenance'/)
  assert.ok(
    branch.indexOf('await persistProvenanceReply(') < branch.indexOf("source:'cos-authoritative-provenance'"),
    'the durable recovery copy must be written before the provenance response is returned',
  )
})

test('provenance persistence does not overwrite the latest answer provenance pointer', () => {
  const helper = supportRoute.match(/async function persistProvenanceReply[\s\S]*?\n\nexport async function POST/)?.[0] ?? ''
  assert.match(helper, /persistTurn/)
  assert.doesNotMatch(helper, /recordLatestUserTurnProvenance/)
})

test('assistant transport catch path can recover a persisted server reply without replaying the POST', () => {
  assert.match(assistantPage, /recoverCompletedTurn/)
  assert.match(assistantPage, /findRecoveredAssistantReply/)
  assert.match(assistantPage, /Never resend the POST/)
})

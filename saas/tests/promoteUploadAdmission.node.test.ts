// saas/tests/promoteUploadAdmission.node.test.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const route = readFileSync(new URL('../app/api/promote/route.ts', import.meta.url), 'utf8')
const gate = readFileSync(new URL('../scripts/vercel-cos-gates.mjs', import.meta.url), 'utf8')

test('campaign generation requires a signed-in user before any platform model spend', () => {
  const auth = route.indexOf('await getCurrentUser()')
  const client = route.indexOf('getOpenAIClient()', route.indexOf('export async function POST'))
  assert.ok(auth > 0, 'sign-in check present')
  assert.ok(auth < client, 'sign-in check runs before the OpenAI client is used')
  assert.match(route, /status: 401/)
})

test('attachments are size-bounded before they are read', () => {
  assert.match(route, /const MAX_ATTACHMENT_BYTES = 200_000/)
  const sizeCheck = route.indexOf('file.size > MAX_ATTACHMENT_BYTES')
  const read = route.indexOf('await file.text()')
  assert.ok(sizeCheck > 0 && read > 0 && sizeCheck < read)
  assert.match(route, /status: 413/)
})

test('pasted and attached text is capped and screened by the AI Security Gateway before the prompt', () => {
  assert.match(route, /inspectUntrustedAiContent\(\{\s*source: 'user_input'/)
  assert.match(route, /slice\(0, MAX_CONTEXT_CHARS\)/)
  const screen = route.indexOf('inspectUntrustedAiContent(')
  const prompt = route.indexOf('const prompt =')
  assert.ok(screen > 0 && screen < prompt)
  assert.match(route, /screened\.disposition === 'quarantined'/)
  assert.doesNotMatch(route, /const attachmentText =\s*body\.attachmentText/)
})

test('the promote admission regression is part of the Production gate', () => {
  assert.match(gate, /promoteUploadAdmission\.node\.test\.ts/)
})

// saas/tests/prRedact.node.test.ts
//
// Security-critical unit tests for the PR Cockpit payload redaction
// (lib/hub/pr-redact.ts). Staged infrastructure PRs can carry real secrets
// (API keys, tokens, env-var values); these tests pin the guarantee that those
// values are masked before a payload is ever sent to the browser, while
// non-sensitive context (which env var, which repo, which target) stays
// readable for the human approver. Pure functions, no DB, no network.
//
// Run: node --test tests/prRedact.node.test.ts

import assert from 'node:assert/strict'
import test from 'node:test'
import { redactPayload, redactPrForDisplay, redactPrsForDisplay } from '../lib/hub/pr-redact.ts'

const SECRET = 'sk-live-0123456789abcdef'

test('masks sensitive top-level keys, never echoing the original value', () => {
  const out: any = redactPayload({
    secret: SECRET,
    token: SECRET,
    password: SECRET,
    api_key: SECRET,
    access_key: SECRET,
    client_secret: SECRET,
    service_role: SECRET,
    bearer: SECRET,
    webhook_secret: SECRET,
  })
  for (const k of Object.keys(out)) {
    assert.notEqual(out[k], SECRET, `${k} must not retain the raw secret`)
    assert.ok(String(out[k]).includes('•'), `${k} must be masked`)
  }
})

test('preserves non-sensitive context so approvers can still read the change', () => {
  const out: any = redactPayload({ repo: 'acme/widgets', target: ['production'], enabled: true, count: 3 })
  assert.equal(out.repo, 'acme/widgets')
  assert.deepEqual(out.target, ['production'])
  assert.equal(out.enabled, true)
  assert.equal(out.count, 3)
})

test('masks the value-bearing fields (value/secret/token/password) by name', () => {
  // Mirrors a Vercel set-env payload: the var NAME stays visible, the value is hidden.
  const out: any = redactPayload({ key: 'OPENAI_API_KEY', value: SECRET, target: ['production'] })
  assert.equal(out.key, 'OPENAI_API_KEY', 'the env var name is not a secret and stays readable')
  assert.notEqual(out.value, SECRET)
  assert.ok(String(out.value).includes('•'))
  assert.deepEqual(out.target, ['production'])
})

test('redacts secrets nested deep inside objects', () => {
  const out: any = redactPayload({ outer: { inner: { api_key: SECRET, label: 'keep-me' } } })
  assert.notEqual(out.outer.inner.api_key, SECRET)
  assert.ok(String(out.outer.inner.api_key).includes('•'))
  assert.equal(out.outer.inner.label, 'keep-me')
})

test('redacts secrets inside arrays of objects', () => {
  const out: any = redactPayload({ steps: [{ name: 'A', token: SECRET }, { name: 'B', token: SECRET }] })
  assert.equal(out.steps[0].name, 'A')
  assert.equal(out.steps[1].name, 'B')
  assert.notEqual(out.steps[0].token, SECRET)
  assert.notEqual(out.steps[1].token, SECRET)
})

test('keeps a short recognisability hint for long secrets, fully masks short ones', () => {
  const long: any = redactPayload({ token: 'ABCDEFGHIJKL' })
  assert.ok(long.token.startsWith('AB'), 'first two chars kept as a hint')
  assert.ok(long.token.endsWith('KL'), 'last two chars kept as a hint')
  assert.ok(long.token.includes('•'))

  const short: any = redactPayload({ token: 'abc' })
  assert.equal(short.token.includes('a'), false, 'short secrets reveal nothing')
})

test('numeric and boolean secret values are masked, not coerced through', () => {
  const out: any = redactPayload({ secret: 1234567890, token: true })
  assert.ok(String(out.secret).includes('•'))
  assert.ok(String(out.token).includes('•'))
})

test('does not mutate the input payload', () => {
  const input = { api_key: SECRET, nested: { token: SECRET } }
  const snapshot = JSON.stringify(input)
  redactPayload(input)
  assert.equal(JSON.stringify(input), snapshot, 'original object must be untouched')
})

test('non-object payloads pass through without throwing', () => {
  assert.equal(redactPayload('plain' as unknown), 'plain')
  assert.equal(redactPayload(42 as unknown), 42)
  assert.equal(redactPayload(null as unknown), null)
})

test('redactPrForDisplay masks every step payload but leaves PR metadata intact', () => {
  const pr = {
    id: 'pr_1',
    title: 'Set OpenAI key',
    status: 'open',
    risk: 'high',
    steps: [
      { templateId: 'vercel.set_env', label: 'Set OPENAI_API_KEY', payload: { key: 'OPENAI_API_KEY', value: SECRET } },
    ],
  }
  const out: any = redactPrForDisplay(pr)
  assert.equal(out.id, 'pr_1')
  assert.equal(out.title, 'Set OpenAI key')
  assert.equal(out.status, 'open')
  assert.equal(out.risk, 'high')
  assert.equal(out.steps[0].templateId, 'vercel.set_env')
  assert.equal(out.steps[0].label, 'Set OPENAI_API_KEY')
  assert.equal(out.steps[0].payload.key, 'OPENAI_API_KEY')
  assert.notEqual(out.steps[0].payload.value, SECRET)
})

test('redactPrsForDisplay redacts each PR in a list', () => {
  const prs = [
    { id: 'a', steps: [{ payload: { token: SECRET } }] },
    { id: 'b', steps: [{ payload: { token: SECRET } }] },
  ]
  const out: any = redactPrsForDisplay(prs)
  assert.notEqual(out[0].steps[0].payload.token, SECRET)
  assert.notEqual(out[1].steps[0].payload.token, SECRET)
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { executeCommunication, listCommunicationAdapters } from '../lib/communication-hub/hub'

const originalFetch = global.fetch

test('communication hub exposes Gmail, Microsoft 365, SMTP and universal email transports', () => {
  const ids = listCommunicationAdapters().map((entry) => entry.providerId)
  assert.deepEqual(ids.sort(), ['gmail', 'microsoft-365', 'smtp', 'universal-email-adapter'].sort())
})

test('Gmail send executes the real Gmail API boundary', async () => {
  let called = ''
  global.fetch = (async (url: string | URL | Request) => {
    called = String(url)
    return new Response(JSON.stringify({ id: 'gmail-message-1', threadId: 'thread-1' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }) as typeof fetch
  try {
    const result = await executeCommunication('gmail', 'email_send', {
      to: [{ email: 'buyer@example.com' }], subject: 'Hello', text: 'Body', approved: true,
    }, { orgId: 'org-1', accessToken: 'token', policy: { mode: 'automatic' } })
    assert.equal(result.ok, true)
    assert.equal(called, 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send')
  } finally { global.fetch = originalFetch }
})

test('Microsoft 365 send executes Graph sendMail', async () => {
  let called = ''
  global.fetch = (async (url: string | URL | Request) => {
    called = String(url)
    return new Response('', { status: 202 })
  }) as typeof fetch
  try {
    const result = await executeCommunication('microsoft-365', 'email_send', {
      to: [{ email: 'buyer@example.com' }], subject: 'Hello', text: 'Body', approved: true,
    }, { orgId: 'org-1', accessToken: 'token', policy: { mode: 'automatic' } })
    assert.equal(result.ok, true)
    assert.equal(called, 'https://graph.microsoft.com/v1.0/me/sendMail')
  } finally { global.fetch = originalFetch }
})

test('approval policy blocks outbound send before provider execution', async () => {
  let calls = 0
  global.fetch = (async () => { calls += 1; return new Response('{}', { status: 200 }) }) as typeof fetch
  try {
    const result = await executeCommunication('gmail', 'email_send', {
      to: [{ email: 'buyer@example.com' }], subject: 'Hello', text: 'Body',
    }, { orgId: 'org-1', accessToken: 'token', policy: { mode: 'approval_required' } })
    assert.equal(result.ok, false)
    assert.equal(result.errorCode, 'EMAIL_APPROVAL_REQUIRED')
    assert.equal(calls, 0)
  } finally { global.fetch = originalFetch }
})

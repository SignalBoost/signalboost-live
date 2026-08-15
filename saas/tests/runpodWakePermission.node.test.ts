import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluateRunpodWakePermission } from '../lib/ai/cos/runpodWakePermission'

const ORIGIN = 'https://saas.signalboostapp.com'

function browserInput(body: any = {}) {
  return {
    body,
    requestOrigin: ORIGIN,
    expectedOrigin: ORIGIN,
    secFetchSite: 'same-origin',
    nowMs: 1_786_835_400_000,
  }
}

test('existing same-origin browser turn may wake RunPod', () => {
  const permission = evaluateRunpodWakePermission(browserInput())
  assert.equal(permission.allowed, true)
  assert.equal(permission.source, 'user_interactive')
  assert.equal(permission.reason, 'same_origin_browser_turn')
})

test('server-to-server or cron-style request cannot wake RunPod', () => {
  const permission = evaluateRunpodWakePermission({
    body: {},
    requestOrigin: null,
    expectedOrigin: ORIGIN,
    secFetchSite: null,
    nowMs: 1_786_835_400_000,
  })
  assert.equal(permission.allowed, false)
  assert.equal(permission.reason, 'origin_mismatch_or_missing')
})

test('cross-site browser request cannot wake RunPod', () => {
  const permission = evaluateRunpodWakePermission({
    body: {},
    requestOrigin: 'https://example.com',
    expectedOrigin: ORIGIN,
    secFetchSite: 'cross-site',
    nowMs: 1_786_835_400_000,
  })
  assert.equal(permission.allowed, false)
})

test('fresh explicit interaction metadata may wake RunPod', () => {
  const nowMs = 1_786_835_400_000
  const permission = evaluateRunpodWakePermission({
    ...browserInput({
      context: {
        userInteraction: {
          id: '3c9479dd-eec5-4f7c-91de-42f447379b43',
          issuedAtMs: nowMs - 5_000,
        },
      },
    }),
    interactionHeader: '1',
    nowMs,
  })
  assert.equal(permission.allowed, true)
  assert.equal(permission.reason, 'fresh_same_origin_user_interaction')
})

test('stale explicit browser interaction cannot wake RunPod', () => {
  const nowMs = 1_786_835_400_000
  const permission = evaluateRunpodWakePermission({
    ...browserInput({
      context: {
        userInteraction: {
          id: '3c9479dd-eec5-4f7c-91de-42f447379b43',
          issuedAtMs: nowMs - 180_000,
        },
      },
    }),
    interactionHeader: '1',
    nowMs,
    maxAgeMs: 120_000,
  })
  assert.equal(permission.allowed, false)
  assert.equal(permission.reason, 'stale_interaction')
})

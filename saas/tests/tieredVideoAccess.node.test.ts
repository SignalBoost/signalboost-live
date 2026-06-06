import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluateVideoAccess } from '../lib/video/tieredAccess.ts'
import { getConciergeAnswer } from '../lib/platform/unifiedPlatform.ts'

const baseUsage = {
  accountId: '00000000-0000-0000-0000-000000000001',
  overageCharges: 0,
}

test('free users are limited to demo video playback and 10 MB storage', () => {
  const demo = evaluateVideoAccess({
    usage: { ...baseUsage, subscriptionTier: 'free', quotaMb: 10, usedMb: 0 },
    uploadSizeMb: 8,
    durationSec: 60,
  })

  assert.equal(demo.status, 'demo')
  assert.equal(demo.allowedPlaybackSeconds, 30)
  assert.equal(demo.storageMode, 'demo')

  const blocked = evaluateVideoAccess({
    usage: { ...baseUsage, subscriptionTier: 'free', quotaMb: 10, usedMb: 0 },
    uploadSizeMb: 11,
  })

  assert.equal(blocked.status, 'blocked')
  assert.equal(blocked.messageKey, 'video.access.freeBlocked')
})

test('paid users get full playback within quota', () => {
  const access = evaluateVideoAccess({
    usage: { ...baseUsage, subscriptionTier: 'pro', quotaMb: 100, usedMb: 40 },
    uploadSizeMb: 25,
    durationSec: 120,
  })

  assert.equal(access.status, 'full')
  assert.equal(access.playbackMode, 'full')
  assert.equal(access.billing.chargeRequired, false)
})

test('over-quota paid users are blocked until overage billing is accepted', () => {
  const blocked = evaluateVideoAccess({
    usage: { ...baseUsage, subscriptionTier: 'enterprise', quotaMb: 100, usedMb: 95 },
    uploadSizeMb: 20,
    durationSec: 300,
  })

  assert.equal(blocked.status, 'blocked')
  assert.equal(blocked.billing.chargeRequired, true)
  assert.equal(blocked.billing.chargeAccepted, false)

  const charged = evaluateVideoAccess({
    usage: { ...baseUsage, subscriptionTier: 'enterprise', quotaMb: 100, usedMb: 95 },
    uploadSizeMb: 20,
    durationSec: 300,
    overageAccepted: true,
    billingProvider: 'paypal',
  })

  assert.equal(charged.status, 'full')
  assert.equal(charged.billing.provider, 'paypal')
  assert.equal(charged.billing.chargeAccepted, true)
  assert.ok(charged.billing.chargeAmount > 0)
})

test('concierge routes video upload and playback intents through tier checks', () => {
  const answer = getConciergeAnswer('Can I upload video and pay overage for playback quota?', 'ru', '/dashboard/video')
  assert.equal(answer.role, 'video_user')
  assert.equal(answer.language, 'ru')
  assert.match(answer.reply, /IntentClassifier|SubscriptionChecker|BillingHandler/)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { cyberProductText, cyberReportPresentationCopy } from '../lib/cyber/cyberReportPresentation.ts'

test('historical saved-plan notice visibly discloses iTMounts display normalization without claiming normalized text is original', () => {
  for (const lang of ['en', 'es', 'pt', 'pl', 'ru']) {
    const copy = cyberReportPresentationCopy(lang)
    assert.match(copy.savedPlanNotice, /iTMounts/)
    assert.ok(copy.savedPlanNotice.length > copy.brandDisplayNotice.length)
    assert.doesNotMatch(copy.savedPlanNotice, /original wording|texto original|texto original|oryginalna treść|исходн.*текст/i)
    assert.doesNotMatch(copy.savedPlanArchive, /original|original|oryginal|исходн/i)
  }
})

test('bare provider host identifier stays exact only as a bounded technical key-value value', () => {
  for (const value of [
    'Host ID: signalboost',
    'host id=SignalBoost',
    'hostId=signalboost',
    '"hostId":"signalboost"',
    'provider=signalboost',
    'provider: SignalBoost',
    'provider="signalboost"',
    "provider='SignalBoost'",
    'provider_host_id=signalboost',
    'provider=signalboost, status=ready',
    'hostId="signalboost"; state=ready',
    'Detected hostId=signalboost.',
    'Detected hostId=signalboost)',
    'Detected hostId=signalboost!',
    'Detected hostId=signalboost?',
    'Configured hostId="signalboost" remains active.',
    "Configured provider='signalboost' remains active.",
  ]) assert.equal(cyberProductText(value), value, value)

  for (const [before, after] of [
    ['SignalBoost prepared a plan', 'iTMounts prepared a plan'],
    ['The provider is SignalBoost', 'The provider is iTMounts'],
    ['Provider: SignalBoost prepared a plan', 'Provider: iTMounts prepared a plan'],
    ['Host ID: SignalBoost prepared the remediation', 'Host ID: iTMounts prepared the remediation'],
    ['hostId=SignalBoost prepared a plan', 'hostId=iTMounts prepared a plan'],
  ]) assert.equal(cyberProductText(before), after, before)
})

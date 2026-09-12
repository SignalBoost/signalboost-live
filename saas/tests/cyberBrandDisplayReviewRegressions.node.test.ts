import test from 'node:test'
import assert from 'node:assert/strict'
import { cyberProductText, cyberReportPresentationCopy } from '../lib/cyber/cyberReportPresentation.ts'

test('historical saved-plan notice visibly discloses iTMounts display normalization in every supported language', () => {
  for (const lang of ['en', 'es', 'pt', 'pl', 'ru']) {
    const copy = cyberReportPresentationCopy(lang)
    assert.match(copy.savedPlanNotice, /iTMounts/)
    assert.ok(copy.savedPlanNotice.length > copy.brandDisplayNotice.length)
  }
})

test('bare provider host identifier stays exact in technical key-value contexts but product prose still normalizes', () => {
  for (const value of [
    'Host ID: signalboost',
    'host id=SignalBoost',
    'provider=signalboost',
    'provider: SignalBoost',
    'provider="signalboost"',
    "provider='SignalBoost'",
    'provider_host_id=signalboost',
  ]) assert.equal(cyberProductText(value), value, value)

  assert.equal(cyberProductText('SignalBoost prepared a plan'), 'iTMounts prepared a plan')
  assert.equal(cyberProductText('The provider is SignalBoost'), 'The provider is iTMounts')
})

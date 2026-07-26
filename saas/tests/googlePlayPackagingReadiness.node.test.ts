import assert from 'node:assert/strict'
import test from 'node:test'

import { assessGooglePlayReadiness } from '../portable-packaging/google-play-readiness.ts'

function readyTwa() {
  return {
    portableId: 'campaign-studio',
    displayName: 'SignalBoost Campaign Studio',
    startUrl: 'https://signalboostapp.com/campaign-studio',
    packagingMode: 'trusted-web-activity' as const,
    hasInteractiveFunctionality: true,
    hasBackNavigation: true,
    hasPrivacyPolicy: true,
    hasSupportContact: true,
    hasAppIcon: true,
    hasFeatureGraphic: true,
    hasScreenshots: true,
    hasContentRatingAnswers: true,
    hasDataSafetyAnswers: true,
    manifestUrl: 'https://signalboostapp.com/manifest.webmanifest',
    serviceWorkerEnabled: true,
    assetLinksUrl: 'https://signalboostapp.com/.well-known/assetlinks.json',
    signingKeyReference: 'vault://android/signing/campaign-studio',
    releaseEvidenceReferences: ['evidence://campaign-studio/v1'],
  }
}

test('marks a complete TWA package contract ready without enabling execution', () => {
  const report = assessGooglePlayReadiness(readyTwa())
  assert.equal(report.status, 'ready')
  assert.deepEqual(report.blockers, [])
  assert.equal(Object.isFrozen(report), true)
  assert.equal(Object.isFrozen(report.checks), true)
  assert.equal(report.appBundleGenerated, false)
  assert.equal(report.signingEnabled, false)
  assert.equal(report.storeSubmissionEnabled, false)
  assert.equal(report.deploymentEnabled, false)
  assert.equal(report.productionExecutionEnabled, false)
})

test('supports a complete Capacitor wrapper contract', () => {
  const input = {
    ...readyTwa(),
    portableId: 'video-maker',
    packagingMode: 'capacitor' as const,
    capacitorConfigPath: 'android/capacitor.config.ts',
    manifestUrl: undefined,
    serviceWorkerEnabled: undefined,
    assetLinksUrl: undefined,
  }
  const report = assessGooglePlayReadiness(input)
  assert.equal(report.status, 'ready')
  assert.equal(report.checks.find(item => item.id === 'wrapper-contract')?.passed, true)
})

test('fails closed with deterministic blocker ordering', () => {
  const report = assessGooglePlayReadiness({
    ...readyTwa(),
    startUrl: 'http://signalboostapp.com/campaign-studio',
    hasInteractiveFunctionality: false,
    hasBackNavigation: false,
    signingKeyReference: '',
    releaseEvidenceReferences: [],
  })
  assert.equal(report.status, 'blocked')
  assert.deepEqual(report.blockers, [
    'start-url',
    'interactive-functionality',
    'back-navigation',
    'signing-reference',
    'release-evidence',
  ])
})

test('rejects incomplete TWA and Capacitor wrapper evidence', () => {
  const twa = assessGooglePlayReadiness({ ...readyTwa(), serviceWorkerEnabled: false })
  assert.equal(twa.blockers.includes('wrapper-contract'), true)

  const capacitor = assessGooglePlayReadiness({
    ...readyTwa(),
    packagingMode: 'capacitor',
    capacitorConfigPath: '',
  })
  assert.equal(capacitor.blockers.includes('wrapper-contract'), true)
})

test('never projects raw signing material or unknown input fields', () => {
  const input = {
    ...readyTwa(),
    signingKeyReference: 'vault://android/signing/campaign-studio',
    privateKey: 'must-not-appear',
  }
  const report = assessGooglePlayReadiness(input)
  const serialized = JSON.stringify(report)
  assert.equal(serialized.includes('must-not-appear'), false)
  assert.equal(serialized.includes('privateKey'), false)
  assert.equal(serialized.includes('vault://android/signing/campaign-studio'), false)
})

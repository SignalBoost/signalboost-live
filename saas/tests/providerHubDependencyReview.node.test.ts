import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { reviewProviderHubDependencies } from '../portable-mobile/provider-hub-dependency-review.ts'
import { hydrateLocalizedSource } from './helpers/hydrateLocalizedSource.ts'


const valid = {
  portableId: 'provider-hub',
  packageName: 'com.signalboost.providerhub',
  scaffoldSchemaVersion: 'signalboost-android-scaffold-v1',
  buildPlanSchemaVersion: 'signalboost-android-build-plan-v1',
  provenanceSchemaVersion: 'signalboost-provider-hub-unsigned-build-provenance-v1',
  jdkVersion: '17.0.12',
  androidSdkVersion: '35.0.0',
  gradleVersion: '8.10.2',
  androidGradlePluginVersion: '8.7.3',
  browserHelperCoordinate: 'com.google.androidbrowserhelper:androidbrowserhelper:2.6.2',
  repositories: ['google', 'mavenCentral'],
  dependencyResolutionPerformed: false,
  signingEnabled: false,
  uploadEnabled: false,
  publicationEnabled: false,
  productionExecutionEnabled: false,
} as const

test('creates deterministic immutable Provider Hub dependency review metadata', () => {
  const first = reviewProviderHubDependencies(valid)
  const second = reviewProviderHubDependencies(valid)
  assert.deepEqual(first, second)
  assert.equal(first.state, 'review_ready')
  assert.deepEqual(first.blockers, [])
  assert.match(first.reviewId, /^dependency-review-[a-f0-9]{8}$/)
  assert.equal(first.networkAccessed, false)
  assert.equal(first.signingEnabled, false)
  assert.ok(Object.isFrozen(first))
  assert.ok(Object.isFrozen(first.dependencies))
  assert.ok(Object.isFrozen(first.dependencies.repositories))
})

test('fails closed for dynamic, unapproved, mismatched, and unsafe dependency evidence', () => {
  const report = reviewProviderHubDependencies({
    ...valid,
    packageName: 'com.example.providerhub',
    gradleVersion: 'latest',
    browserHelperCoordinate: 'com.google.androidbrowserhelper:androidbrowserhelper:+',
    repositories: ['https://user:password@example.com/maven'],
    signingEnabled: true,
  })
  assert.equal(report.state, 'blocked')
  assert.deepEqual(report.blockers, ['browser-helper', 'gradle-version', 'identity', 'repositories', 'unsafe-state'])
})

test('dependency review source has no resolution, execution, signing, upload, or network capability', async () => {
  const source = await readFile(new URL('../portable-mobile/provider-hub-dependency-review.ts', import.meta.url), 'utf8').then(hydrateLocalizedSource)
  for (const forbidden of ["from 'node:fs'", "from 'node:child_process'", 'fetch(', 'exec(', 'spawn(', 'gradlew', 'signingConfigs', 'androidpublisher']) {
    assert.equal(source.includes(forbidden), false, `dependency review must not contain ${forbidden}`)
  }
})

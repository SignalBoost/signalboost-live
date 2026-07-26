import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { validateAndroidBuildEvidence } from '../portable-mobile/android-build-evidence.ts'

const validEvidence = {
  portableId: 'provider-hub',
  packageName: 'com.signalboost.providerhub',
  scaffoldSchemaVersion: 'signalboost-android-scaffold-v1',
  buildPlanSchemaVersion: 'signalboost-android-build-plan-v1',
  sourceCommitSha: 'a'.repeat(40),
  jdkVersion: '17.0.12',
  androidSdkVersion: '35',
  gradleVersion: '8.10.2',
  lintPassed: true,
  testsPassed: true,
  unsignedAabPath: 'app/build/outputs/bundle/release/app-release.aab',
  unsignedAabSha256: 'b'.repeat(64),
  buildStartedAt: '2026-07-26T03:00:00.000Z',
  buildCompletedAt: '2026-07-26T03:05:00.000Z',
  artifactSigned: false,
  artifactUploaded: false,
  playConsolePublished: false,
  productionExecutionEnabled: false,
}

test('validates deterministic Provider Hub external build evidence metadata', () => {
  const report = validateAndroidBuildEvidence(validEvidence)
  assert.equal(report.state, 'evidence_validated')
  assert.deepEqual(report.blockers, [])
  assert.equal(report.artifactAccessed, false)
  assert.equal(report.signingEnabled, false)
  assert.ok(Object.isFrozen(report))
  assert.ok(Object.isFrozen(report.blockers))
})

test('returns blockers in deterministic order and rejects unsafe claims', () => {
  const report = validateAndroidBuildEvidence({
    ...validEvidence,
    sourceCommitSha: 'bad',
    lintPassed: false,
    unsignedAabSha256: 'bad',
    buildCompletedAt: '2026-07-25T03:00:00.000Z',
    artifactSigned: true,
  })
  assert.equal(report.state, 'blocked')
  assert.deepEqual(report.blockers, ['source-commit', 'verification-results', 'artifact-digest', 'timestamps', 'unsafe-state'])
})

test('build-evidence source has no artifact, execution, network, signing, or store capability', async () => {
  const source = await readFile(new URL('../portable-mobile/android-build-evidence.ts', import.meta.url), 'utf8')
  for (const forbidden of ["from 'node:fs'", "from 'node:child_process'", 'readFile(', 'writeFile(', 'exec(', 'spawn(', 'fetch(', 'signingConfigs', 'playConsoleApi']) {
    assert.equal(source.includes(forbidden), false, `build evidence must not contain ${forbidden}`)
  }
})

import assert from 'node:assert/strict'
import test from 'node:test'

import { createUnsignedAndroidScaffold } from '../portable-mobile/android-scaffold.ts'
import { createAndroidBuildPlan } from '../portable-mobile/android-build-plan.ts'
import {
  createAndroidBuildEvidenceManifest,
  verifyAndroidBuildEvidenceManifest,
} from '../portable-mobile/android-build-evidence.ts'
import { providerHubAndroidPackaging } from '../portable-mobile/provider-hub.android.ts'

test('creates deterministic immutable Android build evidence', () => {
  const plan = createAndroidBuildPlan(createUnsignedAndroidScaffold(providerHubAndroidPackaging))
  const first = createAndroidBuildEvidenceManifest(plan)
  const second = createAndroidBuildEvidenceManifest(plan)

  assert.deepEqual(first, second)
  assert.equal(first.state, 'build_evidence_planned')
  assert.match(first.integrityDigest, /^fnv1a32:[0-9a-f]{8}$/)
  assert.equal(verifyAndroidBuildEvidenceManifest(first), true)
  assert.ok(Object.isFrozen(first))
  assert.ok(Object.isFrozen(first.expectedArtifacts))
  assert.deepEqual(first.expectedArtifacts.map(item => item.path), [...first.expectedArtifacts.map(item => item.path)].sort())
})

test('detects tampering and unsafe execution state', () => {
  const plan = createAndroidBuildPlan(createUnsignedAndroidScaffold(providerHubAndroidPackaging))
  const manifest = createAndroidBuildEvidenceManifest(plan)

  assert.equal(verifyAndroidBuildEvidenceManifest({ ...manifest, integrityDigest: 'fnv1a32:00000000' }), false)
  assert.equal(verifyAndroidBuildEvidenceManifest({ ...manifest, appBundleGenerated: true } as never), false)
  assert.throws(() => createAndroidBuildEvidenceManifest({ ...plan, commandsExecuted: true } as never), /rejects executed/)
})

test('rejects malformed and unsafe artifact paths', () => {
  const plan = createAndroidBuildPlan(createUnsignedAndroidScaffold(providerHubAndroidPackaging))
  assert.throws(() => createAndroidBuildEvidenceManifest({
    ...plan,
    expectedArtifacts: ['../app-release.aab'],
  }), /unsafe expected artifact path/)
  assert.throws(() => createAndroidBuildEvidenceManifest({
    ...plan,
    evidenceRequirements: ['toolchain versions', 'toolchain versions'],
  }), /duplicates/)
})

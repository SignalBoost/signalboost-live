import test from 'node:test'
import assert from 'node:assert/strict'
import {
  EXACT_ARTIFACT_CONTAINER_IMAGE_CONTRACT,
  EXACT_ARTIFACT_PRODUCTION_IMAGE,
  exactArtifactContainerImageFromEnv,
  normalizeExactArtifactContainerImage,
} from '../lib/ai/cos/runpodExactArtifactContainerImage.ts'

const digest = 'a'.repeat(64)
const pinned = `ghcr.io/signalboost/itmounts-exact-artifact@sha256:${digest}`

test('exact-artifact image contract accepts only immutable sha256 image references', () => {
  assert.equal(EXACT_ARTIFACT_CONTAINER_IMAGE_CONTRACT, 'sha256-pinned-v1')
  assert.equal(normalizeExactArtifactContainerImage(pinned), pinned)
  assert.equal(normalizeExactArtifactContainerImage('ghcr.io/signalboost/itmounts-exact-artifact:latest'), null)
  assert.equal(normalizeExactArtifactContainerImage('vllm/vllm-openai:v0.29.0'), null)
})

test('standard and XSA image bindings are independent and fail closed on mutable configuration', () => {
  assert.match(EXACT_ARTIFACT_PRODUCTION_IMAGE, /@sha256:[a-f0-9]{64}$/)
  assert.equal(exactArtifactContainerImageFromEnv('standard', {}), EXACT_ARTIFACT_PRODUCTION_IMAGE)
  assert.equal(exactArtifactContainerImageFromEnv('xsa', {}), EXACT_ARTIFACT_PRODUCTION_IMAGE)
  assert.equal(exactArtifactContainerImageFromEnv('standard', { ITMOUNTS_MASS_EXACT_ARTIFACT_IMAGE: pinned }), pinned)
  assert.equal(exactArtifactContainerImageFromEnv('xsa', { ITMOUNTS_XSA_EXACT_ARTIFACT_IMAGE: pinned }), pinned)
  assert.throws(
    () => exactArtifactContainerImageFromEnv('standard', { ITMOUNTS_MASS_EXACT_ARTIFACT_IMAGE: 'ghcr.io/signalboost/worker:latest' }),
    /exact_artifact_container_image_digest_required/,
  )
})

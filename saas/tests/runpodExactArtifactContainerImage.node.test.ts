import test from 'node:test'
import assert from 'node:assert/strict'
import {
  EXACT_ARTIFACT_CONTAINER_IMAGE_CONTRACT,
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
  assert.equal(exactArtifactContainerImageFromEnv('standard', {}), null)
  assert.equal(exactArtifactContainerImageFromEnv('xsa', {}), null)
  assert.equal(exactArtifactContainerImageFromEnv('standard', { ITMOUNTS_MASS_EXACT_ARTIFACT_IMAGE: pinned }), pinned)
  assert.equal(exactArtifactContainerImageFromEnv('xsa', { ITMOUNTS_XSA_EXACT_ARTIFACT_IMAGE: pinned }), pinned)
  assert.throws(
    () => exactArtifactContainerImageFromEnv('standard', { ITMOUNTS_MASS_EXACT_ARTIFACT_IMAGE: 'ghcr.io/signalboost/worker:latest' }),
    /exact_artifact_container_image_digest_required/,
  )
})

// Immutable image contract for exact-artifact RunPod canary/evaluation workers.
// Image selection is configuration-only: this module never builds, pushes, or grants runtime authority.

const DIGEST_PINNED_IMAGE = /^[a-z0-9][a-z0-9._\/-]*(?::[a-z0-9._-]+)?@sha256:[a-f0-9]{64}$/i

export type ExactArtifactContainerLane = 'standard' | 'xsa'

function clean(value: unknown, max = 1000): string {
  return String(value ?? '').trim().slice(0, max)
}

export function normalizeExactArtifactContainerImage(value: unknown): string | null {
  const image = clean(value)
  return DIGEST_PINNED_IMAGE.test(image) ? image : null
}

/**
 * Resolve an immutable prebuilt worker image for the requested lane.
 *
 * A mutable tag is never accepted. XSA has a separate variable because its forward path and
 * dependencies differ from the standard vLLM lane; one image may be deliberately configured for
 * both lanes only by pinning the same digest in both variables.
 */
export function exactArtifactContainerImageFromEnv(
  lane: ExactArtifactContainerLane,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const key = lane === 'xsa'
    ? 'ITMOUNTS_XSA_EXACT_ARTIFACT_IMAGE'
    : 'ITMOUNTS_MASS_EXACT_ARTIFACT_IMAGE'
  const raw = clean(env[key])
  if (!raw) return null
  const pinned = normalizeExactArtifactContainerImage(raw)
  if (!pinned) throw new Error('exact_artifact_container_image_digest_required')
  return pinned
}

export const EXACT_ARTIFACT_CONTAINER_IMAGE_CONTRACT = 'sha256-pinned-v1' as const

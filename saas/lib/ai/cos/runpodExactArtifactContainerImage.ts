// saas/lib/ai/cos/runpodExactArtifactContainerImage.ts
// Immutable image contract for exact-artifact RunPod canary/evaluation workers.
// Image selection is configuration-only: this module never builds, pushes, or grants runtime authority.

const DIGEST_PINNED_IMAGE = /^[a-z0-9][a-z0-9._\/-]*(?::[a-z0-9._-]+)?@sha256:[a-f0-9]{64}$/i

export type ExactArtifactContainerLane = 'standard' | 'xsa'

export const EXACT_ARTIFACT_PRODUCTION_IMAGE =
  'ghcr.io/signalboost/itmounts-exact-artifact@sha256:255fdd4ff3d14de3753afb757fc46130276c9461f17ca17b649f5dd8a27a3ea1' as const

/**
 * XSA lane image, built by "RunPod Exact Artifact Release" from #3460 (2026-09-28). Its xsa_gateway.py serves the
 * true untrained base model for the evaluator's baseline questions (XSA hooks removed + adapter disabled) and
 * answers 204 while loading. The old image refused the base name, so every XSA exam died with
 * xsa_exact_model_mismatch (82 exams, 26 students). Only the XSA lane moves; the standard lane and graduate
 * endpoints keep EXACT_ARTIFACT_PRODUCTION_IMAGE.
 */
export const EXACT_ARTIFACT_XSA_PRODUCTION_IMAGE =
  'ghcr.io/signalboost/itmounts-exact-artifact@sha256:0322426c59f7837c8b59deaffe946d3d5c1c58ed02d1749eeb9293ee045a2986' as const

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
  const raw = clean(env[key]) || (lane === 'xsa' ? EXACT_ARTIFACT_XSA_PRODUCTION_IMAGE : EXACT_ARTIFACT_PRODUCTION_IMAGE)
  const pinned = normalizeExactArtifactContainerImage(raw)
  if (!pinned) throw new Error('exact_artifact_container_image_digest_required')
  return pinned
}

export const EXACT_ARTIFACT_CONTAINER_IMAGE_CONTRACT = 'sha256-pinned-v1' as const

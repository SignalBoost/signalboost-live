export function configuredRunpodApiKey(): string | null {
  return process.env.RUNPOD_API_KEY?.trim() || null
}

export function explicitRunpodPodId(): string | null {
  return process.env.RUNPOD_POD_ID?.trim() || null
}

/**
 * Legacy compatibility only. The standard RunPod proxy host is <pod-id>-<port>.proxy.runpod.net.
 * The live reasoner endpoint is authoritative; stale RUNPOD_* variables never select a pod.
 */
export function deriveRunpodPodIdFromLocalAiBaseUrl(value = process.env.LOCAL_AI_BASE_URL || ''): string | null {
  if (!value.trim()) return null
  try {
    const host = new URL(value).hostname.toLowerCase()
    const match = host.match(/^([a-z0-9]+)-\d+\.proxy\.runpod\.net$/i)
    return match?.[1] || null
  } catch {
    return null
  }
}

/**
 * Whether the reasoner endpoint COS is actually invoking is RunPod.
 * Stale RunPod credentials or pod ids alone never grant lifecycle authority.
 */
export function localInferenceTargetsRunpod(value = process.env.LOCAL_AI_BASE_URL || ''): boolean {
  return deriveRunpodPodIdFromLocalAiBaseUrl(value) !== null
}

/**
 * Legacy compatibility only. Never fall back to RUNPOD_POD_ID when the active inference endpoint
 * is another provider; doing so previously emitted misleading RunPod telemetry on DeepInfra.
 */
export function configuredRunpodPodId(): string | null {
  return deriveRunpodPodIdFromLocalAiBaseUrl(process.env.LOCAL_AI_BASE_URL || '')
}

export function runpodControlConfigured(): boolean {
  return Boolean(configuredRunpodApiKey() && configuredRunpodPodId())
}

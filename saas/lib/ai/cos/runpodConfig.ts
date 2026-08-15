export function configuredRunpodApiKey(): string | null {
  return process.env.RUNPOD_API_KEY?.trim() || null
}

export function explicitRunpodPodId(): string | null {
  return process.env.RUNPOD_POD_ID?.trim() || null
}

/**
 * The standard RunPod proxy host is <pod-id>-<port>.proxy.runpod.net.
 * LOCAL_AI_BASE_URL already has to point at that host for the COS reasoner, so requiring the
 * same pod id a second time is unnecessary and can silently disable lifecycle cost control.
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

export function configuredRunpodPodId(): string | null {
  return explicitRunpodPodId() || deriveRunpodPodIdFromLocalAiBaseUrl()
}

export function runpodControlConfigured(): boolean {
  return Boolean(configuredRunpodApiKey() && configuredRunpodPodId())
}

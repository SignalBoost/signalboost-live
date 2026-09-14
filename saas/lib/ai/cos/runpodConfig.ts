let runtimeRunpodPodIdOverride: string | null = null

export function configuredRunpodApiKey(): string | null {
  return process.env.RUNPOD_API_KEY?.trim() || null
}

export function explicitRunpodPodId(): string | null {
  return process.env.RUNPOD_PRIMARY_POD_ID?.trim() || process.env.RUNPOD_POD_ID?.trim() || null
}

/**
 * The standard RunPod proxy host is <pod-id>-<port>.proxy.runpod.net.
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
 * Whether the currently configured legacy LOCAL_AI endpoint itself is RunPod.
 * This remains useful for compatibility, but it is no longer the authority for RunPod lifecycle
 * control: RunPod can now be managed as the primary iTMounts compute plane while LOCAL_AI_* remains
 * the DeepInfra fallback transport.
 */
export function localInferenceTargetsRunpod(value = process.env.LOCAL_AI_BASE_URL || ''): boolean {
  return deriveRunpodPodIdFromLocalAiBaseUrl(value) !== null
}

/**
 * A verified account lookup may temporarily repair a stale deployment pod id for the lifetime of a
 * server process. This never invents or persists infrastructure identity: the resolver may set the
 * override only after proving that the configured id is absent and exactly one canonical iTMounts
 * reasoner pod exists in the authenticated RunPod account.
 */
export function setRuntimeRunpodPodIdOverride(value: string | null): void {
  const normalized = String(value || '').trim()
  runtimeRunpodPodIdOverride = /^[a-z0-9]+$/i.test(normalized) ? normalized : null
}

export function clearRuntimeRunpodPodIdOverride(): void {
  runtimeRunpodPodIdOverride = null
}

/**
 * RunPod primary identity is explicitly configured first. A verified runtime recovery override may
 * supersede a stale configured id after account discovery. Falling back to a RunPod-shaped
 * LOCAL_AI_BASE_URL preserves older deployments without letting a DeepInfra LOCAL_AI_BASE_URL hide a
 * valid RUNPOD_POD_ID.
 */
export function configuredRunpodPodId(): string | null {
  return runtimeRunpodPodIdOverride || explicitRunpodPodId() || deriveRunpodPodIdFromLocalAiBaseUrl(process.env.LOCAL_AI_BASE_URL || '')
}

export function runpodControlConfigured(): boolean {
  return Boolean(configuredRunpodApiKey() && configuredRunpodPodId())
}

export function runpodPrimaryBaseUrl(podId = configuredRunpodPodId()): string | null {
  return podId ? `https://${podId}-11434.proxy.runpod.net/v1` : null
}

export function runpodPrimaryHost(podId = configuredRunpodPodId()): string | null {
  return podId ? `${podId}-11434.proxy.runpod.net` : null
}

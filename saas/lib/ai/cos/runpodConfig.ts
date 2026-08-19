export function configuredRunpodApiKey(): string | null {
  return process.env.RUNPOD_API_KEY?.trim() || null
}

export function explicitRunpodPodId(): string | null {
  return process.env.RUNPOD_POD_ID?.trim() || null
}

/**
 * The standard RunPod proxy host is <pod-id>-<port>.proxy.runpod.net.
 * LOCAL_AI_BASE_URL is the endpoint COS actually health-checks and invokes, so when it carries a
 * RunPod pod id that id is authoritative for lifecycle control too. Otherwise COS can resume one
 * pod via RUNPOD_POD_ID while probing a different/stale proxy URL and spend the whole cold-start
 * budget waiting on HTTP 404s from the wrong endpoint.
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

let mismatchLogged = false

export function configuredRunpodPodId(): string | null {
  const derived = deriveRunpodPodIdFromLocalAiBaseUrl()
  const explicit = explicitRunpodPodId()

  if (derived && explicit && derived !== explicit && !mismatchLogged) {
    mismatchLogged = true
    console.warn('[cos-runpod-config-mismatch]', JSON.stringify({
      at: new Date().toISOString(),
      explicitPodId: explicit,
      endpointPodId: derived,
      selectedPodId: derived,
      reason: 'LOCAL_AI_BASE_URL is authoritative because it is the endpoint COS actually invokes',
    }))
  }

  return derived || explicit
}

export function runpodControlConfigured(): boolean {
  return Boolean(configuredRunpodApiKey() && configuredRunpodPodId())
}

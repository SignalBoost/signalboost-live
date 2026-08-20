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

/**
 * Whether the reasoner endpoint COS is actually invoking is RunPod.
 *
 * This is the provider-neutrality boundary. RUNPOD_API_KEY/RUNPOD_POD_ID may remain configured as
 * fallback or historical lab state, but they must never cause lifecycle control when the live
 * reasoner has moved to DeepInfra, Fireworks, Together, a customer vLLM cluster, or any other
 * OpenAI-compatible endpoint.
 */
export function localInferenceTargetsRunpod(value = process.env.LOCAL_AI_BASE_URL || ''): boolean {
  return deriveRunpodPodIdFromLocalAiBaseUrl(value) !== null
}

let mismatchLogged = false
let detachedEndpointLogged = false

export function configuredRunpodPodId(): string | null {
  const endpoint = process.env.LOCAL_AI_BASE_URL || ''
  const endpointConfigured = endpoint.trim().length > 0
  const derived = deriveRunpodPodIdFromLocalAiBaseUrl(endpoint)
  const explicit = explicitRunpodPodId()

  // Once COS points at a non-RunPod endpoint, stale RunPod credentials are merely dormant lab
  // configuration. They are NOT permission to start/stop a different compute provider in the
  // background. The live reasoner endpoint is authoritative.
  if (endpointConfigured && !derived) {
    if (explicit && !detachedEndpointLogged) {
      detachedEndpointLogged = true
      console.info('[cos-runpod-detached]', JSON.stringify({
        at: new Date().toISOString(),
        explicitPodId: explicit,
        selectedPodId: null,
        reason: 'LOCAL_AI_BASE_URL points outside RunPod; RunPod lifecycle control is disabled for this reasoner.',
      }))
    }
    return null
  }

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

  // Preserve explicit-id-only control for maintenance tooling when no reasoner endpoint is set.
  return derived || (!endpointConfigured ? explicit : null)
}

export function runpodControlConfigured(): boolean {
  return Boolean(configuredRunpodApiKey() && configuredRunpodPodId())
}

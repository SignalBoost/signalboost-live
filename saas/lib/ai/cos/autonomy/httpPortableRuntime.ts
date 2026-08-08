import type {
  CosAutonomyPlan,
  CosProposedAction,
  PortableActionResult,
  PortableManifest,
  PortableObservation,
  PortableRecoveryResult,
  PortableVerificationResult,
  UniversalPortableRuntime,
} from './types.ts'

export interface PortableHttpEndpointConfig {
  portableId: string
  baseUrl: string
  bearerToken?: string
  timeoutMs?: number
}

export interface PortableHttpTransport {
  request(input: {
    url: string
    method: 'GET' | 'POST'
    headers: Record<string, string>
    body?: unknown
    timeoutMs: number
  }): Promise<{ ok: boolean; status: number; json?: unknown; error?: string }>
}

function normalizeBaseUrl(value: string): string {
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('cos_portable_endpoint_invalid_protocol')
  url.pathname = url.pathname.replace(/\/+$/, '')
  url.search = ''
  url.hash = ''
  return url.toString().replace(/\/$/, '')
}

export function createFetchPortableTransport(fetchImpl: typeof fetch = fetch): PortableHttpTransport {
  return {
    async request({ url, method, headers, body, timeoutMs }) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const response = await fetchImpl(url, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.signal,
          cache: 'no-store',
        })
        const text = await response.text()
        let json: unknown = undefined
        if (text) {
          try { json = JSON.parse(text) } catch { return { ok: false, status: response.status, error: 'cos_portable_endpoint_non_json_response' } }
        }
        return response.ok
          ? { ok: true, status: response.status, json }
          : { ok: false, status: response.status, json, error: `cos_portable_endpoint_http_${response.status}` }
      } catch (error) {
        return { ok: false, status: 0, error: error instanceof Error ? error.message : 'cos_portable_endpoint_request_failed' }
      } finally {
        clearTimeout(timer)
      }
    },
  }
}

export class HttpUniversalPortableRuntime implements UniversalPortableRuntime {
  private readonly config: Required<Pick<PortableHttpEndpointConfig, 'portableId' | 'baseUrl' | 'timeoutMs'>> & Pick<PortableHttpEndpointConfig, 'bearerToken'>
  private readonly transport: PortableHttpTransport

  constructor(config: PortableHttpEndpointConfig, transport: PortableHttpTransport = createFetchPortableTransport()) {
    this.config = {
      portableId: config.portableId.trim(),
      baseUrl: normalizeBaseUrl(config.baseUrl),
      bearerToken: config.bearerToken,
      timeoutMs: Math.max(1000, Math.min(config.timeoutMs ?? 30000, 120000)),
    }
    if (!this.config.portableId) throw new Error('cos_portable_endpoint_missing_id')
    this.transport = transport
  }

  private headers(): Record<string, string> {
    return {
      'content-type': 'application/json',
      accept: 'application/json',
      ...(this.config.bearerToken ? { authorization: `Bearer ${this.config.bearerToken}` } : {}),
    }
  }

  private async call<T>(path: string, method: 'GET' | 'POST', body?: unknown): Promise<T> {
    const response = await this.transport.request({
      url: `${this.config.baseUrl}${path}`,
      method,
      headers: this.headers(),
      body,
      timeoutMs: this.config.timeoutMs,
    })
    if (!response.ok) throw new Error(response.error || `cos_portable_endpoint_failed:${path}`)
    return response.json as T
  }

  async getManifest(): Promise<PortableManifest> {
    const manifest = await this.call<PortableManifest>('/manifest', 'GET')
    if (manifest.portableId !== this.config.portableId) throw new Error('cos_portable_manifest_id_mismatch')
    return manifest
  }

  observe(input: { objective: string }): Promise<PortableObservation> {
    return this.call('/observe', 'POST', input)
  }

  invoke(input: { objective: string; action: CosProposedAction }): Promise<PortableActionResult> {
    return this.call('/invoke', 'POST', input)
  }

  verify(input: { objective: string; observation: PortableObservation; plan: CosAutonomyPlan; results: readonly PortableActionResult[] }): Promise<PortableVerificationResult> {
    return this.call('/verify', 'POST', input)
  }

  recover(input: { objective: string; observation: PortableObservation; plan: CosAutonomyPlan; results: readonly PortableActionResult[]; verification: PortableVerificationResult }): Promise<PortableRecoveryResult> {
    return this.call('/recover', 'POST', input)
  }
}

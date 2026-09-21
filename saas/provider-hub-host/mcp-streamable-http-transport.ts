import type {
  McpOutboundScope,
  McpOutboundTransport,
  McpOutboundTransportInput,
} from './mcp-outbound-client.ts'
import type { McpRegistryTransportFactory } from './mcp-connection-registry.ts'

export const MCP_STREAMABLE_HTTP_TRANSPORT_VERSION = 'mcp-streamable-http-transport-v1' as const

export interface McpStreamableHttpProfile {
  readonly serverId: string
  readonly transportRef: string
  readonly endpoint: string
  readonly protocolVersion: string
  readonly authorization?: (scope: McpOutboundScope) => string | null
  readonly headers?: Readonly<Record<string, string>>
  readonly maxResponseBytes?: number
}

const FORBIDDEN_STATIC_HEADER = /^(?:authorization|cookie|set-cookie|proxy-authorization)$/i

function required(value: unknown, name: string): string {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new Error(`MCP HTTP ${name} is required`)
  return normalized
}

function safeEndpoint(value: string): string {
  const endpoint = new URL(required(value, 'endpoint'))
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.hash) {
    throw new Error('mcp_http_endpoint_rejected')
  }
  return endpoint.toString()
}

function boundedBytes(value: number | undefined): number {
  const resolved = value ?? 2 * 1024 * 1024
  if (!Number.isFinite(resolved) || resolved < 1024 || resolved > 8 * 1024 * 1024) {
    throw new Error('mcp_http_response_limit_invalid')
  }
  return Math.floor(resolved)
}

function normalizeHeaders(value: Readonly<Record<string, string>> | undefined): Readonly<Record<string, string>> {
  const output: Record<string, string> = {}
  for (const [key, rawValue] of Object.entries(value ?? {})) {
    const name = required(key, 'header.name')
    if (FORBIDDEN_STATIC_HEADER.test(name)) throw new Error(`mcp_http_static_secret_header_rejected:${name}`)
    output[name] = required(rawValue, `header.${name}`)
  }
  return Object.freeze(output)
}

function parseSse(text: string, expectedId: string | number): unknown {
  for (const block of text.split(/\r?\n\r?\n/)) {
    const data = block
      .split(/\r?\n/)
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice(5).trimStart())
      .join('\n')
      .trim()
    if (!data || data === '[DONE]') continue
    let parsed: unknown
    try { parsed = JSON.parse(data) } catch { continue }
    if (
      typeof parsed === 'object' && parsed !== null &&
      !Array.isArray(parsed) &&
      (parsed as Record<string, unknown>).id === expectedId
    ) return parsed
  }
  throw new Error('mcp_http_sse_response_missing')
}

async function responseBody(response: Response, maxBytes: number, expectedId: string | number): Promise<unknown> {
  const bytes = await response.arrayBuffer()
  if (bytes.byteLength > maxBytes) throw new Error(`mcp_http_response_too_large:${bytes.byteLength}`)
  const text = new TextDecoder().decode(bytes).trim()
  if (!text) throw new Error('mcp_http_empty_response')
  const contentType = String(response.headers.get('content-type') || '').toLowerCase()
  if (contentType.includes('text/event-stream')) return parseSse(text, expectedId)
  try { return JSON.parse(text) } catch { throw new Error('mcp_http_invalid_json_response') }
}

function exactProfile(
  profiles: readonly McpStreamableHttpProfile[],
  serverId: string,
  transportRef: string,
): Readonly<Required<Pick<McpStreamableHttpProfile, 'serverId' | 'transportRef' | 'endpoint' | 'protocolVersion' | 'maxResponseBytes'>> & Pick<McpStreamableHttpProfile, 'authorization' | 'headers'>> {
  const match = profiles.find(item => item.serverId === serverId && item.transportRef === transportRef)
  if (!match) throw new Error('mcp_http_unregistered_transport')
  return Object.freeze({
    serverId: required(match.serverId, 'serverId'),
    transportRef: required(match.transportRef, 'transportRef'),
    endpoint: safeEndpoint(match.endpoint),
    protocolVersion: required(match.protocolVersion, 'protocolVersion'),
    maxResponseBytes: boundedBytes(match.maxResponseBytes),
    authorization: match.authorization,
    headers: normalizeHeaders(match.headers),
  })
}

export function createMcpStreamableHttpTransportFactory(input: {
  profiles: readonly McpStreamableHttpProfile[]
  fetcher?: typeof fetch
}): McpRegistryTransportFactory {
  const fetcher = input.fetcher ?? fetch
  const profiles = Object.freeze([...input.profiles])

  return Object.freeze({
    create({ serverId, transportRef, scope }) {
      const profile = exactProfile(profiles, serverId, transportRef)
      let sessionId: string | null = null
      let closed = false

      const headers = (): Record<string, string> => {
        const resolved: Record<string, string> = {
          Accept: 'application/json, text/event-stream',
          'Content-Type': 'application/json',
          'MCP-Protocol-Version': profile.protocolVersion,
          ...profile.headers,
        }
        if (sessionId) resolved['Mcp-Session-Id'] = sessionId
        const authorization = profile.authorization?.(scope)
        if (authorization) resolved.Authorization = required(authorization, 'authorization')
        return resolved
      }

      async function post(call: McpOutboundTransportInput, notification: boolean): Promise<unknown> {
        if (closed) throw new Error('mcp_http_transport_closed')
        if (
          call.serverId !== profile.serverId ||
          call.scope.tenantId !== scope.tenantId ||
          call.scope.environmentId !== scope.environmentId ||
          call.scope.portableId !== scope.portableId
        ) throw new Error('mcp_http_scope_mismatch')

        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), call.timeoutMs)
        try {
          const response = await fetcher(profile.endpoint, {
            method: 'POST',
            headers: headers(),
            body: JSON.stringify(call.request),
            redirect: 'error',
            cache: 'no-store',
            signal: controller.signal,
          })
          const returnedSession = response.headers.get('mcp-session-id')
          if (returnedSession) sessionId = required(returnedSession, 'session_id')
          if (!response.ok) throw new Error(`mcp_http_status_${response.status}`)
          if (notification) return undefined
          const id = call.request.id
          if (typeof id !== 'string' && typeof id !== 'number') throw new Error('mcp_http_request_id_required')
          return await responseBody(response, profile.maxResponseBytes, id)
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') throw new Error('mcp_http_timeout')
          if (error instanceof Error && /^mcp_http_/.test(error.message)) throw error
          throw new Error('mcp_http_transport_failure')
        } finally {
          clearTimeout(timer)
        }
      }

      const transport: McpOutboundTransport = {
        send(call) { return post(call, false) },
        async notify(call) { await post(call, true) },
        async close() {
          if (closed) return
          closed = true
          if (!sessionId) return
          try {
            await fetcher(profile.endpoint, {
              method: 'DELETE',
              headers: headers(),
              redirect: 'error',
              cache: 'no-store',
            })
          } catch {
            // Session cleanup is best-effort. Authority has already been revoked locally by closed=true.
          } finally {
            sessionId = null
          }
        },
      }
      return Object.freeze(transport)
    },
  })
}

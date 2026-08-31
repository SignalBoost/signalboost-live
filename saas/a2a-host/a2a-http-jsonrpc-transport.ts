import type { A2AScope, A2ATransport } from '../a2a-core/a2a-client.ts'
import type { A2ATransportFactory } from './a2a-agent-registry.ts'

export const A2A_HTTP_JSONRPC_TRANSPORT_VERSION = 'signalboost-a2a-http-jsonrpc-v1' as const

export interface A2AResolvedHttpConnection {
  endpoint: string
  headers?: Readonly<Record<string, string>>
}

export interface A2AHttpConnectionResolver {
  resolve(input: { agentId: string; transportRef: string; scope: A2AScope }): Promise<A2AResolvedHttpConnection> | A2AResolvedHttpConnection
}

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>

function validEndpoint(value: unknown, allowInsecureLoopbackForTests: boolean): string {
  const raw = String(value ?? '').trim()
  let url: URL
  try { url = new URL(raw) } catch { throw new Error('a2a_http_endpoint_invalid') }
  const loopback = url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '::1'
  if (url.protocol !== 'https:' && !(allowInsecureLoopbackForTests && loopback && url.protocol === 'http:')) {
    throw new Error('a2a_http_endpoint_must_be_https')
  }
  if (url.username || url.password) throw new Error('a2a_http_endpoint_embedded_credentials_rejected')
  return url.toString()
}

function safeHeaders(value: Readonly<Record<string, string>> | undefined): Headers {
  const headers = new Headers(value ?? {})
  headers.set('content-type', 'application/json')
  headers.set('accept', 'application/json')
  return headers
}

async function boundedJson(response: Response, maxResponseBytes: number): Promise<unknown> {
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.toLowerCase().includes('application/json')) throw new Error('a2a_http_response_content_type_invalid')
  const text = await response.text()
  if (Buffer.byteLength(text, 'utf8') > maxResponseBytes) throw new Error('a2a_http_response_too_large')
  if (!response.ok) throw new Error(`a2a_http_status_${response.status}`)
  try { return JSON.parse(text) } catch { throw new Error('a2a_http_response_invalid_json') }
}

export function createA2AHttpJsonRpcTransportFactory(options: {
  connectionResolver: A2AHttpConnectionResolver
  fetchImpl?: FetchLike
  maxResponseBytes?: number
  allowInsecureLoopbackForTests?: boolean
}): A2ATransportFactory {
  const fetchImpl = options.fetchImpl ?? fetch
  const maxResponseBytes = Math.max(1_024, Math.floor(options.maxResponseBytes ?? 1_048_576))
  const allowInsecureLoopbackForTests = options.allowInsecureLoopbackForTests === true

  return Object.freeze({
    create(input): A2ATransport {
      return Object.freeze({
        async send(sendInput) {
          const connection = await options.connectionResolver.resolve({
            agentId: input.agentId,
            transportRef: input.transportRef,
            scope: input.scope,
          })
          const endpoint = validEndpoint(connection.endpoint, allowInsecureLoopbackForTests)
          const controller = new AbortController()
          const timer = setTimeout(() => controller.abort(), sendInput.timeoutMs)
          try {
            const response = await fetchImpl(endpoint, {
              method: 'POST',
              headers: safeHeaders(connection.headers),
              body: JSON.stringify(sendInput.request),
              signal: controller.signal,
              redirect: 'error',
            })
            return await boundedJson(response, maxResponseBytes)
          } catch (error) {
            if (controller.signal.aborted) throw new Error('a2a_http_timeout')
            throw error
          } finally {
            clearTimeout(timer)
          }
        },
      })
    },
  })
}

export async function fetchA2AAgentCard(options: {
  url: string
  headers?: Readonly<Record<string, string>>
  fetchImpl?: FetchLike
  timeoutMs?: number
  maxResponseBytes?: number
  allowInsecureLoopbackForTests?: boolean
}): Promise<unknown> {
  const endpoint = validEndpoint(options.url, options.allowInsecureLoopbackForTests === true)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.max(250, Math.floor(options.timeoutMs ?? 10_000)))
  try {
    const response = await (options.fetchImpl ?? fetch)(endpoint, {
      method: 'GET',
      headers: new Headers({ accept: 'application/json', ...(options.headers ?? {}) }),
      signal: controller.signal,
      redirect: 'error',
    })
    return await boundedJson(response, Math.max(1_024, Math.floor(options.maxResponseBytes ?? 262_144)))
  } catch (error) {
    if (controller.signal.aborted) throw new Error('a2a_agent_card_fetch_timeout')
    throw error
  } finally {
    clearTimeout(timer)
  }
}

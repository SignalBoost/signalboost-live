// saas/provider-hub-core/transports/https-read.ts
//
// THE READ THAT ACTUALLY HAPPENS. Provider Hub stops being a specification.
//
// Every live-data read ended at `ProviderLiveDataReadTransport` — an interface the BUYER had to
// implement — and `ProviderLiveDataDigestPort` alongside it. So a customer who bought this
// portable received validation, refusals and an evidence record, and then had to write the HTTP
// client and the hashing themselves. Both are now shipped.
//
// NOTHING HERE IS A DEPENDENCY. `fetch`, `AbortController` and `crypto.subtle` are global in
// Node 18+, so the payload still contains no package, no SDK and no environment read.
//
// THE FOUR THINGS THIS TRANSPORT REFUSES, and why each one is a real leak rather than a
// theoretical one:
//
//   A REDIRECT THAT LEAVES THE ORIGIN. This is the important one. The request carries the
//   buyer's credential in an Authorization header; `fetch` follows redirects by default and
//   will happily replay that header at wherever it is sent. A provider whose endpoint is
//   redirected — by a misconfiguration, an expired domain, or an attacker who controls a
//   dangling CNAME — hands somebody else a working credential. Redirects are therefore NOT
//   followed automatically: a cross-origin one is refused outright, and a same-origin one is
//   followed only within a small bounded count.
//
//   A CREDENTIAL IN THE URL. It goes in a header. A URL with a key in it ends up in access
//   logs, error messages, referrer headers and screenshots.
//
//   AN UNBOUNDED RESPONSE. A read with no ceiling is a memory exhaustion away from taking the
//   buyer's process down, and this portable is supposed to be the safe part of their stack.
//
//   PLAINTEXT. https only. The adapter already refuses a plaintext source URL; this refuses it
//   again at the transport, because a defence that exists in one layer only stops working the
//   day someone calls the other layer directly.
//
// WHAT IT RETURNS is deliberately narrow: a status, a body and the four headers the evidence
// record actually uses. Passing every response header through would put cookies and vendor
// tokens one careless log line away from being written down.

import type { ProviderLiveDataDigestPort, ProviderLiveDataReadTransport, ProviderLiveDataTransportResponse } from '../live-data-read-adapter.ts'

export type HttpsReadAuth =
  | { kind: 'none' }
  | { kind: 'bearer'; credential: string }
  | { kind: 'header'; header: string; credential: string }
  | { kind: 'basic'; username: string; credential: string }

export type HttpsReadOptions = {
  /** How the buyer's credential is presented. Never read from the environment. */
  auth?: HttpsReadAuth
  /** Extra request headers — an API version, an account id. Never a credential. */
  headers?: Readonly<Record<string, string>>
  /** Largest response this transport will hold, in bytes. Defaults to 5 MB. */
  maxBytes?: number
  /** Same-origin redirects to follow before giving up. Defaults to 2. Cross-origin: never. */
  maxRedirects?: number
  /** Sent so a provider can identify the caller in their own logs. */
  userAgent?: string
}

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024
const DEFAULT_MAX_REDIRECTS = 2

/** Only the headers the evidence record uses. Everything else is dropped on purpose. */
const RETAINED_HEADERS = ['etag', 'x-result-count', 'x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset-at']

function authHeaders(auth: HttpsReadAuth | undefined): Record<string, string> {
  if (!auth || auth.kind === 'none') return {}
  if (auth.kind === 'bearer') return { authorization: `Bearer ${auth.credential}` }
  if (auth.kind === 'basic') return { authorization: `Basic ${btoa(`${auth.username}:${auth.credential}`)}` }
  return { [auth.header]: auth.credential }
}

function assertReadableUrl(raw: string): URL {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new Error('https-read-invalid-url')
  }
  if (parsed.protocol !== 'https:') throw new Error('https-read-plaintext-refused')
  if (parsed.username || parsed.password) throw new Error('https-read-credentials-in-url')
  return parsed
}

/**
 * Read the body with a ceiling, streaming so an oversized response is abandoned rather than
 * downloaded in full and then rejected. A cap enforced after the fact is not a cap.
 */
async function readBounded(response: Response, maxBytes: number): Promise<string> {
  const declared = Number(response.headers.get('content-length') || '')
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error(`https-read-response-too-large: ${declared} bytes exceeds ${maxBytes}`)

  const body = response.body
  if (!body) return ''
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel().catch(() => {})
        throw new Error(`https-read-response-too-large: exceeded ${maxBytes} bytes`)
      }
      chunks.push(value)
    }
  }
  const joined = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    joined.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(joined)
}

/**
 * Build a read transport from credentials.
 *
 * Drops straight into the port the adapter already calls, so nothing else in the portable
 * changes — what changes is that the port is now full rather than empty.
 */
export function createHttpsReadTransport(options: HttpsReadOptions = {}): ProviderLiveDataReadTransport {
  const maxBytes = Number.isInteger(options.maxBytes) && Number(options.maxBytes) > 0 ? Number(options.maxBytes) : DEFAULT_MAX_BYTES
  const maxRedirects = Number.isInteger(options.maxRedirects) && Number(options.maxRedirects) >= 0 ? Number(options.maxRedirects) : DEFAULT_MAX_REDIRECTS

  return {
    async get(input) {
      const start = assertReadableUrl(input.url)
      const timeoutMs = Number(input.timeoutMs) > 0 ? Number(input.timeoutMs) : 10_000

      let current = start
      for (let hop = 0; hop <= maxRedirects; hop += 1) {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), timeoutMs)
        let response: Response
        try {
          response = await fetch(current.toString(), {
            method: 'GET',
            // manual, so a redirect is a decision this file makes rather than one fetch makes
            // silently with the credential attached.
            redirect: 'manual',
            headers: {
              accept: 'application/json, text/plain;q=0.9, */*;q=0.5',
              ...(options.userAgent ? { 'user-agent': options.userAgent } : {}),
              ...(options.headers || {}),
              ...authHeaders(options.auth),
            },
            signal: controller.signal,
          })
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') throw new Error(`https-read-timeout after ${timeoutMs}ms`)
          throw error
        } finally {
          clearTimeout(timer)
        }

        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get('location') || ''
          if (!location) throw new Error('https-read-redirect-without-location')
          let next: URL
          try {
            next = new URL(location, current)
          } catch {
            throw new Error('https-read-redirect-invalid-location')
          }
          if (next.origin !== start.origin) {
            // The refusal that protects the credential. Named specifically so a buyer reading
            // it understands this is a security decision, not a network failure.
            throw new Error(`https-read-cross-origin-redirect-refused: ${start.origin} → ${next.origin}`)
          }
          if (next.protocol !== 'https:') throw new Error('https-read-redirect-to-plaintext-refused')
          current = next
          continue
        }

        const headers: Record<string, string | undefined> = {}
        for (const name of RETAINED_HEADERS) {
          const value = response.headers.get(name)
          if (value !== null) headers[name] = value
        }
        const body = await readBounded(response, maxBytes)
        return Object.freeze({ status: response.status, body, headers: Object.freeze(headers) }) as ProviderLiveDataTransportResponse
      }

      throw new Error(`https-read-too-many-redirects: more than ${maxRedirects}`)
    },
  }
}

/**
 * A digest port over the runtime's own SHA-256.
 *
 * Shipped for the same reason as the transport: asking a buyer to implement hashing is asking
 * them to do our job, and a digest computed differently on their side would make two evidence
 * records of the same payload disagree.
 */
export function createSha256DigestPort(): ProviderLiveDataDigestPort {
  return {
    async sha256(value: string): Promise<string> {
      const bytes = new TextEncoder().encode(String(value ?? ''))
      const hashed = await crypto.subtle.digest('SHA-256', bytes)
      return Array.from(new Uint8Array(hashed))
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('')
    },
  }
}

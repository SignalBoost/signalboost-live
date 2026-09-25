// saas/lib/security/publicFetchGuard.ts
//
// Security Admission Shield — SSRF protection for platform-controlled fetches of user-supplied URLs.
//
// One shared, deterministic guard instead of per-route string checks. A URL is fetched only when:
//   - the scheme is http/https and it carries no credentials;
//   - the hostname is not a local/internal name;
//   - EVERY address the hostname resolves to is public (IPv4 and IPv6, including IPv4-mapped and
//     NAT64-embedded IPv4, which string prefix checks miss);
//   - every redirect hop passes the same checks again (redirects are followed manually, never by fetch).
// Failures surface a fixed error code, never the underlying network error text, so the guard cannot be
// used as an internal port/host scanner.
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

export type PublicFetchErrorCode =
  | 'public_fetch_url_invalid'
  | 'public_fetch_scheme_rejected'
  | 'public_fetch_host_rejected'
  | 'public_fetch_address_rejected'
  | 'public_fetch_dns_failed'
  | 'public_fetch_redirect_invalid'
  | 'public_fetch_redirect_limit'
  | 'public_fetch_timeout'
  | 'public_fetch_too_large'
  | 'public_fetch_network_error'

export class PublicFetchError extends Error {
  readonly code: PublicFetchErrorCode
  constructor(code: PublicFetchErrorCode) {
    super(code)
    this.name = 'PublicFetchError'
    this.code = code
  }
}

export type PublicFetchResult = Readonly<{ status: number; text: string; finalUrl: string; contentType: string }>

function ipv4Blocked(address: string): boolean {
  const parts = address.split('.').map(Number)
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return true
  const [a, b, c] = parts
  return a === 0                                   // "this" network
    || a === 10                                    // private
    || a === 127                                   // loopback
    || (a === 100 && b >= 64 && b <= 127)          // carrier-grade NAT
    || (a === 169 && b === 254)                    // link-local, cloud metadata
    || (a === 172 && b >= 16 && b <= 31)           // private
    || (a === 192 && b === 0 && c === 0)           // IETF protocol assignments
    || (a === 192 && b === 0 && c === 2)           // documentation
    || (a === 192 && b === 88 && c === 99)         // 6to4 relay anycast
    || (a === 192 && b === 168)                    // private
    || (a === 198 && (b === 18 || b === 19))       // benchmarking
    || (a === 198 && b === 51 && c === 100)        // documentation
    || (a === 203 && b === 0 && c === 113)         // documentation
    || a >= 224                                    // multicast, reserved, broadcast
}

function expandIpv6(address: string): number[] | null {
  let value = address.toLowerCase().split('%')[0].replace(/^\[|\]$/g, '')
  // Embedded dotted IPv4 tail (e.g. ::ffff:127.0.0.1) becomes two hextets.
  const dotted = value.match(/^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/)
  if (dotted) {
    const octets = dotted[2].split('.').map(Number)
    if (octets.some(octet => octet > 255)) return null
    value = `${dotted[1]}${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`
  }
  const halves = value.split('::')
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(':') : []
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const missing = 8 - head.length - tail.length
  if (halves.length === 1 ? head.length !== 8 : missing < 1) return null
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...tail]
  if (groups.length !== 8 || groups.some(group => !/^[0-9a-f]{1,4}$/.test(group))) return null
  return groups.map(group => parseInt(group, 16))
}

function ipv6Blocked(address: string): boolean {
  const g = expandIpv6(address)
  if (!g) return true
  const embeddedIpv4 = () => `${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`
  if (g.every(group => group === 0)) return true                                   // ::
  if (g.slice(0, 7).every(group => group === 0) && g[7] === 1) return true         // ::1
  if (g.slice(0, 5).every(group => group === 0) && g[5] === 0xffff) return ipv4Blocked(embeddedIpv4()) // ::ffff:a.b.c.d
  if (g.slice(0, 6).every(group => group === 0)) return true                       // deprecated IPv4-compatible
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every(group => group === 0)) return ipv4Blocked(embeddedIpv4()) // NAT64
  if ((g[0] & 0xfe00) === 0xfc00) return true                                      // fc00::/7 unique local
  if ((g[0] & 0xffc0) === 0xfe80) return true                                      // fe80::/10 link-local
  if ((g[0] & 0xff00) === 0xff00) return true                                      // ff00::/8 multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true                              // documentation
  if (g[0] === 0x2002) return ipv4Blocked(`${g[1] >> 8}.${g[1] & 255}.${g[2] >> 8}.${g[2] & 255}`) // 6to4
  return false
}

/** True when an IP address literal must never be reached by a platform fetch of a user-supplied URL. */
export function isBlockedNetworkAddress(address: string): boolean {
  const bare = String(address || '').trim().replace(/^\[|\]$/g, '')
  const family = isIP(bare)
  if (family === 4) return ipv4Blocked(bare)
  if (family === 6) return ipv6Blocked(bare)
  return true
}

type Resolver = (hostname: string) => Promise<readonly { address: string }[]>
const systemResolver: Resolver = hostname => lookup(hostname, { all: true, verbatim: true })

/** Validates a user-supplied URL and every address its hostname resolves to. */
export async function assertPublicHttpUrl(value: string, resolver: Resolver = systemResolver): Promise<URL> {
  let url: URL
  try { url = new URL(value) } catch { throw new PublicFetchError('public_fetch_url_invalid') }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new PublicFetchError('public_fetch_scheme_rejected')
  if (url.username || url.password) throw new PublicFetchError('public_fetch_url_invalid')
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '')
  const bare = hostname.replace(/^\[|\]$/g, '')
  if (!bare || bare === 'localhost' || bare.endsWith('.localhost') || bare.endsWith('.local') || bare.endsWith('.internal') || bare.endsWith('.home.arpa')) {
    throw new PublicFetchError('public_fetch_host_rejected')
  }
  if (isIP(bare)) {
    if (isBlockedNetworkAddress(bare)) throw new PublicFetchError('public_fetch_address_rejected')
    return url
  }
  let addresses: readonly { address: string }[]
  try { addresses = await resolver(bare) } catch { throw new PublicFetchError('public_fetch_dns_failed') }
  if (!addresses.length) throw new PublicFetchError('public_fetch_dns_failed')
  if (addresses.some(entry => isBlockedNetworkAddress(entry.address))) throw new PublicFetchError('public_fetch_address_rejected')
  return url
}

async function readBounded(response: Response, maxBytes: number): Promise<string> {
  const declared = Number(response.headers.get('content-length') || 0)
  if (declared > maxBytes) throw new PublicFetchError('public_fetch_too_large')
  if (!response.body) return ''
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined)
      throw new PublicFetchError('public_fetch_too_large')
    }
    chunks.push(value)
  }
  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength }
  return new TextDecoder('utf-8', { fatal: false }).decode(merged)
}

/**
 * Fetches a user-supplied public URL with every hop re-validated. Non-2xx responses are returned (with
 * their status) so callers keep their existing "the site returned HTTP n" behaviour.
 */
export async function guardedPublicFetch(input: string, options: {
  headers?: Record<string, string>
  timeoutMs?: number
  maxBytes?: number
  maxRedirects?: number
  resolver?: Resolver
  fetchImpl?: typeof fetch
} = {}): Promise<PublicFetchResult> {
  const timeoutMs = options.timeoutMs ?? 12_000
  const maxBytes = options.maxBytes ?? 2_000_000
  const maxRedirects = options.maxRedirects ?? 5
  const doFetch = options.fetchImpl ?? fetch
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    let current = (await assertPublicHttpUrl(input, options.resolver)).toString()
    for (let hop = 0; hop <= maxRedirects; hop += 1) {
      if (hop > 0) await assertPublicHttpUrl(current, options.resolver)
      let response: Response
      try {
        response = await doFetch(current, { headers: options.headers, redirect: 'manual', signal: controller.signal, cache: 'no-store' })
      } catch {
        throw new PublicFetchError(controller.signal.aborted ? 'public_fetch_timeout' : 'public_fetch_network_error')
      }
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location')
        await response.body?.cancel().catch(() => undefined)
        if (!location) throw new PublicFetchError('public_fetch_redirect_invalid')
        if (hop === maxRedirects) throw new PublicFetchError('public_fetch_redirect_limit')
        try { current = new URL(location, current).toString() } catch { throw new PublicFetchError('public_fetch_redirect_invalid') }
        continue
      }
      let text: string
      try {
        text = await readBounded(response, maxBytes)
      } catch (error) {
        if (error instanceof PublicFetchError) throw error
        throw new PublicFetchError(controller.signal.aborted ? 'public_fetch_timeout' : 'public_fetch_network_error')
      }
      const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
      return Object.freeze({ status: response.status, text, finalUrl: current, contentType })
    }
    throw new PublicFetchError('public_fetch_redirect_limit')
  } finally {
    clearTimeout(timer)
  }
}

/** True for guard rejections that mean "this destination is not allowed" rather than "it is unreachable". */
export function isPublicFetchDestinationRejection(error: unknown): boolean {
  return error instanceof PublicFetchError && (
    error.code === 'public_fetch_url_invalid'
    || error.code === 'public_fetch_scheme_rejected'
    || error.code === 'public_fetch_host_rejected'
    || error.code === 'public_fetch_address_rejected'
  )
}

import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import type { SafeFetchResult } from './types'

const MAX_REDIRECTS = 4
const MAX_BYTES = 1_500_000
const TIMEOUT_MS = 8_000
const ALLOWED_TYPES = ['text/html', 'application/xhtml+xml', 'application/json', 'text/plain']

function isPrivateIpv4(address: string) {
  const parts = address.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true
  const [a, b] = parts
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19))
}

function isPrivateIpv6(address: string) {
  const normalized = address.toLowerCase().split('%')[0]
  return normalized === '::' || normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || /^fe[89ab]/.test(normalized) || normalized.startsWith('ff') || normalized.startsWith('2001:db8:')
}

function isBlockedAddress(address: string) {
  const family = isIP(address)
  if (family === 4) return isPrivateIpv4(address)
  if (family === 6) return isPrivateIpv6(address)
  return true
}

async function assertPublicUrl(value: string) {
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP and HTTPS URLs are supported.')
  if (url.username || url.password) throw new Error('Credential-bearing URLs are not supported.')
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '')
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.local') || hostname.endsWith('.internal')) throw new Error('A publicly accessible hostname is required.')
  if (isIP(hostname) && isBlockedAddress(hostname)) throw new Error('Private and reserved network addresses are blocked.')
  const addresses = await lookup(hostname, { all: true, verbatim: true })
  if (!addresses.length || addresses.some(({ address }) => isBlockedAddress(address))) throw new Error('The hostname resolves to a private or reserved network address.')
  return url
}

async function readBoundedBody(response: Response) {
  const declared = Number(response.headers.get('content-length') || 0)
  if (declared > MAX_BYTES) throw new Error('The source exceeds the maximum supported size.')
  if (!response.body) return ''
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_BYTES) {
      await reader.cancel()
      throw new Error('The source exceeds the maximum supported size.')
    }
    chunks.push(value)
  }
  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength }
  return new TextDecoder('utf-8', { fatal: false }).decode(merged)
}

export async function safeFetchPublicSource(input: string): Promise<SafeFetchResult> {
  let current = (await assertPublicUrl(input)).toString()
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    await assertPublicUrl(current)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)
    let response: Response
    try {
      response = await fetch(current, {
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'User-Agent': 'SignalBoost-URL-Intelligence/1.0', Accept: 'text/html,application/xhtml+xml,application/json,text/plain;q=0.8' },
        cache: 'no-store',
      })
    } catch (error) {
      if (controller.signal.aborted) throw new Error('The source request timed out.')
      throw error
    } finally {
      clearTimeout(timeout)
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location')
      if (!location) throw new Error('The source returned an invalid redirect.')
      if (redirect === MAX_REDIRECTS) throw new Error('The source exceeded the redirect limit.')
      current = new URL(location, current).toString()
      continue
    }
    if (!response.ok) throw new Error(`The source returned HTTP ${response.status}.`)
    const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
    if (!ALLOWED_TYPES.includes(contentType)) throw new Error(`Unsupported source content type: ${contentType || 'unknown'}.`)
    return { finalUrl: current, contentType, body: await readBoundedBody(response), status: response.status }
  }
  throw new Error('The source could not be fetched safely.')
}

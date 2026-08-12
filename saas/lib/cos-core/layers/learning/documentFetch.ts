//
// Reads the actual page behind an approved source link, instead of the two-sentence blurb the feed
// hands over. Without this, every adapter in the learning layer supplies discovery metadata, and a
// summary can never be substantive enough to become knowledge — 78 documents acquired, 0 admitted.
//
// Scope is deliberately narrow. This is for source classes whose bodies COS is entitled to read in
// full: official vendor documentation, standards bodies, government publications. Publisher article
// bodies are NOT in scope and the feed client keeps its summary-only behaviour for them.
//
// A buyer's security review will ask what this can reach, so the guards are explicit rather than
// implied: https only, no private or loopback address space, text content types only, a byte
// ceiling, and a timeout. It follows the link it was given and nothing else.

export type ReadableFetchOptions = {
  fetcher?: typeof fetch
  timeoutMs?: number
  maxBytes?: number
  maxCharacters?: number
}

const PRIVATE_HOST = /^(?:localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|\[?::1\]?|0\.0\.0\.0)/i

/** https only, and never into private address space — this runs server-side with network access. */
export function isFetchableDocumentUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') return false
    if (PRIVATE_HOST.test(parsed.hostname)) return false
    return true
  } catch {
    return false
  }
}

/**
 * Strip a page down to its readable prose.
 *
 * Deliberately dependency-free: adding a readability library to the learning layer would make the
 * portable heavier for every buyer to satisfy one source class. Navigation, scripts and styles are
 * removed first, then the main content region is preferred when the page marks one, because that is
 * what separates the documentation from the sidebar of links to other documentation.
 */
export function readableTextFromHtml(html: string, maxCharacters = 12_000): string {
  const withoutNoise = String(html ?? '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(nav|header|footer|aside|form)\b[\s\S]*?<\/\1>/gi, ' ')

  const main =
    withoutNoise.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1] ??
    withoutNoise.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ??
    withoutNoise

  return main
    .replace(/<\/(p|div|li|h[1-6]|tr|section)>/gi, '. ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .replace(/(?:\.\s){2,}/g, '. ')
    .trim()
    .slice(0, maxCharacters)
}

/**
 * Fetch one document and return its readable text, or null.
 *
 * Null is a normal outcome, not an error: a page may be gated, oversized, non-HTML or simply down,
 * and one unavailable document must never abort a learning cycle. The caller falls back to the feed
 * summary, which is exactly what it had before.
 */
export async function fetchReadableDocument(url: string, options: ReadableFetchOptions = {}): Promise<string | null> {
  if (!isFetchableDocumentUrl(url)) return null
  const fetcher = options.fetcher ?? fetch
  const maxBytes = options.maxBytes ?? 400_000

  try {
    const response = await fetcher(url, {
      headers: { accept: 'text/html, text/plain;q=0.9' },
      redirect: 'follow',
      signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
    })
    if (!response.ok) return null

    const type = String(response.headers?.get?.('content-type') ?? '').toLowerCase()
    if (type && !type.includes('text/html') && !type.includes('text/plain') && !type.includes('application/xhtml')) return null

    const declared = Number(response.headers?.get?.('content-length') ?? '')
    if (Number.isFinite(declared) && declared > maxBytes) return null

    const body = await response.text()
    if (body.length > maxBytes * 2) return null

    const text = readableTextFromHtml(body, options.maxCharacters ?? 12_000)
    return text.length >= 400 ? text : null
  } catch {
    return null
  }
}

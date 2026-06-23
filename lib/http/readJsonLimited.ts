// lib/http/readJsonLimited.ts
// Shared hardened JSON body reader for API route handlers.
//
// Why this exists: a Content-Length-only size guard is bypassable. Requests
// using chunked transfer encoding, omitting Content-Length, or sending a
// false/invalid Content-Length can stream an arbitrarily large body into
// req.json() before any post-parse size check runs. This reader enforces a
// hard byte ceiling WHILE consuming the stream, aborting the moment the limit
// is crossed — independent of any header or transfer encoding. It also
// validates the media type as an exact type instead of a substring match.

export type ReadJsonResult<T = unknown> =
  | { ok: true; value: T }
  | { ok: false; status: number; error: string }

export interface ReadJsonOptions {
  /** Hard ceiling on the raw request body, in bytes. */
  maxBytes: number
  /**
   * Accepted media types (lowercase, no parameters). Defaults to JSON.
   * Matching is exact on the media type; parameters such as
   * "; charset=utf-8" are tolerated and ignored. Structured-suffix JSON
   * types (e.g. application/ld+json) are accepted when application/json is
   * in the allowlist.
   */
  allowedTypes?: string[]
  /** Require a Content-Type header to be present. Default true. */
  requireContentType?: boolean
}

const DEFAULT_TYPES = ['application/json']

function mediaTypeOf(header: string | null): string | null {
  if (!header) return null
  const type = header.split(';', 1)[0].trim().toLowerCase()
  return type || null
}

function typeAllowed(type: string, allowed: string[]): boolean {
  if (allowed.includes(type)) return true
  if (type.endsWith('+json') && allowed.includes('application/json')) return true
  return false
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength
}

// Returns the decoded body string, or null if it exceeds maxBytes.
async function readBodyWithLimit(req: Request, maxBytes: number): Promise<string | null> {
  const stream = req.body as ReadableStream<Uint8Array> | null

  // Some runtimes may not expose a readable stream; fall back to text() but
  // still enforce the ceiling on the decoded result.
  if (!stream || typeof stream.getReader !== 'function') {
    const text = await req.text()
    return byteLength(text) > maxBytes ? null : text
  }

  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        total += value.byteLength
        if (total > maxBytes) {
          await reader.cancel().catch(() => {})
          return null
        }
        chunks.push(value)
      }
    }
  } finally {
    reader.releaseLock?.()
  }

  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder('utf-8').decode(merged)
}

export async function readJsonLimited<T = unknown>(
  req: Request,
  opts: ReadJsonOptions,
): Promise<ReadJsonResult<T>> {
  const allowed = (opts.allowedTypes ?? DEFAULT_TYPES).map((t) => t.toLowerCase())
  const requireType = opts.requireContentType ?? true

  // 1) Media-type gate (exact, parameter-tolerant).
  const type = mediaTypeOf(req.headers.get('content-type'))
  if (requireType && !type) {
    return { ok: false, status: 415, error: 'Content-Type is required' }
  }
  if (type && !typeAllowed(type, allowed)) {
    return { ok: false, status: 415, error: `Content-Type must be ${allowed.join(' or ')}` }
  }

  // 2) Fast reject on an honest oversized Content-Length, before reading.
  const declared = Number(req.headers.get('content-length') ?? '')
  if (Number.isFinite(declared) && declared > opts.maxBytes) {
    return { ok: false, status: 413, error: 'Request body too large' }
  }

  // 3) Authoritative enforcement: count bytes while consuming the stream and
  //    abort the moment the ceiling is crossed — regardless of headers.
  const raw = await readBodyWithLimit(req, opts.maxBytes)
  if (raw === null) {
    return { ok: false, status: 413, error: 'Request body too large' }
  }
  if (raw.trim().length === 0) {
    return { ok: false, status: 400, error: 'Empty request body' }
  }

  // 4) Parse.
  try {
    return { ok: true, value: JSON.parse(raw) as T }
  } catch {
    return { ok: false, status: 400, error: 'Invalid JSON body' }
  }
}

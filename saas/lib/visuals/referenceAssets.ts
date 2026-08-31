export type VerifiedReferenceVisual = Readonly<{
  b64: string
  mime: 'image/png' | 'image/jpeg' | 'image/webp'
  title: string
  provider: 'first-party' | 'wikimedia-commons'
  sourcePageUrl: string
  assetUrl: string
}>

type CuratedReferenceMark = Readonly<{
  title: string
  aliases: readonly string[]
  sourcePageUrl: string
  assetUrl: string
  allowedHosts: readonly string[]
}>

type CommonsImageInfo = {
  url?: string
  thumburl?: string
  mime?: string
  extmetadata?: Record<string, { value?: string }>
}

type CommonsPage = {
  title?: string
  imageinfo?: CommonsImageInfo[]
}

type CommonsCandidate = Readonly<{
  title: string
  assetUrl: string
  sourcePageUrl: string
  description: string
  score: number
}>

const MAX_IMAGE_BYTES = 5_000_000
const MAX_JSON_BYTES = 1_000_000
const FETCH_TIMEOUT_MS = 12_000
const MAX_REDIRECTS = 3

const CURATED_REFERENCE_MARKS: readonly CuratedReferenceMark[] = [
  {
    title: 'Sociedade Esportiva Palmeiras',
    aliases: ['palmeiras', 'sociedade esportiva palmeiras', 'se palmeiras'],
    sourcePageUrl: 'https://www.palmeiras.com.br/escudos/',
    assetUrl: 'https://www.palmeiras.com.br/wp-content/uploads/2021/10/escudos-inst_3.png',
    allowedHosts: ['www.palmeiras.com.br', 'palmeiras.com.br'],
  },
]

const MARK_WORDS = ['logo', 'logotype', 'crest', 'badge', 'emblem', 'insignia', 'shield', 'escudo', 'distintivo', 'brasao', 'herb', 'эмблема', 'логотип', 'герб']
const REJECT_WORDS = ['false', 'flag', 'banner', 'mascot', 'jersey', 'shirt', 'kit', 'stadium', 'wallpaper', 'supporter', 'fan art']

function normalize(value: string): string {
  return String(value || '')
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

function significantTokens(value: string): string[] {
  return normalize(value).split(/\s+/).filter((token) => token.length >= 2)
}

function isAllowedHost(value: string, allowedHosts: readonly string[]): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && allowedHosts.some((host) => url.hostname.toLowerCase() === host)
  } catch {
    return false
  }
}

async function readBoundedBytes(response: Response, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(response.headers.get('content-length') || 0)
  if (declared > maxBytes) throw new Error('reference_asset_too_large')
  if (!response.body) return new Uint8Array()

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      throw new Error('reference_asset_too_large')
    }
    chunks.push(value)
  }

  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  return merged
}

function sniffImageMime(bytes: Uint8Array): VerifiedReferenceVisual['mime'] | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 12 && Buffer.from(bytes.subarray(0, 4)).toString('ascii') === 'RIFF' && Buffer.from(bytes.subarray(8, 12)).toString('ascii') === 'WEBP') return 'image/webp'
  return null
}

async function fetchTrustedBytes(input: string, allowedHosts: readonly string[], maxBytes: number, accept: string): Promise<{ bytes: Uint8Array; finalUrl: string; contentType: string }> {
  let current = input
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    if (!isAllowedHost(current, allowedHosts)) throw new Error('reference_asset_host_not_allowed')
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    let response: Response
    try {
      response = await fetch(current, {
        redirect: 'manual',
        signal: controller.signal,
        cache: 'no-store',
        headers: {
          Accept: accept,
          'User-Agent': 'SignalBoost-Verified-Visual/1.0',
        },
      })
    } finally {
      clearTimeout(timeout)
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location')
      if (!location || redirect === MAX_REDIRECTS) throw new Error('reference_asset_redirect_rejected')
      current = new URL(location, current).toString()
      continue
    }
    if (!response.ok) throw new Error(`reference_asset_http_${response.status}`)
    return {
      bytes: await readBoundedBytes(response, maxBytes),
      finalUrl: current,
      contentType: (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase(),
    }
  }
  throw new Error('reference_asset_unavailable')
}

async function downloadVerifiedImage(input: string, allowedHosts: readonly string[]): Promise<{ b64: string; mime: VerifiedReferenceVisual['mime']; finalUrl: string }> {
  const downloaded = await fetchTrustedBytes(input, allowedHosts, MAX_IMAGE_BYTES, 'image/png,image/jpeg,image/webp;q=0.9,*/*;q=0.1')
  const mime = sniffImageMime(downloaded.bytes)
  if (!mime) throw new Error(`reference_asset_invalid_image_${downloaded.contentType || 'unknown'}`)
  return { b64: Buffer.from(downloaded.bytes).toString('base64'), mime, finalUrl: downloaded.finalUrl }
}

function findCuratedReference(query: string): CuratedReferenceMark | null {
  const normalizedQuery = normalize(query)
  const queryTokens = significantTokens(normalizedQuery)
  if (!queryTokens.length) return null

  return CURATED_REFERENCE_MARKS.find((entry) => entry.aliases.some((alias) => {
    const normalizedAlias = normalize(alias)
    const aliasTokens = significantTokens(normalizedAlias)
    return normalizedQuery === normalizedAlias
      || queryTokens.every((token) => aliasTokens.includes(token))
      || aliasTokens.every((token) => queryTokens.includes(token))
  })) || null
}

function metadataText(info: CommonsImageInfo): string {
  return Object.values(info.extmetadata || {})
    .map((entry) => String(entry?.value || '').replace(/<[^>]*>/g, ' '))
    .join(' ')
}

export function selectCommonsCandidate(query: string, pages: readonly CommonsPage[]): CommonsCandidate | null {
  const queryTokens = significantTokens(query)
  if (!queryTokens.length) return null

  const candidates: CommonsCandidate[] = []
  for (const page of pages) {
    const info = page.imageinfo?.[0]
    const title = String(page.title || '')
    const assetUrl = String(info?.thumburl || info?.url || '')
    if (!title || !assetUrl || !isAllowedHost(assetUrl, ['upload.wikimedia.org'])) continue

    const description = metadataText(info || {})
    const titleText = normalize(title.replace(/^file\s*/i, ''))
    const haystack = normalize(`${title} ${description}`)
    if (!queryTokens.every((token) => haystack.includes(token))) continue
    if (REJECT_WORDS.some((word) => haystack.includes(normalize(word)))) continue

    let score = queryTokens.length * 12
    if (MARK_WORDS.some((word) => titleText.includes(normalize(word)))) score += 24
    if (MARK_WORDS.some((word) => haystack.includes(normalize(word)))) score += 8
    if (titleText.startsWith(normalize(query))) score += 8
    if (/\.svg\b/i.test(title)) score += 4

    if (score >= 24) {
      candidates.push({
        title: title.replace(/^File:/i, '').trim(),
        assetUrl,
        sourcePageUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
        description,
        score,
      })
    }
  }

  return candidates.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))[0] || null
}

async function searchCommons(query: string): Promise<CommonsCandidate | null> {
  const endpoint = new URL('https://commons.wikimedia.org/w/api.php')
  endpoint.searchParams.set('action', 'query')
  endpoint.searchParams.set('generator', 'search')
  endpoint.searchParams.set('gsrsearch', `${query} logo crest emblem`)
  endpoint.searchParams.set('gsrnamespace', '6')
  endpoint.searchParams.set('gsrlimit', '12')
  endpoint.searchParams.set('prop', 'imageinfo')
  endpoint.searchParams.set('iiprop', 'url|mime|extmetadata')
  endpoint.searchParams.set('iiurlwidth', '1024')
  endpoint.searchParams.set('format', 'json')
  endpoint.searchParams.set('formatversion', '2')
  endpoint.searchParams.set('origin', '*')

  const response = await fetchTrustedBytes(endpoint.toString(), ['commons.wikimedia.org'], MAX_JSON_BYTES, 'application/json')
  const data = JSON.parse(new TextDecoder().decode(response.bytes)) as { query?: { pages?: CommonsPage[] } }
  return selectCommonsCandidate(query, Array.isArray(data?.query?.pages) ? data.query.pages : [])
}

/**
 * Resolves an existing real-world mark from a verified first-party source or Wikimedia Commons.
 * It never asks an image model to reconstruct a trademark from memory. A missing verified match
 * returns null so the caller can fail closed instead of showing an invented badge.
 */
export async function resolveVerifiedReferenceVisual(referenceQuery: string): Promise<VerifiedReferenceVisual | null> {
  const curated = findCuratedReference(referenceQuery)
  if (curated) {
    try {
      const downloaded = await downloadVerifiedImage(curated.assetUrl, curated.allowedHosts)
      return {
        b64: downloaded.b64,
        mime: downloaded.mime,
        title: curated.title,
        provider: 'first-party',
        sourcePageUrl: curated.sourcePageUrl,
        assetUrl: downloaded.finalUrl,
      }
    } catch (error) {
      console.warn('[concierge-reference-visual-first-party-failure]', JSON.stringify({
        referenceQuery,
        title: curated.title,
        error: error instanceof Error ? error.message : 'unknown',
      }))
    }
  }

  try {
    const candidate = await searchCommons(referenceQuery)
    if (!candidate) return null
    const downloaded = await downloadVerifiedImage(candidate.assetUrl, ['upload.wikimedia.org'])
    return {
      b64: downloaded.b64,
      mime: downloaded.mime,
      title: candidate.title,
      provider: 'wikimedia-commons',
      sourcePageUrl: candidate.sourcePageUrl,
      assetUrl: downloaded.finalUrl,
    }
  } catch (error) {
    console.warn('[concierge-reference-visual-commons-failure]', JSON.stringify({
      referenceQuery,
      error: error instanceof Error ? error.message : 'unknown',
    }))
    return null
  }
}

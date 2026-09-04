export type VerifiedPersonReference = Readonly<{
  canonicalName: string
  b64: string
  mime: 'image/png' | 'image/jpeg' | 'image/webp'
  title: string
  provider: 'wikimedia-commons'
  sourcePageUrl: string
  assetUrl: string
}>

export type VerifiedPersonReferenceResolution = Readonly<{
  reference: VerifiedPersonReference | null
  attempts: number
  strategies: readonly string[]
}>

type CuratedPersonReference = Readonly<{
  canonicalName: string
  aliases: readonly string[]
  commonsFileTitle: string
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

type CommonsPersonCandidate = Readonly<{
  title: string
  assetUrl: string
  sourcePageUrl: string
  description: string
  score: number
}>

const MAX_IMAGE_BYTES = 6_000_000
const MAX_JSON_BYTES = 1_000_000
const FETCH_TIMEOUT_MS = 20_000
const MAX_REDIRECTS = 4
const COMMONS_HOST = 'commons.wikimedia.org'
const COMMONS_UPLOAD_HOST = 'upload.wikimedia.org'
const COMMONS_THUMB_HOST = 'thumb.wikimedia.org'
const CURATED_THUMB_WIDTH = 768

const CURATED_PEOPLE: readonly CuratedPersonReference[] = [
  {
    canonicalName: 'Luiz Inácio Lula da Silva',
    aliases: ['luiz inacio lula da silva', 'luiz inacio lula', 'presidente lula', 'president lula', 'lula'],
    commonsFileTitle: 'File:Foto oficial de Luiz Inácio Lula da Silva (2023–2027).jpg',
  },
  {
    canonicalName: 'Donald Trump',
    aliases: ['donald j trump', 'donald trump', 'presidente trump', 'president trump', 'trump'],
    commonsFileTitle: 'File:January 2025 Official Presidential Portrait of Donald J. Trump.jpg',
  },
]

const PERSON_TITLE_WORDS = new Set([
  'president', 'presidente', 'presidenta', 'prime', 'minister', 'premier', 'chancellor', 'governor', 'senator',
  'king', 'queen', 'rei', 'rainha', 'prezydent', 'президент',
])
const NAME_CONNECTORS = new Set(['da', 'de', 'do', 'dos', 'das', 'del', 'della', 'di', 'van', 'von', 'bin', 'ibn', 'al', 'j'])
const PORTRAIT_WORDS = ['portrait', 'official', 'headshot', 'photo', 'retrato', 'oficial', 'foto', 'portret', 'портрет']
const REJECT_WORDS = [
  'with', ' and ', 'meeting', 'family', 'group', 'crowd', 'rally', 'speech', 'statue', 'wax', 'painting', 'drawing',
  'caricature', 'cartoon', 'mural', 'impersonator', 'lookalike', 'cosplay', 'poster', 'banner', 'memorial', 'grave', 'signature',
]
const COMMONS_SEARCH_STRATEGIES = [
  { id: 'commons-official-portrait', suffix: 'official portrait' },
  { id: 'commons-portrait', suffix: 'portrait' },
  { id: 'commons-name', suffix: '' },
] as const

const referenceCache = new Map<string, Promise<VerifiedPersonReferenceResolution>>()

function normalize(value: string): string {
  return String(value || '')
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

function personNameTokens(value: string): string[] {
  return normalize(value)
    .split(/\s+/)
    .filter((token) => token && !PERSON_TITLE_WORDS.has(token) && !NAME_CONNECTORS.has(token))
}

function isAllowedHost(value: string, allowedHosts: readonly string[]): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && allowedHosts.includes(url.hostname.toLowerCase())
  } catch {
    return false
  }
}

async function readBoundedBytes(response: Response, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(response.headers.get('content-length') || 0)
  if (declared > maxBytes) throw new Error('person_reference_too_large')
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
      throw new Error('person_reference_too_large')
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

async function fetchTrustedBytes(
  input: string,
  allowedHosts: readonly string[],
  maxBytes: number,
  accept: string,
): Promise<{ bytes: Uint8Array; finalUrl: string; contentType: string }> {
  let current = input
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    if (!isAllowedHost(current, allowedHosts)) throw new Error('person_reference_host_not_allowed')
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
          'User-Agent': 'SignalBoost-Verified-Person-Visual/2.0',
        },
      })
    } finally {
      clearTimeout(timeout)
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location')
      if (!location || redirect === MAX_REDIRECTS) throw new Error('person_reference_redirect_rejected')
      current = new URL(location, current).toString()
      continue
    }
    if (!response.ok) throw new Error(`person_reference_http_${response.status}`)
    return {
      bytes: await readBoundedBytes(response, maxBytes),
      finalUrl: current,
      contentType: (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase(),
    }
  }
  throw new Error('person_reference_unavailable')
}

function sniffImageMime(bytes: Uint8Array): VerifiedPersonReference['mime'] | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (
    bytes.length >= 12
    && Buffer.from(bytes.subarray(0, 4)).toString('ascii') === 'RIFF'
    && Buffer.from(bytes.subarray(8, 12)).toString('ascii') === 'WEBP'
  ) return 'image/webp'
  return null
}

function metadataText(info: CommonsImageInfo): string {
  return Object.values(info.extmetadata || {})
    .map((entry) => String(entry?.value || '').replace(/<[^>]*>/g, ' '))
    .join(' ')
}

function sourcePageUrl(title: string): string {
  return `https://${COMMONS_HOST}/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`
}

function curatedRedirectUrl(title: string): string {
  const filename = title.replace(/^File:/i, '')
  return `https://${COMMONS_HOST}/wiki/Special:Redirect/file/${encodeURIComponent(filename)}?width=${CURATED_THUMB_WIDTH}`
}

function commonsEndpoint(): URL {
  return new URL(`https://${COMMONS_HOST}/w/api.php`)
}

async function fetchCommonsPages(endpoint: URL): Promise<CommonsPage[]> {
  endpoint.searchParams.set('prop', 'imageinfo')
  endpoint.searchParams.set('iiprop', 'url|mime|extmetadata')
  endpoint.searchParams.set('iiurlwidth', String(CURATED_THUMB_WIDTH))
  endpoint.searchParams.set('format', 'json')
  endpoint.searchParams.set('formatversion', '2')
  endpoint.searchParams.set('origin', '*')

  const response = await fetchTrustedBytes(endpoint.toString(), [COMMONS_HOST], MAX_JSON_BYTES, 'application/json')
  const data = JSON.parse(new TextDecoder().decode(response.bytes)) as { query?: { pages?: CommonsPage[] } }
  return Array.isArray(data?.query?.pages) ? data.query.pages : []
}

async function downloadImage(
  input: string,
  allowedHosts: readonly string[],
): Promise<{ b64: string; mime: VerifiedPersonReference['mime']; finalUrl: string }> {
  const downloaded = await fetchTrustedBytes(
    input,
    allowedHosts,
    MAX_IMAGE_BYTES,
    'image/png,image/jpeg,image/webp;q=0.9,*/*;q=0.1',
  )
  const mime = sniffImageMime(downloaded.bytes)
  if (!mime) throw new Error(`person_reference_invalid_image_${downloadloadedContentType(downloaded.contentType)}`)
  return { b64: Buffer.from(downloaded.bytes).toString('base64'), mime, finalUrl: downloaded.finalUrl }
}

function downloadloadedContentType(value: string): string {
  return value || 'unknown'
}

async function downloadCandidate(candidate: CommonsPersonCandidate, canonicalName: string): Promise<VerifiedPersonReference> {
  const downloaded = await downloadImage(candidate.assetUrl, [COMMONS_UPLOAD_HOST, COMMONS_THUMB_HOST])
  return {
    canonicalName,
    b64: downloaded.b64,
    mime: downloaded.mime,
    title: candidate.title,
    provider: 'wikimedia-commons',
    sourcePageUrl: candidate.sourcePageUrl,
    assetUrl: downloaded.finalUrl,
  }
}

async function downloadCurated(entry: CuratedPersonReference): Promise<VerifiedPersonReference> {
  const downloaded = await downloadImage(curatedRedirectUrl(entry.commonsFileTitle), [COMMONS_HOST, COMMONS_UPLOAD_HOST, COMMONS_THUMB_HOST])
  return {
    canonicalName: entry.canonicalName,
    b64: downloaded.b64,
    mime: downloaded.mime,
    title: entry.commonsFileTitle.replace(/^File:/i, ''),
    provider: 'wikimedia-commons',
    sourcePageUrl: sourcePageUrl(entry.commonsFileTitle),
    assetUrl: downloaded.finalUrl,
  }
}

function candidateFromPage(page: CommonsPage): CommonsPersonCandidate | null {
  const info = page.imageinfo?.[0]
  const title = String(page.title || '')
  // Prefer Commons' canonical upload URL. The thumbnail service and Special:Redirect endpoint
  // have both changed behavior independently of the verified file metadata.
  const assetUrl = String(info?.url || info?.thumburl || '')
  if (!title || !assetUrl || !isAllowedHost(assetUrl, [COMMONS_UPLOAD_HOST, COMMONS_THUMB_HOST])) return null
  return {
    title: title.replace(/^File:/i, '').trim(),
    assetUrl,
    sourcePageUrl: sourcePageUrl(title),
    description: metadataText(info || {}),
    score: 0,
  }
}

function findCuratedPerson(query: string): CuratedPersonReference | null {
  const normalizedQuery = normalize(query)
  return CURATED_PEOPLE.find((entry) => entry.aliases.some((alias) => {
    const normalizedAlias = normalize(alias)
    return normalizedQuery === normalizedAlias
      || normalizedQuery.includes(normalizedAlias)
      || normalizedAlias.includes(normalizedQuery)
  })) || null
}

export function selectCommonsPersonCandidate(query: string, pages: readonly CommonsPage[]): CommonsPersonCandidate | null {
  const queryTokens = personNameTokens(query)
  if (queryTokens.length < 2) return null

  const candidates: CommonsPersonCandidate[] = []
  for (const page of pages) {
    const base = candidateFromPage(page)
    if (!base) continue

    const titleText = normalize(base.title)
    const haystack = ` ${normalize(`${base.title} ${base.description}`)} `
    if (!queryTokens.every((token) => titleText.includes(token))) continue
    if (REJECT_WORDS.some((word) => haystack.includes(` ${normalize(word)} `))) continue

    const portraitSignals = PORTRAIT_WORDS.filter((word) => haystack.includes(normalize(word))).length
    if (!portraitSignals) continue

    let score = queryTokens.length * 18 + portraitSignals * 8
    if (titleText.startsWith(normalize(query))) score += 12
    if (titleText.includes('official') || titleText.includes('oficial')) score += 12
    if (/\.(?:jpe?g|png|webp)$/i.test(base.title)) score += 4
    candidates.push({ ...base, score })
  }

  return candidates.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))[0] || null
}

async function exactCommonsPerson(entry: CuratedPersonReference): Promise<CommonsPersonCandidate | null> {
  const endpoint = commonsEndpoint()
  endpoint.searchParams.set('action', 'query')
  endpoint.searchParams.set('titles', entry.commonsFileTitle)
  const pages = await fetchCommonsPages(endpoint)
  return pages.map(candidateFromPage).find((candidate): candidate is CommonsPersonCandidate => Boolean(candidate)) || null
}

async function searchCommonsPerson(identityQuery: string, searchSuffix: string): Promise<CommonsPersonCandidate | null> {
  const endpoint = commonsEndpoint()
  endpoint.searchParams.set('action', 'query')
  endpoint.searchParams.set('generator', 'search')
  endpoint.searchParams.set('gsrsearch', [identityQuery, searchSuffix].filter(Boolean).join(' '))
  endpoint.searchParams.set('gsrnamespace', '6')
  endpoint.searchParams.set('gsrlimit', '16')
  return selectCommonsPersonCandidate(identityQuery, await fetchCommonsPages(endpoint))
}

async function resolveUncached(referenceQuery: string): Promise<VerifiedPersonReferenceResolution> {
  const curated = findCuratedPerson(referenceQuery)
  const canonicalName = curated?.canonicalName || referenceQuery.replace(/\s+/g, ' ').trim()
  if (!canonicalName) return { reference: null, attempts: 0, strategies: [] }

  let attempts = 0
  const strategies: string[] = []

  if (curated) {
    attempts += 1
    strategies.push('curated-metadata')
    try {
      const exact = await exactCommonsPerson(curated)
      if (exact) {
        return { reference: await downloadCandidate(exact, curated.canonicalName), attempts, strategies }
      }
    } catch (error) {
      console.warn('[concierge-person-reference-curated-api-failure]', JSON.stringify({
        referenceQuery,
        canonicalName: curated.canonicalName,
        error: error instanceof Error ? error.message : 'unknown',
      }))
    }

    attempts += 1
    strategies.push('curated-redirect')
    try {
      return { reference: await downloadCurated(curated), attempts, strategies }
    } catch (error) {
      console.warn('[concierge-person-reference-curated-redirect-failure]', JSON.stringify({
        referenceQuery,
        canonicalName: curated.canonicalName,
        error: error instanceof Error ? error.message : 'unknown',
      }))
    }
  }

  const searchStrategies = COMMONS_SEARCH_STRATEGIES.map((strategy) => {
    attempts += 1
    strategies.push(strategy.id)
    return strategy
  })
  const candidateResults = await Promise.all(searchStrategies.map(async (strategy) => {
    try {
      return await searchCommonsPerson(canonicalName, strategy.suffix)
    } catch (error) {
      console.warn('[concierge-person-reference-commons-failure]', JSON.stringify({
        referenceQuery,
        canonicalName,
        strategy: strategy.id,
        error: error instanceof Error ? error.message : 'unknown',
      }))
      return null
    }
  }))

  const uniqueCandidates = new Map<string, CommonsPersonCandidate>()
  for (const candidate of candidateResults) {
    if (candidate && !uniqueCandidates.has(candidate.assetUrl)) uniqueCandidates.set(candidate.assetUrl, candidate)
  }
  for (const candidate of uniqueCandidates.values()) {
    try {
      return { reference: await downloadCandidate(candidate, canonicalName), attempts, strategies }
    } catch (error) {
      console.warn('[concierge-person-reference-download-failure]', JSON.stringify({
        referenceQuery,
        canonicalName,
        title: candidate.title,
        error: error instanceof Error ? error.message : 'unknown',
      }))
    }
  }

  return { reference: null, attempts, strategies }
}

/**
 * Resolves a named real person to a verified portrait before image generation. Curated public
 * figures use exact Commons metadata first, then the file redirect. Uncurated names use a bounded
 * set of read-only Commons search strategies in parallel. Every candidate still has to pass the
 * original identity-token and portrait checks; recovery never substitutes a different identity.
 */
export async function resolveVerifiedPersonReferenceWithRecovery(referenceQuery: string): Promise<VerifiedPersonReferenceResolution> {
  const key = normalize(referenceQuery)
  if (!key) return { reference: null, attempts: 0, strategies: [] }
  const existing = referenceCache.get(key)
  if (existing) return existing

  const pending = resolveUncached(referenceQuery)
  referenceCache.set(key, pending)
  const resolved = await pending
  if (!resolved.reference) referenceCache.delete(key)
  return resolved
}

export async function resolveVerifiedPersonReference(referenceQuery: string): Promise<VerifiedPersonReference | null> {
  return (await resolveVerifiedPersonReferenceWithRecovery(referenceQuery)).reference
}

export function clearVerifiedPersonReferenceCacheForTests(): void {
  referenceCache.clear()
}

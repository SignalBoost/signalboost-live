// saas/lib/media/sourcing.ts
//
// Real, high-resolution image sourcing for generated sites.
//
// Background: the old Unsplash Source endpoint (images.unsplash.com/featured/...)
// was SUNSET by Unsplash in June 2024 and now returns 404 — which is why generated
// sites showed broken / "low quality" imagery. This module replaces it with the
// official Unsplash API: ONE search per site, results pooled and reused across all
// image slots (hero, gallery, logos) to stay well within rate limits. It tags its
// own output (sbsrc=1) so cached sites stay stable and dead URLs get healed, and it
// falls back to Picsum so a site is NEVER left with a broken image.
//
// Setup: add UNSPLASH_ACCESS_KEY to the environment (Vercel). Free key at
// https://unsplash.com/developers . Without it, images still render via Picsum
// (sharp but generic rather than niche-relevant).

type Palette = { primary?: string; accent?: string; background?: string; surface?: string; text?: string; muted?: string }
type SiteSection = {
  type?: string
  heading?: string
  subheading?: string
  body?: string
  image_url?: string
  imageAlt?: string
  items?: Array<{ title?: string; body?: string; image_url?: string; logo_url?: string; imageAlt?: string; logoAlt?: string; [key: string]: unknown }>
  [key: string]: unknown
}
type SiteContent = {
  businessName?: string
  palette?: Palette
  sections?: SiteSection[]
  logo_url?: string
  logoAlt?: string
  [key: string]: unknown
}

type MediaCategory = 'football' | 'food' | 'business' | 'technology' | 'bakery' | 'legal' | 'transport' | 'generic'

type CuratedMedia = {
  category: MediaCategory
  label: string
  keywordSets: string[][]
}

const CURATED_MEDIA: Record<MediaCategory, CuratedMedia> = {
  football: {
    category: 'football',
    label: 'grassroots football field',
    keywordSets: [
      ['grassroots', 'football', 'field', 'community', 'matchday'],
      ['soccer', 'team', 'training', 'local', 'sports'],
      ['football', 'club', 'players', 'neighborhood', 'pitch'],
      ['amateur', 'football', 'match', 'field', 'fans'],
    ],
  },
  food: {
    category: 'food',
    label: 'restaurant dining room',
    keywordSets: [
      ['restaurant', 'dining', 'interior', 'warm', 'hospitality'],
      ['chef', 'kitchen', 'fresh', 'food', 'service'],
      ['cafe', 'restaurant', 'table', 'aesthetic', 'menu'],
      ['hospitality', 'dining', 'plates', 'ambient', 'interior'],
    ],
  },
  bakery: {
    category: 'bakery',
    label: 'artisan bakery interior',
    keywordSets: [
      ['croissant', 'bakery', 'interior', 'aesthetic'],
      ['artisan', 'bread', 'bakery', 'warm', 'counter'],
      ['pastry', 'coffee', 'bakery', 'luxury', 'interior'],
      ['baker', 'fresh', 'bread', 'shop', 'morning'],
    ],
  },
  technology: {
    category: 'technology',
    label: 'modern software workspace',
    keywordSets: [
      ['software', 'dashboard', 'technology'],
      ['technology', 'startup', 'dashboard', 'interface', 'office'],
      ['saas', 'analytics', 'computer', 'team', 'workspace'],
      ['digital', 'platform', 'data', 'screen', 'modern'],
    ],
  },
  legal: {
    category: 'legal',
    label: 'professional law office',
    keywordSets: [
      ['office', 'architecture', 'professional'],
      ['law', 'firm', 'office', 'professional', 'corporate'],
      ['legal', 'consultation', 'business', 'documents', 'office'],
      ['corporate', 'lawyer', 'workspace', 'architecture', 'trust'],
    ],
  },
  transport: {
    category: 'transport',
    label: 'professional taxi and transport service',
    keywordSets: [
      ['taxi', 'cab', 'city', 'street', 'transport'],
      ['car', 'driver', 'ride', 'urban', 'service'],
      ['transport', 'vehicle', 'road', 'travel', 'city'],
      ['airport', 'transfer', 'car', 'professional', 'travel'],
    ],
  },
  business: {
    category: 'business',
    label: 'local business workspace',
    keywordSets: [
      ['local', 'business', 'workspace', 'team', 'professional'],
      ['storefront', 'small', 'business', 'owner', 'service'],
      ['office', 'team', 'meeting', 'professional', 'brand'],
      ['studio', 'agency', 'workspace', 'creative', 'modern'],
    ],
  },
  generic: {
    category: 'generic',
    label: 'editorial brand imagery',
    keywordSets: [
      ['editorial', 'brand', 'website', 'modern', 'aesthetic'],
      ['creative', 'business', 'interior', 'professional', 'design'],
      ['architecture', 'workspace', 'premium', 'minimal', 'brand'],
      ['lifestyle', 'business', 'website', 'visual', 'modern'],
    ],
  },
}

const IMAGE_REQUEST_TERMS = [
  'image', 'images', 'photo', 'photos', 'picture', 'pictures', 'visual', 'visuals', 'gallery', 'portfolio',
  'imagem', 'imagens', 'foto', 'fotos', 'galeria',
  'imagen', 'imagenes', 'imágenes', 'galería',
]
const LOGO_REQUEST_TERMS = ['logo', 'logos', 'brand mark', 'logotipo', 'marca']

// Football detection is now STRICT — only unambiguous football words.
// Removed the broad terms ('team', 'sport', 'sports', 'club', 'esporte', 'esportes')
// because they were wrongly classifying taxi/business/agency sites as football.
const FOOTBALL_TERMS = ['football', 'soccer', 'futebol', 'várzea', 'varzea']
const FOOD_TERMS = ['restaurant', 'restaurante', 'food', 'comida', 'cafe', 'café', 'bar', 'pizza', 'burger', 'menu', 'dining']
const BAKERY_TERMS = ['bakery', 'padaria', 'baker', 'pastry', 'croissant', 'bread', 'cake', 'confeitaria', 'panadería']
const TECHNOLOGY_TERMS = ['saas', 'software', 'dashboard', 'platform', 'technology', 'tech', 'app', 'application', 'cybersecurity', 'analytics']
const LEGAL_TERMS = ['lawyer', 'law', 'legal', 'attorney', 'advogado', 'abogado', 'solicitor', 'law firm', 'juridico', 'jurídico']
const TRANSPORT_TERMS = ['taxi', 'cab', 'driver', 'drivers', 'ride', 'rides', 'rideshare', 'airport pickup', 'pickup', 'pick up', 'transport', 'transportation', 'chauffeur', 'limo', 'limousine', 'fleet', 'motorista', 'corrida', 'transporte', 'uber']
const BUSINESS_TERMS = ['business', 'empresa', 'storefront', 'store', 'shop', 'loja', 'workspace', 'office', 'coworking', 'studio', 'agency', 'consulting', 'service', 'services']
const URL_RE = /https?:\/\/[^\s"'<>]+/i
const IMAGE_URL_RE = /https?:\/\/[^\s"'<>]+(?:\.(?:png|jpe?g|webp|gif|svg)(?:[?#][^\s"'<>]*)?|[^\s"'<>]*(?:images\.unsplash\.com|images\.pexels\.com|cdn\.pixabay\.com|image|photo|logo)[^\s"'<>]*)/i

// ── Image sizing ──────────────────────────────────────────────────────────────
type ImageOpts = { w: number; h: number; q?: number }
const HERO_OPTS: ImageOpts    = { w: 2400, h: 1350, q: 82 } // retina-crisp 16:9 hero
const GALLERY_OPTS: ImageOpts = { w: 1280, h: 960, q: 80 }
const LOGO_OPTS: ImageOpts    = { w: 480, h: 480, q: 80 }

function includesAny(text: string, terms: string[]): boolean {
  return terms.some(term => text.includes(term))
}

function textForDetection(content: SiteContent, prompt: string): string {
  const pieces = [prompt, content.businessName || '']
  for (const section of content.sections || []) {
    pieces.push(section.type || '', section.heading || '', section.subheading || '', section.body || '')
    for (const item of section.items || []) pieces.push(item.title || '', item.body || '')
  }
  return pieces.join(' ').toLowerCase()
}

function hasMediaUrl(value: unknown, key = ''): boolean {
  if (!value) return false
  if (typeof value === 'string') {
    const lowerKey = key.toLowerCase()
    const mediaKey = lowerKey.includes('image') || lowerKey.includes('logo') || lowerKey.includes('photo') || lowerKey.includes('picture')
    return value.startsWith('data:image/') || (mediaKey && URL_RE.test(value)) || IMAGE_URL_RE.test(value)
  }
  if (Array.isArray(value)) return value.some(item => hasMediaUrl(item, key))
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).some(([childKey, childValue]) => hasMediaUrl(childValue, childKey))
  }
  return false
}

function hasExplicitInputImageUrl(prompt: string): boolean {
  return IMAGE_URL_RE.test(prompt)
}

function isUnsplashFeaturedUrl(value: string): boolean {
  // The dead Unsplash Source endpoint — must always be replaced.
  return /images\.unsplash\.com\/featured/i.test(value) || /source\.unsplash\.com/i.test(value)
}

function shouldReplaceGeneratedAsset(value: unknown, promptHasImageUrl: boolean): boolean {
  if (typeof value !== 'string' || value.trim().length === 0) return true
  const trimmed = value.trim()
  if (trimmed.includes('sbsrc=1')) return false                 // our own sourced asset — keep (stable cache)
  if (trimmed.startsWith('data:image/')) return true
  if (isUnsplashFeaturedUrl(trimmed)) return true               // dead Source endpoint — heal it
  // A real URL the user supplied in their prompt (not a stock service) — respect it.
  if (promptHasImageUrl && URL_RE.test(trimmed) && !/images\.unsplash\.com/i.test(trimmed)) return false
  if (!URL_RE.test(trimmed)) return true
  return true                                                   // any other AI-emitted asset URL — replace to control quality
}

function hash(input: string): number {
  let total = 0
  for (let i = 0; i < input.length; i += 1) total = (total * 31 + input.charCodeAt(i)) >>> 0
  return total
}

function inferCategory(text: string): MediaCategory {
  // Order matters: most specific / least ambiguous niches first.
  if (includesAny(text, FOOTBALL_TERMS)) return 'football'
  if (includesAny(text, BAKERY_TERMS)) return 'bakery'
  if (includesAny(text, FOOD_TERMS)) return 'food'
  if (includesAny(text, TRANSPORT_TERMS)) return 'transport'
  if (includesAny(text, TECHNOLOGY_TERMS)) return 'technology'
  if (includesAny(text, LEGAL_TERMS)) return 'legal'
  if (includesAny(text, BUSINESS_TERMS)) return 'business'
  return 'generic'
}

// ── Unsplash API photo pool (one search per category, cached) ──────────────────
const poolCache = new Map<string, string[]>()

function buildSearchQuery(category: MediaCategory): string {
  return CURATED_MEDIA[category].label
}

async function fetchPhotoPool(category: MediaCategory): Promise<string[]> {
  const query = buildSearchQuery(category)
  const cached = poolCache.get(query)
  if (cached) return cached

  const key = process.env.UNSPLASH_ACCESS_KEY
  if (!key) { poolCache.set(query, []); return [] }

  try {
    const endpoint =
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}` +
      `&per_page=24&orientation=landscape&content_filter=high`
    const res = await fetch(endpoint, {
      headers: { Authorization: `Client-ID ${key}`, 'Accept-Version': 'v1' },
      cache: 'no-store',
    })
    if (!res.ok) {
      console.error('Unsplash search failed:', res.status, query)
      poolCache.set(query, [])
      return []
    }
    const data = await res.json()
    const results = Array.isArray(data?.results) ? data.results : []
    const urls: string[] = results
      .map((r: any) => (typeof r?.urls?.raw === 'string' ? r.urls.raw : ''))
      .filter((u: string) => u.length > 0)
    poolCache.set(query, urls)
    return urls
  } catch (err) {
    console.error('Unsplash search exception:', err)
    poolCache.set(query, [])
    return []
  }
}

function withUnsplashParams(rawUrl: string, opts: ImageOpts): string {
  try {
    const u = new URL(rawUrl)
    u.searchParams.set('auto', 'format')
    u.searchParams.set('fit', 'crop')
    u.searchParams.set('w', String(opts.w))
    u.searchParams.set('h', String(opts.h))
    u.searchParams.set('q', String(opts.q ?? 80))
    u.searchParams.set('sbsrc', '1')
    return u.toString()
  } catch {
    return rawUrl
  }
}

function picsumUrl(seed: string, opts: ImageOpts): string {
  const safeSeed = encodeURIComponent(seed).slice(0, 64) || 'signalboost'
  return `https://picsum.photos/seed/${safeSeed}/${opts.w}/${opts.h}?sbsrc=1`
}

// Deterministic pick from the pool (varied across slots via seed+offset).
// Falls back to Picsum so a slot is never left broken.
function pickImage(pool: string[], seed: string, offset: number, opts: ImageOpts): string {
  if (pool.length > 0) {
    const raw = pool[(hash(seed) + offset) % pool.length]
    return withUnsplashParams(raw, opts)
  }
  return picsumUrl(`${seed}:${offset}`, opts)
}

function isImageLedSection(type = ''): boolean {
  const t = type.toLowerCase()
  return t === 'gallery' || t === 'bento' || t === 'team' || t === 'feature-grid' || t.includes('gallery') || t.includes('bento') || t.includes('team')
}

function isLogoSection(type = ''): boolean {
  const t = type.toLowerCase()
  return t === 'logos' || t === 'sponsors' || t.includes('logo') || t.includes('sponsor') || t.includes('partner')
}

function buildLogoImageUrl(name: string, pool: string[]): string {
  return pickImage(pool, `${name || 'brand'}:logo:brand mark`, 7, LOGO_OPTS)
}

function fallbackGalleryItems(content: SiteContent, category: MediaCategory): NonNullable<SiteSection['items']> {
  const sections = content.sections || []
  const sourceItems = sections.flatMap(section => section.items || []).filter(item => item.title || item.body).slice(0, 3)
  if (sourceItems.length > 0) return sourceItems.map(item => ({ title: item.title || 'Featured visual', body: item.body || CURATED_MEDIA[category].label }))

  const name = content.businessName || 'Brand'
  if (category === 'football') {
    return [
      { title: 'Grassroots matchday', body: `A field-first visual for ${name}.` },
      { title: 'Local team energy', body: 'Community football imagery with movement and atmosphere.' },
      { title: 'Training ground story', body: 'A practical visual anchor for players, fans, and families.' },
    ]
  }
  if (category === 'food') {
    return [
      { title: 'Dining room welcome', body: `Restaurant imagery that makes ${name} feel open and inviting.` },
      { title: 'Fresh menu moments', body: 'Warm food visuals for offers, reservations, and story sections.' },
      { title: 'Service atmosphere', body: 'Hospitality photography for trust and appetite appeal.' },
    ]
  }
  if (category === 'transport') {
    return [
      { title: 'On-demand rides', body: `Reliable transport visuals for ${name}.` },
      { title: 'Airport transfers', body: 'Professional driver and vehicle imagery for trust.' },
      { title: 'City coverage', body: 'Urban travel photography for booking and scheduling.' },
    ]
  }
  return [
    { title: 'Storefront presence', body: `Professional imagery for ${name}.` },
    { title: 'Team at work', body: 'Human business visuals that build trust.' },
    { title: 'Workspace detail', body: 'Clean brand photography for services and calls to action.' },
  ]
}

function isFootballCategory(content: SiteContent, prompt: string): boolean {
  return inferCategory(textForDetection(content, prompt)) === 'football'
}

// Media is sourced for ANY site now — every generated site benefits from a real
// hero/gallery image. Football no longer gets special privilege here (that was the
// leftover hard-coding that forced football imagery onto unrelated sites).
export function wantsGeneratedMedia(_prompt: string): boolean {
  return true
}

// Cheap scan: does anything actually need sourcing? Lets cache hits whose assets
// were already sourced by us (sbsrc=1) skip the Unsplash call entirely.
function contentNeedsSourcing(content: SiteContent, promptHasImageUrl: boolean): boolean {
  if (content.logo_url && shouldReplaceGeneratedAsset(content.logo_url, promptHasImageUrl)) return true
  for (const section of content.sections || []) {
    if ('image_url' in section && shouldReplaceGeneratedAsset(section.image_url, promptHasImageUrl)) return true
    for (const item of section.items || []) {
      if ('image_url' in item && shouldReplaceGeneratedAsset(item.image_url, promptHasImageUrl)) return true
      if ('logo_url' in item && shouldReplaceGeneratedAsset(item.logo_url, promptHasImageUrl)) return true
    }
  }
  return false
}

function normalizeMediaAssets(content: SiteContent, prompt: string, category: MediaCategory, promptHasImageUrl: boolean, pool: string[]): SiteContent {
  const label = CURATED_MEDIA[category].label

  if (content.logo_url && shouldReplaceGeneratedAsset(content.logo_url, promptHasImageUrl)) {
    content.logo_url = buildLogoImageUrl(content.businessName || 'Site', pool)
    content.logoAlt = content.logoAlt || `${content.businessName || 'Site'} logo image`
  }

  for (const section of content.sections || []) {
    const isHero = section.type === 'hero' || section.type === 'hero-split'
    const sectionSeed = `${prompt}:${section.heading || section.subheading || section.type || content.businessName || 'section'}`

    if ('image_url' in section && shouldReplaceGeneratedAsset(section.image_url, promptHasImageUrl)) {
      section.image_url = pickImage(pool, sectionSeed, 0, isHero ? HERO_OPTS : GALLERY_OPTS)
      section.imageAlt = section.imageAlt || `${section.heading || content.businessName || 'Section image'} — ${label}`
    }

    section.items = section.items?.map((item, index) => {
      const itemSeed = `${sectionSeed}:${item.title || item.body || 'item'}:${index}`
      const nextItem = { ...item }
      if ('image_url' in nextItem && shouldReplaceGeneratedAsset(nextItem.image_url, promptHasImageUrl)) {
        nextItem.image_url = pickImage(pool, itemSeed, index + 1, GALLERY_OPTS)
        nextItem.imageAlt = nextItem.imageAlt || `${nextItem.title || 'Gallery image'} — ${label}`
      }
      if ('logo_url' in nextItem && shouldReplaceGeneratedAsset(nextItem.logo_url, promptHasImageUrl)) {
        nextItem.logo_url = pickImage(pool, `${itemSeed}:logo`, index + 4, LOGO_OPTS)
        nextItem.logoAlt = nextItem.logoAlt || `${nextItem.title || 'Logo image'} — ${label}`
      }
      return nextItem
    })
  }

  return content
}

export async function enrichSiteMedia(content: any, prompt: string): Promise<SiteContent> {
  if (!content || typeof content !== 'object' || !Array.isArray(content.sections)) return content

  const next: SiteContent = {
    ...content,
    sections: content.sections.map((section: SiteSection) => ({ ...section, items: section.items?.map(item => ({ ...item })) })),
  }
  const detectionText = textForDetection(next, prompt)
  const category = inferCategory(detectionText)
  const label = CURATED_MEDIA[category].label
  const footballPrompt = isFootballCategory(next, prompt)
  const promptHasImageUrl = hasExplicitInputImageUrl(prompt)
  const shouldAddMedia = wantsGeneratedMedia(prompt)

  // Hit the network only if something needs an image. Already-sourced cache hits skip it.
  const willMint = shouldAddMedia || contentNeedsSourcing(next, promptHasImageUrl)
  const pool = willMint ? await fetchPhotoPool(category) : []

  if (!shouldAddMedia) {
    return normalizeMediaAssets(next, prompt, category, promptHasImageUrl, pool)
  }

  const firstHero = next.sections?.find(section => section.type === 'hero' || section.type === 'hero-split')
  if (firstHero && (!firstHero.image_url || shouldReplaceGeneratedAsset(firstHero.image_url, promptHasImageUrl) || (footballPrompt && !hasMediaUrl(firstHero.image_url, 'image_url')))) {
    firstHero.type = firstHero.type === 'hero' ? 'hero-split' : firstHero.type
    firstHero.image_url = pickImage(pool, `${prompt}:${firstHero.heading || next.businessName || 'hero'}`, 0, HERO_OPTS)
    firstHero.imageAlt = firstHero.imageAlt || `${firstHero.heading || next.businessName || 'Website'} — ${label}`
  }

  let imageSection = next.sections?.find(section => isImageLedSection(section.type) && Array.isArray(section.items))
  if (!imageSection && next.sections) {
    imageSection = {
      type: 'gallery',
      heading: category === 'football' ? 'Field visuals' : category === 'food' ? 'Restaurant visuals' : category === 'transport' ? 'Ride visuals' : 'Featured visuals',
      items: fallbackGalleryItems(next, category),
    }
    next.sections.splice(Math.min(2, next.sections.length), 0, imageSection)
  }

  if (imageSection) {
    const section = imageSection
    const existingItems = section.items && section.items.length > 0 ? section.items : fallbackGalleryItems(next, category)
    const minItems = footballPrompt ? 3 : existingItems.length
    const items = [...existingItems]
    const fb = fallbackGalleryItems(next, category)
    while (items.length < minItems) items.push(fb[items.length % fb.length])

    section.items = items.map((item, index) => {
      const keep = item.image_url && !shouldReplaceGeneratedAsset(item.image_url, promptHasImageUrl)
      return {
        ...item,
        image_url: keep ? item.image_url : pickImage(pool, `${prompt}:${item.title || section.heading || 'gallery'}:${index}`, index + 1, GALLERY_OPTS),
        imageAlt: item.imageAlt || `${item.title || 'Gallery image'} — ${label}`,
      }
    })
  }

  let logoSection = next.sections?.find(section => isLogoSection(section.type) && Array.isArray(section.items))
  if (footballPrompt && !logoSection && next.sections) {
    logoSection = {
      type: 'logos',
      heading: 'Supporters and sponsors',
      items: [
        { title: 'Matchday sponsor', body: 'Local supporter visibility with real football photography.' },
        { title: 'Community partner', body: 'A sponsor card anchored by a field image.' },
        { title: 'Club network', body: 'Visual proof for partners and neighborhood backers.' },
      ],
    }
    next.sections.splice(Math.min(3, next.sections.length), 0, logoSection)
  }

  if (logoSection) {
    const section = logoSection
    const logoItems = section.items && section.items.length > 0 ? section.items : fallbackGalleryItems(next, category)
    section.items = logoItems.map((item, index) => {
      const keep = item.logo_url && !shouldReplaceGeneratedAsset(item.logo_url, promptHasImageUrl)
      return {
        ...item,
        logo_url: keep ? item.logo_url : pickImage(pool, `${prompt}:${item.title || section.heading || 'logo'}:${index}`, index + 4, LOGO_OPTS),
        logoAlt: item.logoAlt || `${item.title || 'Sponsor logo image'} — ${label}`,
      }
    })
  }

  if (includesAny(prompt.toLowerCase(), LOGO_REQUEST_TERMS) && !next.logo_url && !promptHasImageUrl) {
    next.logo_url = buildLogoImageUrl(next.businessName || 'Site', pool)
    next.logoAlt = `${next.businessName || 'Site'} logo mark`
  }

  return normalizeMediaAssets(next, prompt, category, promptHasImageUrl, pool)
}

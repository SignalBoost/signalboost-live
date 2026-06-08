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

type MediaCategory = 'football' | 'food' | 'business' | 'technology' | 'bakery' | 'legal' | 'generic'

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
    label: 'software dashboard workspace',
    keywordSets: [
      ['software', 'dashboard', 'cyberpunk'],
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
  'imagem', 'imagens', 'foto', 'fotos', 'galeria', 'fotos',
  'imagen', 'imagenes', 'imágenes', 'foto', 'fotos', 'galería',
]
const LOGO_REQUEST_TERMS = ['logo', 'logos', 'brand mark', 'logotipo', 'marca']
const FOOTBALL_TERMS = ['football', 'soccer', 'futebol', 'várzea', 'varzea', 'sports', 'sport', 'esporte', 'esportes', 'team', 'club']
const FOOD_TERMS = ['restaurant', 'restaurante', 'food', 'comida', 'cafe', 'café', 'bar', 'pizza', 'burger', 'menu', 'dining']
const BAKERY_TERMS = ['bakery', 'padaria', 'baker', 'pastry', 'croissant', 'bread', 'cake', 'confeitaria', 'panadería']
const TECHNOLOGY_TERMS = ['saas', 'software', 'dashboard', 'platform', 'technology', 'tech', 'app', 'application', 'cybersecurity', 'analytics', 'ai']
const LEGAL_TERMS = ['lawyer', 'law', 'legal', 'attorney', 'advogado', 'abogado', 'solicitor', 'law firm', 'juridico', 'jurídico']
const BUSINESS_TERMS = ['business', 'empresa', 'storefront', 'store', 'shop', 'loja', 'team', 'workspace', 'office', 'coworking', 'studio', 'agency', 'consulting', 'service']
const URL_RE = /https?:\/\/[^\s"'<>]+/i
const IMAGE_URL_RE = /https?:\/\/[^\s"'<>]+(?:\.(?:png|jpe?g|webp|gif|svg)(?:[?#][^\s"'<>]*)?|[^\s"'<>]*(?:images\.unsplash\.com|images\.pexels\.com|cdn\.pixabay\.com|image|photo|logo)[^\s"'<>]*)/i

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
  return value.startsWith('https://images.unsplash.com/featured/1600x900/?')
}

function shouldReplaceGeneratedAsset(value: unknown, promptHasImageUrl: boolean): boolean {
  if (typeof value !== 'string' || value.trim().length === 0) return true
  const trimmed = value.trim()
  if (isUnsplashFeaturedUrl(trimmed)) return false
  if (promptHasImageUrl && URL_RE.test(trimmed) && !trimmed.includes('images.unsplash.com/photo-')) return false
  if (trimmed.startsWith('data:image/')) return true
  if (!URL_RE.test(trimmed)) return true
  return /images\.unsplash\.com\/photo-/i.test(trimmed)
}

function normalizeMediaAssets(content: SiteContent, prompt: string, category: MediaCategory, promptHasImageUrl: boolean): SiteContent {
  if (shouldReplaceGeneratedAsset(content.logo_url, promptHasImageUrl) && content.logo_url) {
    content.logo_url = buildLogoImageUrl(content.businessName || 'Site', category)
    content.logoAlt = content.logoAlt || `${content.businessName || 'Site'} logo image`
  }

  for (const section of content.sections || []) {
    const sectionSeed = `${prompt}:${section.heading || section.subheading || section.type || content.businessName || 'section'}`
    if ('image_url' in section && shouldReplaceGeneratedAsset(section.image_url, promptHasImageUrl)) {
      section.image_url = pickUrl(category, sectionSeed, 0)
      section.imageAlt = section.imageAlt || `${section.heading || content.businessName || 'Section image'} — ${CURATED_MEDIA[category].label}`
    }

    section.items = section.items?.map((item, index) => {
      const itemSeed = `${sectionSeed}:${item.title || item.body || 'item'}:${index}`
      const nextItem = { ...item }
      if ('image_url' in nextItem && shouldReplaceGeneratedAsset(nextItem.image_url, promptHasImageUrl)) {
        nextItem.image_url = pickUrl(category, itemSeed, index + 1)
        nextItem.imageAlt = nextItem.imageAlt || `${nextItem.title || 'Gallery image'} — ${CURATED_MEDIA[category].label}`
      }
      if ('logo_url' in nextItem && shouldReplaceGeneratedAsset(nextItem.logo_url, promptHasImageUrl)) {
        nextItem.logo_url = pickUrl(category, `${itemSeed}:logo`, index + 4)
        nextItem.logoAlt = nextItem.logoAlt || `${nextItem.title || 'Logo image'} — ${CURATED_MEDIA[category].label}`
      }
      return nextItem
    })
  }

  return content
}

function hash(input: string): number {
  let total = 0
  for (let i = 0; i < input.length; i += 1) total = (total * 31 + input.charCodeAt(i)) >>> 0
  return total
}

function inferCategory(text: string): MediaCategory {
  if (includesAny(text, FOOTBALL_TERMS)) return 'football'
  if (includesAny(text, BAKERY_TERMS)) return 'bakery'
  if (includesAny(text, FOOD_TERMS)) return 'food'
  if (includesAny(text, TECHNOLOGY_TERMS)) return 'technology'
  if (includesAny(text, LEGAL_TERMS)) return 'legal'
  if (includesAny(text, BUSINESS_TERMS)) return 'business'
  return 'generic'
}

function normalizeKeyword(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function keywordCandidates(text: string): string[] {
  const stopWords = new Set([
    'a', 'an', 'and', 'as', 'build', 'create', 'for', 'from', 'in', 'make', 'of', 'on', 'site', 'the', 'to', 'web', 'website', 'with',
    'crie', 'criar', 'para', 'com', 'site', 'uma', 'um', 'de', 'da', 'do', 'dos', 'das',
    'crear', 'sitio', 'pagina', 'página', 'con', 'una', 'un', 'para',
  ])

  return text
    .split(/[^\p{L}\p{N}]+/u)
    .map(normalizeKeyword)
    .filter(word => word.length > 2 && !stopWords.has(word))
}

function unsplashFeaturedUrl(keywords: string[]): string {
  const cleaned = Array.from(new Set(keywords.map(normalizeKeyword).filter(Boolean))).slice(0, 6)
  const finalKeywords = cleaned.length > 0 ? cleaned : CURATED_MEDIA.generic.keywordSets[0]
  return `https://images.unsplash.com/featured/1600x900/?${finalKeywords.join(',')}`
}

function pickUrl(category: MediaCategory, seed: string, offset = 0): string {
  const keywordSets = CURATED_MEDIA[category].keywordSets
  const baseKeywords = keywordSets[(hash(seed) + offset) % keywordSets.length]
  const contextualKeywords = keywordCandidates(seed).slice(0, 3)
  return unsplashFeaturedUrl([...contextualKeywords, ...baseKeywords])
}

function isFootballCategory(content: SiteContent, prompt: string): boolean {
  return inferCategory(textForDetection(content, prompt)) === 'football'
}

function isImageLedSection(type = ''): boolean {
  const t = type.toLowerCase()
  return t === 'gallery' || t === 'bento' || t === 'team' || t === 'feature-grid' || t.includes('gallery') || t.includes('bento') || t.includes('team')
}

function isLogoSection(type = ''): boolean {
  const t = type.toLowerCase()
  return t === 'logos' || t === 'sponsors' || t.includes('logo') || t.includes('sponsor') || t.includes('partner')
}

function buildLogoImageUrl(name: string, category: MediaCategory): string {
  return pickUrl(category, `${name || 'brand'}:logo:brand mark`, 7)
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
  return [
    { title: 'Storefront presence', body: `Professional imagery for ${name}.` },
    { title: 'Team at work', body: 'Human business visuals that build trust.' },
    { title: 'Workspace detail', body: 'Clean brand photography for services and calls to action.' },
  ]
}

export function wantsGeneratedMedia(prompt: string): boolean {
  const lower = prompt.toLowerCase()
  return includesAny(lower, IMAGE_REQUEST_TERMS) || includesAny(lower, LOGO_REQUEST_TERMS) || includesAny(lower, FOOTBALL_TERMS)
}

export function enrichSiteMedia(content: any, prompt: string): SiteContent {
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

  if (!shouldAddMedia) {
    return normalizeMediaAssets(next, prompt, category, promptHasImageUrl)
  }

  const firstHero = next.sections?.find(section => section.type === 'hero' || section.type === 'hero-split')
  if (firstHero && (!firstHero.image_url || (footballPrompt && !hasMediaUrl(firstHero.image_url, 'image_url')))) {
    firstHero.type = firstHero.type === 'hero' ? 'hero-split' : firstHero.type
    firstHero.image_url = pickUrl(category, `${prompt}:${firstHero.heading || next.businessName || 'hero'}`)
    firstHero.imageAlt = `${firstHero.heading || next.businessName || 'Website'} — ${label}`
  }

  let imageSection = next.sections?.find(section => isImageLedSection(section.type) && Array.isArray(section.items))
  if (!imageSection && next.sections) {
    imageSection = {
      type: 'gallery',
      heading: category === 'football' ? 'Field visuals' : category === 'food' ? 'Restaurant visuals' : 'Featured visuals',
      items: fallbackGalleryItems(next, category),
    }
    next.sections.splice(Math.min(2, next.sections.length), 0, imageSection)
  }

  if (imageSection) {
    const existingItems = imageSection.items && imageSection.items.length > 0 ? imageSection.items : fallbackGalleryItems(next, category)
    const minItems = footballPrompt ? 3 : existingItems.length
    const items = [...existingItems]
    const fallbackItems = fallbackGalleryItems(next, category)
    while (items.length < minItems) items.push(fallbackItems[items.length % fallbackItems.length])

    imageSection.items = items.map((item, index) => ({
      ...item,
      image_url: item.image_url || pickUrl(category, `${prompt}:${item.title || imageSection.heading || 'gallery'}:${index}`, index + 1),
      imageAlt: item.imageAlt || `${item.title || 'Gallery image'} — ${label}`,
    }))
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
    const logoItems = logoSection.items && logoSection.items.length > 0 ? logoSection.items : fallbackGalleryItems(next, category)
    logoSection.items = logoItems.map((item, index) => ({
      ...item,
      logo_url: item.logo_url || item.image_url || pickUrl(category, `${prompt}:${item.title || logoSection.heading || 'logo'}:${index}`, index + 4),
      logoAlt: item.logoAlt || `${item.title || 'Sponsor logo image'} — ${label}`,
    }))
  }

  if (includesAny(prompt.toLowerCase(), LOGO_REQUEST_TERMS) && !next.logo_url && !promptHasImageUrl) {
    next.logo_url = buildLogoImageUrl(next.businessName || 'Site', category)
    next.logoAlt = `${next.businessName || 'Site'} logo mark`
  }

  return normalizeMediaAssets(next, prompt, category, promptHasImageUrl)
}

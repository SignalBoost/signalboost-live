type Palette = { primary?: string; accent?: string; background?: string; surface?: string; text?: string; muted?: string }
type SiteSection = {
  type?: string
  heading?: string
  subheading?: string
  body?: string
  image_url?: string
  imageAlt?: string
  items?: Array<{ title?: string; body?: string; image_url?: string; imageAlt?: string; [key: string]: unknown }>
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

type MediaCategory = 'football' | 'food' | 'business' | 'generic'

type CuratedMedia = {
  category: MediaCategory
  label: string
  urls: string[]
}

const CURATED_MEDIA: Record<MediaCategory, CuratedMedia> = {
  football: {
    category: 'football',
    label: 'grassroots football field',
    urls: [
      'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?auto=format&fit=crop&w=1600&q=80',
      'https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=1600&q=80',
      'https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&w=1600&q=80',
      'https://images.unsplash.com/photo-1510051640316-cee39563ddab?auto=format&fit=crop&w=1600&q=80',
    ],
  },
  food: {
    category: 'food',
    label: 'restaurant dining room',
    urls: [
      'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1600&q=80',
      'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1600&q=80',
      'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1600&q=80',
      'https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=1600&q=80',
    ],
  },
  business: {
    category: 'business',
    label: 'local business workspace',
    urls: [
      'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1600&q=80',
      'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=1600&q=80',
      'https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=1600&q=80',
      'https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=1600&q=80',
    ],
  },
  generic: {
    category: 'generic',
    label: 'editorial brand imagery',
    urls: [
      'https://images.unsplash.com/photo-1497215728101-856f4ea42174?auto=format&fit=crop&w=1600&q=80',
      'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1600&q=80',
      'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1600&q=80',
      'https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=1600&q=80',
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
const FOOD_TERMS = ['restaurant', 'restaurante', 'food', 'comida', 'cafe', 'café', 'bar', 'bakery', 'padaria', 'pizza', 'burger', 'menu', 'dining']
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

function hash(input: string): number {
  let total = 0
  for (let i = 0; i < input.length; i += 1) total = (total * 31 + input.charCodeAt(i)) >>> 0
  return total
}

function inferCategory(text: string): MediaCategory {
  if (includesAny(text, FOOTBALL_TERMS)) return 'football'
  if (includesAny(text, FOOD_TERMS)) return 'food'
  if (includesAny(text, BUSINESS_TERMS)) return 'business'
  return 'generic'
}

function pickUrl(category: MediaCategory, seed: string, offset = 0): string {
  const urls = CURATED_MEDIA[category].urls
  return urls[(hash(seed) + offset) % urls.length]
}

function buildLogoDataUri(name: string, palette: Palette = {}): string {
  const cleanName = name.trim() || 'Site'
  const initials = cleanName.split(/\s+/).slice(0, 2).map(word => word[0]?.toUpperCase()).join('') || 'SB'
  const primary = encodeURIComponent(palette.primary || '#2563eb')
  const accent = encodeURIComponent(palette.accent || '#f97316')
  const text = encodeURIComponent('#ffffff')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${primary}"/><stop offset="1" stop-color="${accent}"/></linearGradient></defs><rect width="256" height="256" rx="64" fill="url(%23g)"/><text x="128" y="148" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="76" font-weight="800" fill="${text}">${initials}</text></svg>`
  return `data:image/svg+xml;utf8,${svg}`
}

function fallbackGalleryItems(content: SiteContent, category: MediaCategory) {
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
  return includesAny(lower, IMAGE_REQUEST_TERMS) || includesAny(lower, LOGO_REQUEST_TERMS)
}

export function enrichSiteMedia(content: any, prompt: string): SiteContent {
  if (!content || typeof content !== 'object' || !Array.isArray(content.sections)) return content
  if (!wantsGeneratedMedia(prompt)) return content
  if (hasExplicitInputImageUrl(prompt) || hasMediaUrl(content)) return content

  const next: SiteContent = {
    ...content,
    sections: content.sections.map(section => ({ ...section, items: section.items?.map(item => ({ ...item })) })),
  }
  const detectionText = textForDetection(next, prompt)
  const category = inferCategory(detectionText)
  const label = CURATED_MEDIA[category].label
  const firstHero = next.sections?.find(section => section.type === 'hero' || section.type === 'hero-split')

  if (firstHero) {
    firstHero.type = firstHero.type === 'hero' ? 'hero-split' : firstHero.type
    firstHero.image_url = pickUrl(category, `${prompt}:${firstHero.heading || next.businessName || 'hero'}`)
    firstHero.imageAlt = `${firstHero.heading || next.businessName || 'Website'} — ${label}`
  }

  let gallery = next.sections?.find(section => section.type === 'gallery')
  if (!gallery && next.sections) {
    gallery = {
      type: 'gallery',
      heading: category === 'football' ? 'Field visuals' : category === 'food' ? 'Restaurant visuals' : 'Featured visuals',
      items: fallbackGalleryItems(next, category),
    }
    next.sections.splice(Math.min(2, next.sections.length), 0, gallery)
  }

  if (gallery) {
    gallery.items = (gallery.items && gallery.items.length > 0 ? gallery.items : fallbackGalleryItems(next, category)).map((item, index) => ({
      ...item,
      image_url: item.image_url || pickUrl(category, `${prompt}:${item.title || 'gallery'}:${index}`, index + 1),
      imageAlt: item.imageAlt || `${item.title || 'Gallery image'} — ${label}`,
    }))
  }

  if (includesAny(prompt.toLowerCase(), LOGO_REQUEST_TERMS) && !next.logo_url) {
    next.logo_url = buildLogoDataUri(next.businessName || 'Site', next.palette)
    next.logoAlt = `${next.businessName || 'Site'} logo mark`
  }

  return next
}

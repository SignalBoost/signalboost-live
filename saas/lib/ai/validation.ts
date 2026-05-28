// saas/lib/ai/validation.ts
// Types and validators for all 4 AI modes. Never throws — always returns safe fallbacks.

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ValidLocalItem {
  name:         string
  neighborhood: string | null
  zone:         string | null
  founded:      string | null
  colors:       string[]
  description:  string
}

export interface ValidBusinessSite {
  hero: {
    headline:      string
    subheadline:   string
    primary_cta:   string
    secondary_cta: string | null
  }
  about: {
    title: string
    body:  string
  }
  services: {
    name:        string
    description: string
    price_hint:  string | null
  }[]
  testimonials: {
    name:  string
    role:  string | null
    quote: string
  }[]
  faq: {
    question: string
    answer:   string
  }[]
  contact: {
    headline: string
    body:     string
    cta:      string
  }
}

export interface ValidCreativeWorld {
  world_summary:    string
  main_characters:  { name: string; role: string; description: string }[]
  locations:        { name: string; type: string; description: string }[]
  conflicts:        { title: string; description: string }[]
}

export interface ValidGlobalKnowledge {
  topic:            string
  summary:          string
  key_points:       string[]
  related_entities: string[]
}

// ── Safe JSON parser ──────────────────────────────────────────────────────────

export function safeParseJSON(raw: string): any | null {
  if (!raw || typeof raw !== 'string') return null

  // Try direct parse
  try { return JSON.parse(raw) } catch { /* continue */ }

  // Try extracting JSON array
  try {
    const firstBracket = raw.indexOf('[')
    const lastBracket  = raw.lastIndexOf(']')
    if (firstBracket !== -1 && lastBracket > firstBracket) {
      return JSON.parse(raw.slice(firstBracket, lastBracket + 1))
    }
  } catch { /* continue */ }

  // Try extracting JSON object
  try {
    const firstBrace = raw.indexOf('{')
    const lastBrace  = raw.lastIndexOf('}')
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(raw.slice(firstBrace, lastBrace + 1))
    }
  } catch { /* continue */ }

  console.warn('validation: safeParseJSON failed on input length', raw.length)
  return null
}

// ── Validators ────────────────────────────────────────────────────────────────

export function validateLocalItems(raw: any): ValidLocalItem[] {
  if (!Array.isArray(raw)) {
    console.warn('validation: validateLocalItems — expected array, got', typeof raw)
    return []
  }

  const valid: ValidLocalItem[] = []

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const name = (item.name || item.nome || '').toString().trim()
    if (!name) continue

    valid.push({
      name,
      neighborhood: item.neighborhood || item.bairro || item.district || null,
      zone:         item.zone || item.zona || item.region || null,
      founded:      item.founded || item.fundado || item.ano_fundacao ? String(item.founded || item.fundado || item.ano_fundacao) : null,
      colors:       Array.isArray(item.colors) ? item.colors : Array.isArray(item.cores) ? item.cores : [],
      description:  (item.description || item.descricao || item.desc || '').toString().trim() || name,
    })
  }

  console.log('validation: validateLocalItems —', valid.length, 'valid of', raw.length, 'total')
  return valid
}

export function validateBusinessSite(raw: any): ValidBusinessSite {
  if (!raw || typeof raw !== 'object') {
    console.warn('validation: validateBusinessSite — invalid input; returning fallback')
    raw = {}
  }

  // Safe fallback defaults
  const site: ValidBusinessSite = {
    hero: {
      headline:      raw.hero?.headline    || 'Welcome',
      subheadline:   raw.hero?.subheadline || 'Your business, simplified.',
      primary_cta:   raw.hero?.primary_cta || 'Get started',
      secondary_cta: raw.hero?.secondary_cta || null,
    },
    about: {
      title: raw.about?.title || 'About us',
      body:  raw.about?.body  || 'We are here to help.',
    },
    services: Array.isArray(raw.services)
      ? raw.services.filter((s: any) => s?.name).map((s: any) => ({
          name:        (s.name || '').toString(),
          description: (s.description || '').toString(),
          price_hint:  s.price_hint || null,
        }))
      : [],
    testimonials: Array.isArray(raw.testimonials)
      ? raw.testimonials.filter((t: any) => t?.name && t?.quote).map((t: any) => ({
          name:  (t.name || '').toString(),
          role:  t.role || null,
          quote: (t.quote || '').toString(),
        }))
      : [],
    faq: Array.isArray(raw.faq)
      ? raw.faq.filter((f: any) => f?.question && f?.answer).map((f: any) => ({
          question: (f.question || '').toString(),
          answer:   (f.answer   || '').toString(),
        }))
      : [],
    contact: {
      headline: raw.contact?.headline || 'Contact us',
      body:     raw.contact?.body     || 'Get in touch with us.',
      cta:      raw.contact?.cta      || 'Send a message',
    },
  }

  return site
}

export function validateCreativeWorld(raw: any): ValidCreativeWorld {
  if (!raw || typeof raw !== 'object') {
    console.warn('validation: validateCreativeWorld — invalid input; returning fallback')
    raw = {}
  }

  return {
    world_summary: (raw.world_summary || '').toString().trim() || 'A fictional world.',
    main_characters: Array.isArray(raw.main_characters)
      ? raw.main_characters.filter((c: any) => c?.name).map((c: any) => ({
          name:        (c.name        || '').toString(),
          role:        (c.role        || '').toString(),
          description: (c.description || '').toString(),
        }))
      : [],
    locations: Array.isArray(raw.locations)
      ? raw.locations.filter((l: any) => l?.name).map((l: any) => ({
          name:        (l.name        || '').toString(),
          type:        (l.type        || '').toString(),
          description: (l.description || '').toString(),
        }))
      : [],
    conflicts: Array.isArray(raw.conflicts)
      ? raw.conflicts.filter((c: any) => c?.title).map((c: any) => ({
          title:       (c.title       || '').toString(),
          description: (c.description || '').toString(),
        }))
      : [],
  }
}

export function validateGlobalKnowledge(raw: any): ValidGlobalKnowledge {
  if (!raw || typeof raw !== 'object') {
    console.warn('validation: validateGlobalKnowledge — invalid input; returning fallback')
    raw = {}
  }

  return {
    topic:            (raw.topic   || '').toString().trim() || 'Unknown topic',
    summary:          (raw.summary || '').toString().trim() || '',
    key_points:       Array.isArray(raw.key_points)       ? raw.key_points.filter((s: any) => typeof s === 'string')       : [],
    related_entities: Array.isArray(raw.related_entities) ? raw.related_entities.filter((s: any) => typeof s === 'string') : [],
  }
}

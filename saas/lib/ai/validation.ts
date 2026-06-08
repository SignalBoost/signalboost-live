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

  // 1) Strip markdown code fences (```json ... ``` or ``` ... ```) and trim.
  let cleaned = raw.trim()
  cleaned = cleaned
    .replace(/^```(?:json)?\s*/i, '') // opening fence at start
    .replace(/```\s*$/i, '')          // closing fence at end
    .trim()

  // 2) Try a direct parse of the cleaned string.
  try { return JSON.parse(cleaned) } catch { /* continue */ }

  // 3) Try the original raw, in case cleaning removed something valid.
  try { return JSON.parse(raw) } catch { /* continue */ }

  // 4) Decide whether the content looks like an object or an array by which
  //    delimiter appears FIRST, then extract that balanced region.
  const firstBrace = cleaned.indexOf('{')
  const firstBracket = cleaned.indexOf('[')

  const preferObject =
    firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)

  const tryExtract = (open: string, close: string): any | null => {
    const start = cleaned.indexOf(open)
    const end = cleaned.lastIndexOf(close)
    if (start === -1 || end <= start) return null
    const slice = cleaned.slice(start, end + 1)
    try { return JSON.parse(slice) } catch { return null }
  }

  // 5) Try the preferred shape first, then the other.
  if (preferObject) {
    const obj = tryExtract('{', '}')
    if (obj !== null) return obj
    const arr = tryExtract('[', ']')
    if (arr !== null) return arr
  } else {
    const arr = tryExtract('[', ']')
    if (arr !== null) return arr
    const obj = tryExtract('{', '}')
    if (obj !== null) return obj
  }

  // 6) Last resort: remove trailing commas before } or ] and retry.
  try {
    const deTrailed = cleaned.replace(/,\s*([}\]])/g, '$1')
    return JSON.parse(deTrailed)
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

export function validateBusinessSite(raw: any): ValidBusinessSite | null {
  if (!raw || typeof raw !== 'object') {
    console.warn('validation: validateBusinessSite — invalid input')
    return null
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

export function validateCreativeWorld(raw: any): ValidCreativeWorld | null {
  if (!raw || typeof raw !== 'object') {
    console.warn('validation: validateCreativeWorld — invalid input')
    return null
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

export function validateGlobalKnowledge(raw: any): ValidGlobalKnowledge | null {
  if (!raw || typeof raw !== 'object') {
    console.warn('validation: validateGlobalKnowledge — invalid input')
    return null
  }

  return {
    topic:            (raw.topic   || '').toString().trim() || 'Unknown topic',
    summary:          (raw.summary || '').toString().trim() || '',
    key_points:       Array.isArray(raw.key_points)       ? raw.key_points.filter((s: any) => typeof s === 'string')       : [],
    related_entities: Array.isArray(raw.related_entities) ? raw.related_entities.filter((s: any) => typeof s === 'string') : [],
  }
}

// saas/lib/ai/memory.ts
// Supabase memory layer — save and reuse generated AI content.

import { createClient } from '@supabase/supabase-js'
import type { ValidLocalItem, ValidBusinessSite } from './validation'

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// ── Save local items ──────────────────────────────────────────────────────────

export async function saveLocalItems(
  items:   ValidLocalItem[],
  context: { userPrompt: string; language: string; category?: string },
): Promise<void> {
  if (items.length === 0) return
  try {
    const db   = supabaseAdmin()
    const rows = items.map(item => ({
      name:         item.name,
      neighborhood: item.neighborhood,
      zone:         item.zone,
      founded:      item.founded,
      colors:       item.colors,
      description:  item.description,
      language:     context.language,
      user_prompt:  context.userPrompt.slice(0, 500),
    }))
    const { error } = await db.from('ai_local_items').insert(rows)
    if (error) console.error('memory: saveLocalItems error', error.message)
    else console.log('memory: saveLocalItems — saved', rows.length, 'items')
  } catch (err) {
    console.error('memory: saveLocalItems exception (non-blocking)', err)
  }
}

// ── Save business site ────────────────────────────────────────────────────────

export async function saveBusinessSite(
  site:    ValidBusinessSite,
  context: { userPrompt: string; language: string },
): Promise<void> {
  try {
    const db = supabaseAdmin()
    const { error } = await db.from('ai_business_sites').insert({
      site_json:   site,
      language:    context.language,
      user_prompt: context.userPrompt.slice(0, 500),
    })
    if (error) console.error('memory: saveBusinessSite error', error.message)
    else console.log('memory: saveBusinessSite — saved')
  } catch (err) {
    console.error('memory: saveBusinessSite exception (non-blocking)', err)
  }
}

// ── Save site design (full SitePreviewContent JSON) ───────────────────────────

export async function saveSiteDesign(
  content:  object,
  context:  { userPrompt: string; language: string },
): Promise<void> {
  try {
    const db = supabaseAdmin()
    const { error } = await db.from('ai_business_sites').insert({
      site_json:   content,
      language:    context.language,
      user_prompt: context.userPrompt.slice(0, 500),
    })
    if (error) console.error('memory: saveSiteDesign error', error.message)
    else console.log('memory: saveSiteDesign — saved')
  } catch (err) {
    console.error('memory: saveSiteDesign exception (non-blocking)', err)
  }
}

// ── Get cached site design ────────────────────────────────────────────────────
// Looks for a previously generated site for the same prompt + language.
// Returns null on miss so the caller falls through to Claude.

export async function getSiteDesignCache(context: {
  userPrompt: string
  language:   string
  maxAge?:    number // hours, default 24
}): Promise<object | null> {
  const maxAge = context.maxAge ?? 24
  try {
    const db    = supabaseAdmin()
    const since = new Date(Date.now() - maxAge * 60 * 60 * 1000).toISOString()

    const { data, error } = await db
      .from('ai_business_sites')
      .select('site_json')
      .eq('language', context.language)
      .eq('user_prompt', context.userPrompt.slice(0, 500))
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error('memory: getSiteDesignCache error', error.message)
      return null
    }

    if (!data?.site_json) {
      console.log('memory: getSiteDesignCache — miss')
      return null
    }

    console.log('memory: getSiteDesignCache — HIT')
    return data.site_json as object
  } catch (err) {
    console.error('memory: getSiteDesignCache exception', err)
    return null
  }
}

// ── Cache lookup for local items ──────────────────────────────────────────────

function extractCacheKeywords(userPrompt: string): string[] {
  const lower = userPrompt.toLowerCase()
  const cities = [
    'são paulo', 'sao paulo', 'sp',
    'rio de janeiro', 'rj',
    'belo horizonte', 'bh',
    'curitiba', 'salvador', 'fortaleza', 'recife', 'manaus',
    'zona norte', 'zona sul', 'zona leste', 'zona oeste',
    'jaçanã', 'tucuruvi', 'santana', 'penha', 'tatuapé',
    'ipiranga', 'vila prudente', 'pirituba', 'brasilândia',
  ]
  const categories = [
    'várzea', 'varzea', 'futebol', 'football', 'soccer',
    'restaurante', 'restaurant', 'padaria', 'bakery',
    'academia', 'gym', 'barbearia', 'barbershop',
    'museu', 'museum', 'igreja', 'church', 'praia', 'beach',
  ]
  const found: string[] = []
  for (const kw of [...cities, ...categories]) {
    if (lower.includes(kw)) found.push(kw)
  }
  return found
}

export async function getCachedLocalItems(context: {
  userPrompt: string
  language:   string
  minItems?:  number
  maxAge?:    number
}): Promise<ValidLocalItem[] | null> {
  const minItems = context.minItems ?? 10
  const maxAge   = context.maxAge   ?? 48

  try {
    const keywords = extractCacheKeywords(context.userPrompt)
    if (keywords.length === 0) {
      console.log('memory: getCachedLocalItems — no cache keywords found')
      return null
    }

    const db    = supabaseAdmin()
    const since = new Date(Date.now() - maxAge * 60 * 60 * 1000).toISOString()

    const orFilter = keywords
      .slice(0, 5)
      .map(kw => `user_prompt.ilike.%${kw}%`)
      .join(',')

    const { data, error } = await db
      .from('ai_local_items')
      .select('name, neighborhood, zone, founded, colors, description')
      .eq('language', context.language)
      .gte('created_at', since)
      .or(orFilter)
      .order('created_at', { ascending: false })
      .limit(40)

    if (error) {
      console.error('memory: getCachedLocalItems error', error.message)
      return null
    }

    if (!data || data.length < minItems) {
      console.log(`memory: getCachedLocalItems — miss (${data?.length ?? 0} rows, need ${minItems})`)
      return null
    }

    console.log(`memory: getCachedLocalItems — HIT (${data.length} rows, keywords: ${keywords.join(', ')})`)

    return data.map(row => ({
      name:         row.name,
      neighborhood: row.neighborhood,
      zone:         row.zone,
      founded:      row.founded,
      colors:       Array.isArray(row.colors)
        ? row.colors
        : typeof row.colors === 'string'
          ? (() => { try { return JSON.parse(row.colors) } catch { return [] } })()
          : [],
      description: row.description,
    }))
  } catch (err) {
    console.error('memory: getCachedLocalItems exception', err)
    return null
  }
}

// ── Retrieve recent local items ───────────────────────────────────────────────

export async function getRecentLocalItems(context: {
  language: string
  limit?:   number
}): Promise<ValidLocalItem[]> {
  try {
    const db    = supabaseAdmin()
    const limit = context.limit ?? 20
    const { data, error } = await db
      .from('ai_local_items')
      .select('name, neighborhood, zone, founded, colors, description')
      .eq('language', context.language)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) { console.error('memory: getRecentLocalItems error', error.message); return [] }

    return (data ?? []).map(row => ({
      name:         row.name,
      neighborhood: row.neighborhood,
      zone:         row.zone,
      founded:      row.founded,
      colors:       Array.isArray(row.colors)
        ? row.colors
        : typeof row.colors === 'string'
          ? (() => { try { return JSON.parse(row.colors) } catch { return [] } })()
          : [],
      description: row.description,
    }))
  } catch (err) {
    console.error('memory: getRecentLocalItems exception', err)
    return []
  }
}

// ── Retrieve recent business sites ────────────────────────────────────────────

export async function getRecentBusinessSites(context: {
  language: string
  limit?:   number
}): Promise<ValidBusinessSite[]> {
  try {
    const db    = supabaseAdmin()
    const limit = context.limit ?? 5
    const { data, error } = await db
      .from('ai_business_sites')
      .select('site_json')
      .eq('language', context.language)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) { console.error('memory: getRecentBusinessSites error', error.message); return [] }

    return (data ?? []).map(row => row.site_json as ValidBusinessSite)
  } catch (err) {
    console.error('memory: getRecentBusinessSites exception', err)
    return []
  }
}

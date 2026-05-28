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
  context: { userPrompt: string; language: string },
): Promise<void> {
  if (items.length === 0) return
  try {
    const db   = supabaseAdmin()
    const rows = items.map(item => ({
      name:         item.name,
      neighborhood: item.neighborhood,
      zone:         item.zone,
      founded:      item.founded,
      colors:       JSON.stringify(item.colors),
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
      colors:       Array.isArray(row.colors) ? row.colors : (typeof row.colors === 'string' ? JSON.parse(row.colors) : []),
      description:  row.description,
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

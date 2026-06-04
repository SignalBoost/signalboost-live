import { createClient } from '@supabase/supabase-js'
import type { WebsiteAuditResult, WebsiteRecommendation, WebsiteRebuildResult } from './types'

type SupabaseAdmin = any | null

function getSupabaseAdmin(): SupabaseAdmin {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } }) as any
}

export async function persistWebsiteAudit(accountId: string | null, result: WebsiteAuditResult) {
  const supabase = getSupabaseAdmin()
  if (!supabase) return { auditId: null as string | null, stored: false }
  const { data, error } = await supabase.from('website_audits').insert({
    account_id: accountId,
    url: result.normalized_url || result.url,
    performance_score: result.performance,
    seo_score: result.seo,
    accessibility_score: result.accessibility,
    mobile_score: result.mobile,
    conversion_score: result.conversion,
    security_score: result.security,
    raw_report: result.raw_report,
  }).select('id').single()
  if (error) return { auditId: null, stored: false, error: error.message }
  const auditId = data?.id as string | undefined
  if (auditId && result.recommendations.length) await persistWebsiteRecommendations(auditId, result.recommendations)
  return { auditId: auditId || null, stored: Boolean(auditId) }
}

export async function persistWebsiteRecommendations(auditId: string, recommendations: WebsiteRecommendation[]) {
  const supabase = getSupabaseAdmin()
  if (!supabase) return { stored: false }
  const rows = recommendations.map(item => ({ audit_id: auditId, category: item.category, priority: item.priority, recommendation: item.recommendation, suggested_fix: item.suggested_fix }))
  const { error } = await supabase.from('website_recommendations').insert(rows)
  return { stored: !error, error: error?.message }
}

export async function persistWebsiteRebuild(accountId: string | null, sourceUrl: string, result: WebsiteRebuildResult) {
  const supabase = getSupabaseAdmin()
  if (!supabase) return { rebuildId: null as string | null, stored: false }
  const { data, error } = await supabase.from('website_rebuilds').insert({
    account_id: accountId,
    source_url: sourceUrl,
    status: 'generated',
    generated_structure: { recommended: result.recommended, reason: result.reason, structure: result.structure },
    generated_content: { content: result.content, seo: result.seo },
  }).select('id').single()
  if (error) return { rebuildId: null, stored: false, error: error.message }
  return { rebuildId: (data?.id as string | undefined) || null, stored: true }
}

export async function persistConciergeIntent(input: { accountId?: string | null; rawInput: string; cleanedInput: string; intent: string }) {
  const supabase = getSupabaseAdmin()
  if (!supabase) return { stored: false }
  const { error } = await supabase.from('concierge_intents').insert({ account_id: input.accountId || null, raw_input: input.rawInput, cleaned_input: input.cleanedInput, intent: input.intent })
  return { stored: !error, error: error?.message }
}

export async function getLatestWebsiteAudit(accountId?: string | null) {
  const supabase = getSupabaseAdmin()
  if (!supabase || !accountId) return null
  const { data } = await supabase.from('website_audits').select('*').eq('account_id', accountId).order('created_at', { ascending: false }).limit(1).maybeSingle()
  return data || null
}

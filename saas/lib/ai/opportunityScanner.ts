// saas/lib/ai/opportunityScanner.ts
// Continuous opportunity scanner for SignalBoost.
// Runs live web searches across market/competitor/affiliate topics, has the
// strategist model (gpt-4o) interpret the signals, and stores structured
// alerts (what happened / why it matters / recommended action) in the
// `opportunity_alerts` table. Triggered by the daily Vercel cron or manually
// from the Opportunities dashboard.

import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import { getExternalInfo } from '@/lib/ai/tools/getExternalInfo'

const ALERTS_TABLE = 'opportunity_alerts'
const MAX_ALERTS_PER_SCAN = 6
const DEDUPE_WINDOW_DAYS = 14

export type OpportunityAlert = {
  id: string
  title: string
  what_happened: string
  why_it_matters: string
  recommended_action: string
  category: string
  source_urls: string[]
  status: string
  created_at: string
}

const SCAN_QUERIES = [
  'AI website builder new features launch',
  'SaaS marketing tools product launches this week',
  'affiliate marketing program opportunities travel SaaS',
  'AI content generation SaaS pricing changes news',
  'small business marketing software trends',
]

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// ── List recent alerts (dashboard + Chief of Staff tool) ──────────────────────
export async function listRecentAlerts(limit = 20): Promise<{ ok: boolean; alerts: OpportunityAlert[]; error?: string }> {
  try {
    const db = supabaseAdmin()
    const { data, error } = await db
      .from(ALERTS_TABLE)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 50))

    if (error) return { ok: false, alerts: [], error: error.message }
    return { ok: true, alerts: (data ?? []) as OpportunityAlert[] }
  } catch (err) {
    return { ok: false, alerts: [], error: err instanceof Error ? err.message : 'Unknown error listing alerts' }
  }
}

export function formatAlertsForAI(alerts: OpportunityAlert[]): string {
  if (!alerts.length) {
    return 'No opportunity alerts stored yet. The daily scanner has not produced findings, or no scan has run. The owner can trigger one from the Opportunities dashboard.'
  }
  const blocks = alerts.slice(0, 10).map(a => {
    const date = new Date(a.created_at).toUTCString().slice(0, 16)
    return `• [${a.category}] ${a.title} (${date}, status: ${a.status})
  What happened: ${a.what_happened}
  Why it matters: ${a.why_it_matters}
  Recommended action: ${a.recommended_action}${a.source_urls?.length ? `\n  Sources: ${a.source_urls.join(' , ')}` : ''}`
  })
  return `OPPORTUNITY ALERTS (live from the scanner database, newest first):

${blocks.join('\n\n')}`
}

// ── Update alert status (reviewed / dismissed) ─────────────────────────────────
export async function updateAlertStatus(
  id: string,
  status: 'new' | 'reviewed' | 'dismissed',
): Promise<{ ok: boolean; error?: string }> {
  try {
    const db = supabaseAdmin()
    const { error } = await db.from(ALERTS_TABLE).update({ status }).eq('id', id)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error updating alert' }
  }
}

// ── Run a full scan ─────────────────────────────────────────────────────────────
export async function runOpportunityScan(): Promise<{ ok: boolean; inserted: number; error?: string }> {
  try {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) return { ok: false, inserted: 0, error: 'OPENAI_API_KEY is not configured.' }

    // 1) Gather live signals from the web.
    const signalBlocks: string[] = []
    for (const query of SCAN_QUERIES) {
      const search = await getExternalInfo(query)
      if (search.ok && search.results.length) {
        const lines = search.results
          .slice(0, 5)
          .map(r => `- ${r.title} | ${r.url} | ${r.snippet}`)
          .join('\n')
        signalBlocks.push(`SEARCH: "${query}"\n${lines}`)
      }
    }

    if (signalBlocks.length === 0) {
      return { ok: false, inserted: 0, error: 'No live web data available (check BRAVE_SEARCH_API_KEY).' }
    }

    // 2) Recent alert titles for deduplication.
    const db = supabaseAdmin()
    const since = new Date(Date.now() - DEDUPE_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()
    const { data: recent } = await db
      .from(ALERTS_TABLE)
      .select('title')
      .gte('created_at', since)
      .limit(100)
    const recentTitles = (recent ?? []).map(r => String(r.title))

    // 3) Strategist analysis → structured JSON alerts.
    const openai = new OpenAI({ apiKey })
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.4,
      max_tokens: 1800,
      messages: [
        {
          role: 'system',
          content: `You are the Chief Marketing & Sales Strategist for SignalBoost, scanning live market signals for opportunities.

SignalBoost context: a multilingual (EN/ES/PT/PL/RU) SaaS platform (AI website builder, review-to-content generator, image/video/audio studios, outreach engine) plus a digital AI shopping mall with a commission-based affiliate network (travel-heavy: hotels, flights, car rentals). Target: small businesses and creators, global audience.

From the live search results provided, identify the most significant opportunities or threats. Apply strategist judgment (SWOT thinking, positioning, pricing, funnel implications). Be selective — only genuinely actionable items, maximum ${MAX_ALERTS_PER_SCAN}.

ALREADY-REPORTED titles (do NOT repeat these or near-duplicates): ${recentTitles.length ? recentTitles.join(' | ') : '(none)'}

Respond with ONLY a JSON array, no markdown fences, no preamble. Each element:
{
  "title": "short headline, max 90 chars",
  "what_happened": "the event/launch/change, 1-2 sentences, factual",
  "why_it_matters": "growth potential or competitive impact for SignalBoost, 1-2 sentences",
  "recommended_action": "one of copy / improve / partner / monitor / ignore, plus a concrete next step in 1-2 sentences",
  "category": "one of: competitor, market_gap, partnership, pricing, trend",
  "source_urls": ["url1", "url2"]
}

If nothing genuinely actionable is found, respond with [].`,
        },
        { role: 'user', content: signalBlocks.join('\n\n') },
      ],
    })

    const rawText = completion.choices[0]?.message?.content?.trim() || '[]'
    const cleaned = rawText.replace(/^```(?:json)?/i, '').replace(/```$/,'').trim()

    let parsed: unknown
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      return { ok: false, inserted: 0, error: 'Strategist output was not valid JSON.' }
    }
    if (!Array.isArray(parsed)) {
      return { ok: false, inserted: 0, error: 'Strategist output was not a JSON array.' }
    }

    // 4) Validate, dedupe, insert.
    const rows = parsed
      .slice(0, MAX_ALERTS_PER_SCAN)
      .map((a: any) => ({
        title: String(a?.title || '').slice(0, 120),
        what_happened: String(a?.what_happened || '').slice(0, 600),
        why_it_matters: String(a?.why_it_matters || '').slice(0, 600),
        recommended_action: String(a?.recommended_action || '').slice(0, 600),
        category: ['competitor', 'market_gap', 'partnership', 'pricing', 'trend'].includes(String(a?.category))
          ? String(a.category)
          : 'trend',
        source_urls: Array.isArray(a?.source_urls)
          ? a.source_urls.slice(0, 4).map((u: unknown) => String(u)).filter((u: string) => u.startsWith('http'))
          : [],
        status: 'new',
      }))
      .filter(r => r.title && r.what_happened && r.recommended_action)
      .filter(r => !recentTitles.some(t => t.toLowerCase() === r.title.toLowerCase()))

    if (rows.length === 0) {
      return { ok: true, inserted: 0 }
    }

    const { error: insertError } = await db.from(ALERTS_TABLE).insert(rows)
    if (insertError) {
      return { ok: false, inserted: 0, error: insertError.message }
    }

    return { ok: true, inserted: rows.length }
  } catch (err) {
    return { ok: false, inserted: 0, error: err instanceof Error ? err.message : 'Unknown scan error' }
  }
}

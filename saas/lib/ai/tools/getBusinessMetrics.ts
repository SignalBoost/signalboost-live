// saas/lib/ai/tools/getBusinessMetrics.ts
// Live Supabase metrics for the Chief of Staff AI persona.
// Called only for owner/admin users — never exposed to the Concierge.

import { createClient } from '@supabase/supabase-js'

export type BusinessMetrics = {
  totalUsers:    number
  paidUsers:     number
  mrr:           number
  planBreakdown: Record<string, number>
  outreachLeads: number
  creditsSnapshot: {
    avgVideoCreditsRemaining: number
    avgImageCreditsRemaining: number
    avgAiCreditsRemaining:    number
  }
  generatedAt: string
}

export type MetricsResult =
  | { ok: true;  metrics: BusinessMetrics; source: string }
  | { ok: false; error: string }

// Monthly revenue per paid plan
const PLAN_MRR: Record<string, number> = {
  launch:  29,
  growth:  99,
  command: 249,
}

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function getBusinessMetrics(): Promise<MetricsResult> {
  try {
    const db = supabaseAdmin()

    // ── Subscriptions: users, plans, credits ──────────────────────────────
    const { data: subs, error: subsError } = await db
      .from('subscriptions')
      .select('plan, video_credits, image_credits, ai_credits, user_id')

    if (subsError) {
      return { ok: false, error: `Subscriptions query failed: ${subsError.message}` }
    }

    const allSubs   = subs ?? []
    const totalUsers = allSubs.length

    const paidPlans = ['launch', 'growth', 'command']
    const paidSubs  = allSubs.filter(s => paidPlans.includes(s.plan))
    const paidUsers = paidSubs.length

    // Plan breakdown — all plans including free
    const planBreakdown: Record<string, number> = {}
    for (const sub of allSubs) {
      planBreakdown[sub.plan] = (planBreakdown[sub.plan] ?? 0) + 1
    }

    // MRR from paid subscriptions
    const mrr = paidSubs.reduce((sum, s) => sum + (PLAN_MRR[s.plan] ?? 0), 0)

    // Average remaining credits across paid users
    const withCredits = paidSubs.filter(s => s.video_credits != null)
    const avg = (field: 'video_credits' | 'image_credits' | 'ai_credits') =>
      withCredits.length
        ? Math.round(withCredits.reduce((s, r) => s + (r[field] ?? 0), 0) / withCredits.length)
        : 0

    // ── Outreach queue: lead count ────────────────────────────────────────
    const { count: outreachLeads, error: outreachError } = await db
      .from('outreach_queue')
      .select('id', { count: 'exact', head: true })

    if (outreachError) {
      console.error('getBusinessMetrics: outreach_queue query failed', outreachError.message)
    }

    const metrics: BusinessMetrics = {
      totalUsers,
      paidUsers,
      mrr,
      planBreakdown,
      outreachLeads: outreachLeads ?? 0,
      creditsSnapshot: {
        avgVideoCreditsRemaining:  avg('video_credits'),
        avgImageCreditsRemaining:  avg('image_credits'),
        avgAiCreditsRemaining:     avg('ai_credits'),
      },
      generatedAt: new Date().toISOString(),
    }

    return {
      ok:      true,
      metrics,
      source:  `Supabase live — ${metrics.generatedAt}`,
    }
  } catch (err) {
    return {
      ok:    false,
      error: err instanceof Error ? err.message : 'Unknown error fetching metrics',
    }
  }
}

// Format metrics as a readable string for the AI model
export function formatMetricsForAI(metrics: BusinessMetrics): string {
  const planLines = Object.entries(metrics.planBreakdown)
    .sort(([, a], [, b]) => b - a)
    .map(([plan, count]) => `  - ${plan}: ${count} user${count !== 1 ? 's' : ''}`)
    .join('\n')

  return `LIVE SIGNALBOOST BUSINESS METRICS (as of ${new Date(metrics.generatedAt).toUTCString()}):

Users
  Total accounts:  ${metrics.totalUsers}
  Paid accounts:   ${metrics.paidUsers}
  Free/demo:       ${metrics.totalUsers - metrics.paidUsers}

Revenue
  MRR (est.):      $${metrics.mrr.toLocaleString()}
  ARR (est.):      $${(metrics.mrr * 12).toLocaleString()}

Plan breakdown
${planLines || '  No data'}

Outreach pipeline
  Leads in queue:  ${metrics.outreachLeads}

Credits (avg remaining across paid users)
  Video:           ${metrics.creditsSnapshot.avgVideoCreditsRemaining}
  Image:           ${metrics.creditsSnapshot.avgImageCreditsRemaining}
  AI actions:      ${metrics.creditsSnapshot.avgAiCreditsRemaining}

Source: ${metrics.generatedAt}`
}

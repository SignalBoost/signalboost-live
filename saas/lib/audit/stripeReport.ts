// saas/lib/audit/stripeReport.ts
//
// Stripe / Payments Configuration report generator. PURE — snapshot in,
// structured report out. No I/O, no LLM, no React. Surfaces the billing posture:
// live vs test mode, configured price tiers (mismatches flagged), webhook
// endpoints, env→price mismatches, plus the stripe-category findings.

import { runFindings, type AuditSnapshot, type NormalizedStripe } from '@/lib/audit/findingsEngine'
import { scoreFromFindings, type Finding, type AuditScore } from '@/lib/audit/reportModel'

export interface StripeTierRow {
  name: string
  priceId: string
  amount: number // minor units (cents), as Stripe returns
  interval: string
  mismatch: boolean
}

export interface StripeWebhookRow {
  url: string
  status: string
  events: number
}

export interface StripeReportData {
  generatedAt: string
  configured: boolean
  liveMode: boolean
  tiers: StripeTierRow[]
  webhooks: StripeWebhookRow[]
  mismatches: string[] // env var names pointing at inactive prices
  findings: Finding[] // stripe-provider only
  score: AuditScore
  summary: {
    tiers: number
    webhooks: number
    mismatches: number
    liveMode: boolean
  }
}

export function buildStripeReport(snapshot: AuditSnapshot): StripeReportData {
  const s: NormalizedStripe | undefined = snapshot.stripe
  const configured = !!s && s.ok !== false

  const tiers: StripeTierRow[] = ((s && s.tiers) || [])
    .map(t => ({
      name: t.name,
      priceId: t.priceId,
      amount: typeof t.amount === 'number' ? t.amount : 0,
      interval: t.interval || '',
      mismatch: !!t.mismatch,
    }))
    // Mismatched tiers first (the risk), then by amount.
    .sort((a, b) => Number(b.mismatch) - Number(a.mismatch) || a.amount - b.amount)

  const webhooks: StripeWebhookRow[] = ((s && s.webhooks) || []).map(w => ({
    url: w.url,
    status: w.status || '',
    events: typeof w.events === 'number' ? w.events : 0,
  }))

  const mismatches: string[] = ((s && s.mismatches) || []).map(m => m.envName)

  const all = runFindings(snapshot, { includeManualBaseline: false })
  const findings = (all.findings || []).filter(f => f.provider === 'stripe')

  return {
    generatedAt: new Date().toISOString(),
    configured,
    liveMode: !!(s && s.liveMode),
    tiers,
    webhooks,
    mismatches,
    findings,
    score: scoreFromFindings(findings),
    summary: {
      tiers: tiers.length,
      webhooks: webhooks.length,
      mismatches: mismatches.length,
      liveMode: !!(s && s.liveMode),
    },
  }
}

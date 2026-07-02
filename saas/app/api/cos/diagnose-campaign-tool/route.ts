// saas/app/api/cos/diagnose-campaign-tool/route.ts
// Deterministic diagnostic v2: exercises the campaign-creation pipeline in
// separately TIME-BOXED stages so it can never hang the browser — a stage that
// stalls is reported as 'TIMED OUT' with its name, which IS the answer.
// Owner-only. Stages:
//   ?run=1&stage=build   → queueItemFromRecommendation only (pure compute, no network)
//   ?run=1&stage=render  → startSiteVideo only (the fal.ai kickoff — REAL render, ~$0.42)
//   ?run=1&stage=insert  → build + DB insert, NO render (creates a real campaign row, no video)
//   ?run=1               → full proposeCampaign(), same as the chat tool (REAL campaign + render)
// Every stage races a 45s timeout, so the route always answers within ~50s.

import { NextRequest, NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const STAGE_TIMEOUT_MS = 45_000

function timebox<T>(label: string, p: Promise<T>): Promise<{ label: string; outcome: 'ok' | 'threw' | 'timed_out'; value?: T; error?: string; stackTop?: string[] }> {
  return Promise.race([
    p.then(
      (value) => ({ label, outcome: 'ok' as const, value }),
      (e: any) => ({ label, outcome: 'threw' as const, error: e?.message || 'unknown', stackTop: String(e?.stack || '').split('\n').slice(0, 6) }),
    ),
    new Promise<{ label: string; outcome: 'timed_out' }>((resolve) =>
      setTimeout(() => resolve({ label, outcome: 'timed_out' }), STAGE_TIMEOUT_MS),
    ),
  ]) as any
}

export async function GET(req: NextRequest) {
  const ctx = await getAccess()
  if (!ctx.isOwner) {
    return NextResponse.json({ ok: false, error: 'Owner only. Log in as the owner, then reload.' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  if (searchParams.get('run') !== '1') {
    return NextResponse.json({
      ok: true,
      mode: 'dry',
      explain: 'Add ?run=1 for the full pipeline (same as the chat tool). Or isolate a stage: ?run=1&stage=build (no network), ?run=1&stage=render (fal kickoff only), ?run=1&stage=insert (build + DB insert, no render). Every stage is time-boxed to 45s — a hang reports as timed_out with the stage name.',
    })
  }

  const stage = String(searchParams.get('stage') || 'full')
  const startedAt = Date.now()

  if (stage === 'build') {
    const { queueItemFromRecommendation } = await import('@/lib/cos/campaign-queue')
    const now = new Date().toISOString()
    const rec: any = {
      id: `rec_diag_${Date.now()}`,
      department: 'marketing',
      title: 'DIAGNOSTIC build stage',
      summary: 'Diagnostic.',
      recommended_channel: 'youtube',
      priority: 'high',
      confidence: 90,
      expected_roi: 'medium',
      estimated_cost_usd: 12,
      reason: 'diagnostic',
      signals: [],
      approval_status: 'pending_approval',
      created_at: now,
    }
    const r = await timebox('queueItemFromRecommendation', Promise.resolve().then(() => queueItemFromRecommendation(rec)))
    return NextResponse.json({ stage, tookMs: Date.now() - startedAt, result: { ...r, value: r.outcome === 'ok' ? 'built ok (row not inserted)' : undefined } })
  }

  if (stage === 'render') {
    const { startSiteVideo } = await import('@/lib/operator/video')
    const r = await timebox('startSiteVideo (fal.ai kickoff)', startSiteVideo('Diagnostic test: premium dark navy SaaS dashboard b-roll, gold and cyan accents, smooth camera motion, no text.', '16:9'))
    return NextResponse.json({
      stage, tookMs: Date.now() - startedAt, result: r,
      verdict: r.outcome === 'timed_out'
        ? 'CONFIRMED: the fal.ai render kickoff hangs. This is what freezes campaign creation. Check FAL_KEY validity and fal.ai status.'
        : r.outcome === 'threw'
          ? `The fal kickoff throws: "${r.error}" — this uncaught exception is what kills the chat tool.`
          : 'fal kickoff works. The hang is elsewhere — run stage=insert next.',
    })
  }

  if (stage === 'insert') {
    const run = async () => {
      const { createClient } = await import('@supabase/supabase-js')
      const { queueItemFromRecommendation } = await import('@/lib/cos/campaign-queue')
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY
      if (!url || !key) throw new Error('Supabase service credentials not configured')
      const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
      const now = new Date().toISOString()
      const rec: any = {
        id: `rec_diag_${Date.now()}`,
        department: 'marketing',
        title: 'DIAGNOSTIC insert stage (no video)',
        summary: 'Diagnostic row — safe to reject/archive.',
        recommended_channel: 'youtube',
        priority: 'high',
        confidence: 90,
        expected_roi: 'medium',
        estimated_cost_usd: 12,
        reason: 'diagnostic',
        signals: [],
        approval_status: 'pending_approval',
        created_at: now,
      }
      const item = queueItemFromRecommendation(rec)
      const row: any = {
        recommendation_id: item.recommendation_id, department: item.department, title: item.title,
        objective: item.objective, channel: item.channel, audience: item.audience, languages: item.languages,
        assets: item.assets, work_items: item.work_items, recommendation: item.recommendation,
        status: item.status, risk_level: item.risk_level, approval_required: item.approval_required,
        metadata: { ...(item.metadata || {}), source: 'diagnostic_insert_stage' },
      }
      const { data, error } = await admin.from('cos_campaign_queue').insert(row).select('id').single()
      if (error) throw new Error(`insert failed: ${error.message}`)
      return `inserted campaign ${data.id} — visible on /dashboard/cosa, safe to reject`
    }
    const r = await timebox('build + DB insert', run())
    return NextResponse.json({ stage, tookMs: Date.now() - startedAt, result: r })
  }

  // full — identical to the chat tool's call
  const { proposeCampaign } = await import('@/lib/ai/proposeCampaign')
  const r = await timebox('proposeCampaign (full, same as chat tool)', proposeCampaign({
    goal: 'DIAGNOSTIC TEST: YouTube marketing campaign for SignalBoostAi targeting small business owners, hotels and restaurants.',
    audience: 'Small business owners, hotels, restaurants, entrepreneurs.',
    channel: 'youtube',
    language: 'en',
    callToAction: 'Visit www.saas.signalboostapp.com',
  }))
  return NextResponse.json({
    stage: 'full', tookMs: Date.now() - startedAt, result: r,
    verdict: r.outcome === 'timed_out'
      ? 'The full pipeline hangs (>45s). Run ?run=1&stage=render and ?run=1&stage=insert separately to pinpoint which half.'
      : r.outcome === 'threw'
        ? `Threw: "${r.error}" — stackTop names the file and line.`
        : (r.value as any)?.ok
          ? `SUCCESS — campaign ${(r.value as any).campaignId} created and rendering. Check /dashboard/cosa.`
          : `Clean failure: "${(r.value as any)?.error}" — same failure the chat tool hits.`,
  })
}

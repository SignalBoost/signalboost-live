import { NextRequest, NextResponse } from 'next/server'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { evaluateCosUniversityUndergraduateAcceptance } from '@/lib/ai/cos/cosUniversityUndergraduateAcceptance'
import type { ProductionPathEventRow } from '@/lib/ai/cos/cosUniversityProductionVerificationCore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const DEFAULT_AGENT_ID = 'cos'

/**
 * Read-only undergraduate Production acceptance board.
 * Does not invoke learners, write assurance events, change grades, or enable flags.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const production = process.env.VERCEL_ENV === 'production'
  const deploymentId = String(process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_URL || '').trim()
  const commitSha = String(process.env.VERCEL_GIT_COMMIT_SHA || '').trim()
  const agentId = String(req.nextUrl.searchParams.get('agentId') || DEFAULT_AGENT_ID).trim() || DEFAULT_AGENT_ID
  const now = new Date()

  if (!production || !deploymentId || !commitSha) {
    return NextResponse.json({
      ok: false,
      accepted: false,
      production,
      deploymentId,
      commitSha,
      agentId,
      error: 'exact_production_commit_and_deployment_required',
      semantics: 'undergraduate_exact_production_commit_and_deployment_receipts_required',
    }, { status: 409, headers: { 'cache-control': 'no-store' } })
  }

  const db = cosServiceDb()
  if (!db) {
    return NextResponse.json({
      ok: false,
      accepted: false,
      production,
      deploymentId,
      commitSha,
      agentId,
      error: 'service_database_unavailable',
    }, { status: 503, headers: { 'cache-control': 'no-store' } })
  }

  try {
    const result = await db.from('cos_university_learning_assurance_events')
      .select('event_key,path_id,deployment_id,commit_sha,evidence,verifier,observed_at,expires_at')
      .eq('event_type', 'production_path')
      .eq('commit_sha', commitSha)
      .order('observed_at', { ascending: false })
      .limit(500)
    if (result.error) throw result.error

    const board = evaluateCosUniversityUndergraduateAcceptance({
      production,
      deploymentId,
      commitSha,
      now,
      rows: (result.data || []) as ProductionPathEventRow[],
    })

    return NextResponse.json({
      ok: true,
      agentId,
      ...board,
    }, {
      status: board.accepted ? 200 : 409,
      headers: { 'cache-control': 'no-store' },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('cron COS University undergraduate acceptance failed:', message)
    return NextResponse.json({
      ok: false,
      accepted: false,
      production,
      deploymentId,
      commitSha,
      agentId,
      error: message,
    }, { status: 500, headers: { 'cache-control': 'no-store' } })
  }
}

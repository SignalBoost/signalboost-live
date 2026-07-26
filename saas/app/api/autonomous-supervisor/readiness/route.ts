// saas/app/api/autonomous-supervisor/readiness/route.ts
//
// WHY IS SELF-HEALING EMPTY? — the checklist that answers it in one request.
//
// The Self-Healing Supervisor's three tables have never had a row. That is not a code
// question any more: detection, diagnosis, repair-plan dispatch and PR staging are all built
// and tested. It is a CONFIGURATION question, and until now the only way to answer it was to
// guess. A pipeline nobody can verify the wiring of will stay empty forever, and an empty
// portable cannot be sold as live.
//
// This route reports, for an owner only:
//   • whether each piece of configuration the pipeline depends on is PRESENT — never its
//     value, never a prefix, never a masked fragment. A boolean and nothing else.
//   • whether each of the three supervisor tables is READABLE, and how many rows it holds.
//   • a single verdict with the blocking items named, in the order they have to be fixed.
//
// It reads. It never triggers an incident, never stages a PR, never redeploys. Nothing here
// changes state, so it is safe to call as often as you like while wiring things up.

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth/permission-middleware'
import { createSupabasePortableActivityStore } from '@/lib/portable-products/live-activity-supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Presence only. The value is never read into the response. */
const present = (name: string): boolean => Boolean(process.env[name] && String(process.env[name]).trim())

const SUPERVISOR_TABLES: readonly { table: string; timestampColumn: string; meaning: string }[] = Object.freeze([
  { table: 'supervisor_dispatch_ledger', timestampColumn: 'claimed_at', meaning: 'repair dispatches claimed' },
  { table: 'supervisor_executions', timestampColumn: 'created_at', meaning: 'supervisor executions recorded' },
  { table: 'vercel_deployment_health_runs', timestampColumn: 'created_at', meaning: 'deployment health observations' },
])

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req)
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if ((user as any).role !== 'owner') {
    return NextResponse.json({ ok: false, error: 'Forbidden — supervisor readiness is owner-only' }, { status: 403 })
  }

  // 1. Can an incident even REACH us? Without the shared secret every webhook is rejected
  //    with a 401 before anything is diagnosed — the single most likely reason for silence.
  const ingestion = {
    webhookSecret: present('COS_SUPERVISOR_WEBHOOK_SECRET'),
    vercelToken: present('VERCEL_TOKEN'),
    vercelProjectId: present('VERCEL_PROJECT_ID'),
  }

  // 2. Can it DIAGNOSE? The thinker needs one model provider.
  const diagnosis = {
    anyModelProvider:
      present('ANTHROPIC_API_KEY') || present('OPENAI_API_KEY') || present('GEMINI_API_KEY') || present('GOOGLE_AI_STUDIO_API_KEY'),
  }

  // 3. Can it STAGE a repair for approval, and RECOVER once approved?
  const actuation = {
    supabaseServiceRole: present('SUPABASE_SERVICE_ROLE_KEY'),
    redeployHook: present('VERCEL_DEPLOY_HOOK_URL') || (present('VERCEL_TOKEN') && present('VERCEL_PROJECT_ID')),
  }

  // 4. Has anything ever actually happened?
  const store = createSupabasePortableActivityStore()
  const tables: Array<{ table: string; meaning: string; readable: boolean; rowCount: number | null; lastActivityAt: string | null; error?: string }> = []
  for (const source of SUPERVISOR_TABLES) {
    if (!store) {
      tables.push({ ...source, readable: false, rowCount: null, lastActivityAt: null, error: 'no datastore configured' })
      continue
    }
    try {
      const result = await store.readTableActivity(source.table, source.timestampColumn)
      tables.push({ ...source, readable: true, rowCount: result.rowCount, lastActivityAt: result.lastActivityAt })
    } catch (error) {
      tables.push({
        ...source,
        readable: false,
        rowCount: null,
        lastActivityAt: null,
        error: error instanceof Error ? error.message.slice(0, 200) : 'read failed',
      })
    }
  }

  // Ordered so the first blocker listed is the first one worth fixing.
  const blockers: string[] = []
  if (!ingestion.webhookSecret) {
    blockers.push('COS_SUPERVISOR_WEBHOOK_SECRET is not set, so every incoming webhook is rejected before diagnosis. Nothing can ever arrive.')
  }
  if (!ingestion.vercelToken || !ingestion.vercelProjectId) {
    blockers.push('VERCEL_TOKEN and VERCEL_PROJECT_ID are needed to identify the last healthy deployment when an incident arrives.')
  }
  if (!diagnosis.anyModelProvider) {
    blockers.push('No model provider key is set, so an incident can arrive but cannot be diagnosed into a repair plan.')
  }
  if (!actuation.supabaseServiceRole) {
    blockers.push('SUPABASE_SERVICE_ROLE_KEY is not set, so a diagnosed repair cannot be staged as an Infrastructure PR.')
  }
  if (!actuation.redeployHook) {
    blockers.push('Neither VERCEL_DEPLOY_HOOK_URL nor VERCEL_TOKEN + VERCEL_PROJECT_ID is set, so an approved retry has nothing to call.')
  }
  const unreadable = tables.filter((t) => !t.readable).map((t) => t.table)
  if (unreadable.length > 0) {
    blockers.push(`These supervisor tables could not be read, so nothing can be recorded: ${unreadable.join(', ')}.`)
  }

  const totalRows = tables.reduce((sum, t) => sum + (t.rowCount ?? 0), 0)
  const configured = blockers.length === 0

  const verdict = !configured
    ? 'NOT READY — the pipeline cannot complete a run until the blockers below are cleared.'
    : totalRows === 0
      ? 'CONFIGURED, NEVER EXERCISED — everything the pipeline needs is present, but no incident has ever run through it. Trigger a failing PREVIEW deployment: production is untouched by a failed build, and the run will be real.'
      : `EXERCISED — ${totalRows} recorded row${totalRows === 1 ? '' : 's'} across the supervisor tables.`

  return NextResponse.json({
    ok: true,
    verdict,
    configured,
    exercised: totalRows > 0,
    totalRows,
    blockers,
    checks: { ingestion, diagnosis, actuation },
    tables,
  })
}

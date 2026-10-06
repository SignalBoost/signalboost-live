// saas/app/api/cron/cos-university-step1-evidence/route.ts
//
// Step 1 evidence report. Owner, 2026-10-06: the platform produces an evidence package showing the Step 1 acceptance
// criteria and whether each has evidence; the owner makes the declaration.
//
// GET ?window=24h|7d|30d|all  (default all)
//
// Read only by construction: the Artifact Effectiveness Funnel is computed through `readOnlyDb`, which refuses every
// write and RPC. Authorized with CRON_SECRET so the GitHub Actions watchdog can print the report into its log. It
// starts no work, wakes no station and spends nothing.
import { NextRequest, NextResponse } from 'next/server'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { describeFunnel, readEffectivenessFunnel } from '@/lib/ai/cos/cosUniversityEffectivenessFunnel'
import { assessStep1Evidence, describeStep1Evidence } from '@/lib/ai/cos/cosUniversityStep1Evidence'
import { readOnlyDb } from '@/lib/ai/cos/cosUniversityReadOnlyDb'
import { describeComputerSciencePath, readComputerSciencePath } from '@/lib/ai/cos/cosUniversityComputerSciencePath'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' }

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  return Boolean(secret && req.headers.get('authorization') === `Bearer ${secret}`)
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401, headers: NO_STORE })
  const service = cosServiceDb()
  if (!service) return NextResponse.json({ ok: false, error: 'service_database_unavailable' }, { status: 503, headers: NO_STORE })
  try {
    const now = new Date()
    const funnel = await readEffectivenessFunnel({
      db: readOnlyDb(service),
      window: req.nextUrl.searchParams.get('window') || 'all',
      now,
    })
    const report = assessStep1Evidence(funnel, now)
    // Where the Computer Science path stands right now (window-independent). Its own failure never hides the report.
    let computerSciencePath: Awaited<ReturnType<typeof readComputerSciencePath>> | null = null
    let computerSciencePathSummary: string
    try {
      // Bounded so a slow read can never cost the whole report its 60-second function budget.
      computerSciencePath = await Promise.race([
        readComputerSciencePath({ db: readOnlyDb(service), now }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('computer_science_path_timeout_15s')), 15_000).unref?.()),
      ])
      computerSciencePathSummary = describeComputerSciencePath(computerSciencePath)
    } catch (error) {
      const message = error instanceof Error ? error.message : JSON.stringify(error)
      computerSciencePathSummary = `COMPUTER SCIENCE PATH unavailable: ${String(message).slice(0, 200)}`
    }
    return NextResponse.json({
      ok: true,
      summary: describeStep1Evidence(report),
      funnelSummary: describeFunnel(funnel),
      computerSciencePathSummary,
      report,
      funnel,
      computerSciencePath,
    }, { headers: NO_STORE })
  } catch (error) {
    const message = error instanceof Error ? error.message : JSON.stringify(error)
    return NextResponse.json({ ok: false, error: String(message).slice(0, 400), readOnly: true }, { status: 500, headers: NO_STORE })
  }
}
// end of saas/app/api/cron/cos-university-step1-evidence/route.ts (if this line is missing, the paste was cut short)

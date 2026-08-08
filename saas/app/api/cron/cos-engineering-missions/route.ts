import { NextRequest, NextResponse } from 'next/server'
import {
  listActiveOwnerEngineeringMissions,
  processOwnerEngineeringMissionTick,
} from '@/lib/ai/cos/engineeringMission'
import { ensureCosMissionStore } from '@/lib/ai/cos/autonomy/missionStoreBootstrap'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  return Boolean(secret && req.headers.get('authorization') === `Bearer ${secret}`)
}

async function run(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  // The worker owns its infrastructure dependency. If mission persistence disappeared or
  // a deployment landed before its migration, repair it before looking for active work.
  const store = await ensureCosMissionStore()
  if (!store.ok) {
    return NextResponse.json({
      ok: false,
      error: store.error || 'COS mission store unavailable after self-recovery attempt.',
      recoveryAttempted: true,
    }, { status: 503 })
  }

  const startedAt = Date.now()
  const missions = await listActiveOwnerEngineeringMissions(4)
  const results: any[] = []

  for (const mission of missions) {
    if (Date.now() - startedAt > 260_000) break
    try {
      const remaining = Math.max(20_000, 260_000 - (Date.now() - startedAt))
      const updated = await processOwnerEngineeringMissionTick({
        mission,
        maxActions: 5,
        budgetMs: Math.min(220_000, remaining),
      })
      results.push({
        ok: true,
        missionId: updated.id,
        status: updated.status,
        iteration: updated.state.iteration,
        branch: updated.state.branch,
        lastCommit: updated.state.lastCommit || null,
        blockedReason: updated.state.blockedReason || null,
      })
    } catch (error) {
      results.push({
        ok: false,
        missionId: mission.id,
        error: error instanceof Error ? error.message : 'cos_engineering_mission_tick_failed',
      })
    }
  }

  return NextResponse.json({
    ok: results.every(item => item.ok),
    at: new Date().toISOString(),
    missionStoreRepaired: store.repaired,
    activeFound: missions.length,
    processed: results.length,
    results,
  })
}

export async function GET(req: NextRequest) { return run(req) }
export async function POST(req: NextRequest) { return run(req) }

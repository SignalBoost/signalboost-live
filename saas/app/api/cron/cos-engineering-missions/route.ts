import { NextRequest, NextResponse } from 'next/server'
import {
  listActiveOwnerEngineeringMissions,
  processOwnerEngineeringMissionTick,
} from '@/lib/ai/cos/engineeringMission'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  return Boolean(secret && req.headers.get('authorization') === `Bearer ${secret}`)
}

async function run(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

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
    activeFound: missions.length,
    processed: results.length,
    results,
  })
}

export async function GET(req: NextRequest) { return run(req) }
export async function POST(req: NextRequest) { return run(req) }

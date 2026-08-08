import { NextRequest, NextResponse } from 'next/server'
import { loadCosLiveMissionBindings, runCosLiveTick } from '@/lib/ai/cos/autonomy/liveRuntime.ts'
import { createSupabaseCosLiveTickStateStore } from '@/lib/ai/cos/autonomy/supabaseLiveState.ts'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  return Boolean(secret && req.headers.get('authorization') === `Bearer ${secret}`)
}

function modelPreference(): 'claude' | 'openai' | 'local' | undefined {
  const value = process.env.COS_AUTONOMY_MODEL?.trim().toLowerCase()
  return value === 'claude' || value === 'openai' || value === 'local' ? value : undefined
}

async function run(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  const bindings = loadCosLiveMissionBindings()
  if (!bindings.length) {
    return NextResponse.json({ ok: true, configured: false, summary: 'No COS_AUTONOMY_MISSIONS configured.', results: [] })
  }

  const store = createSupabaseCosLiveTickStateStore()
  const results = []
  for (const binding of bindings) {
    try {
      const result = await runCosLiveTick({
        binding,
        stateStore: store,
        modelPreference: modelPreference(),
        killSwitch: () => process.env.COS_AUTONOMY_KILL_SWITCH === '1' || process.env.COS_AUTONOMY_KILL_SWITCH === 'true',
      })
      results.push({ ok: true, missionId: binding.mission.missionId, portableId: binding.portable.portableId, result })
    } catch (error) {
      results.push({
        ok: false,
        missionId: binding.mission.missionId,
        portableId: binding.portable.portableId,
        error: error instanceof Error ? error.message : 'cos_autonomy_tick_failed',
      })
    }
  }

  return NextResponse.json({
    ok: results.every(item => item.ok),
    configured: true,
    at: new Date().toISOString(),
    missions: bindings.length,
    results,
  })
}

export async function GET(req: NextRequest) { return run(req) }
export async function POST(req: NextRequest) { return run(req) }

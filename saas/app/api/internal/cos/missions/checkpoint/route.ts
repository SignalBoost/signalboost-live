import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseCosLiveTickStateStore } from '@/lib/ai/cos/autonomy/supabaseLiveState.ts'
import { setMissionCheckpoint } from '@/lib/ai/cos/autonomy/missionLifecycle.ts'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function authorized(req: NextRequest): boolean {
  const supplied = req.headers.get('authorization')
  const secrets = [process.env.COS_PORTABLE_BRIDGE_SECRET, process.env.CRON_SECRET].filter(Boolean)
  return secrets.some(secret => supplied === `Bearer ${secret}`)
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const missionId = String(body?.missionId || '').trim()
  const checkpoint = String(body?.checkpoint || '').trim()
  const satisfied = body?.satisfied !== false
  const summary = typeof body?.summary === 'string' ? body.summary.trim().slice(0, 2000) : undefined

  if (!missionId || !checkpoint) {
    return NextResponse.json({ ok: false, error: 'missionId and checkpoint are required' }, { status: 400 })
  }

  const store = createSupabaseCosLiveTickStateStore()
  const state = await store.load(missionId)
  if (!state?.lifecycle) {
    return NextResponse.json({ ok: false, error: 'Mission not found or lifecycle not initialized' }, { status: 404 })
  }

  const lifecycle = setMissionCheckpoint(state.lifecycle, checkpoint, satisfied, summary)
  await store.save(missionId, { ...state, lifecycle })

  return NextResponse.json({
    ok: true,
    missionId,
    checkpoint,
    satisfied,
    status: lifecycle.status,
    completed: lifecycle.status === 'COMPLETED',
    shouldContinue: lifecycle.status !== 'COMPLETED' && lifecycle.status !== 'WAITING_FOR_APPROVAL',
    lifecycle,
  })
}

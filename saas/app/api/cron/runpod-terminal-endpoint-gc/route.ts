import { NextRequest, NextResponse } from 'next/server'
import { garbageCollectTerminalMassDistilledEndpoints } from '@/lib/ai/cos/runpodMassDistilledEndpointGc'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { recordCosLaneStatus } from '@/lib/ai/cos/cosLaneStatus'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const LANE = 'runpod-terminal-endpoint-gc'

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const result = await garbageCollectTerminalMassDistilledEndpoints()
    await recordCosLaneStatus({ db: cosServiceDb(), lane: LANE, outcome: result.deleted > 0 ? 'worked' : 'skipped', reason: result.deleted > 0 ? 'terminal_endpoints_deleted' : 'no_safe_terminal_endpoints', detail: result })
    return NextResponse.json({ ok: true, ...result }, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await recordCosLaneStatus({ db: cosServiceDb(), lane: LANE, outcome: 'failed', reason: 'endpoint_gc_failed', detail: { error: message.slice(0, 300) } }).catch(() => undefined)
    return NextResponse.json({ ok: false, error: message }, { status: 503, headers: { 'Cache-Control': 'no-store, max-age=0' } })
  }
}

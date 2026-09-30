// saas/app/api/cron/runpod-terminal-endpoint-gc/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { garbageCollectTerminalMassDistilledEndpoints } from '@/lib/ai/cos/runpodMassDistilledEndpointGc'
import { releaseOrphanedPinnedWorkers } from '@/lib/ai/cos/runpodPinnedWorkerSweeper'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { recordCosLaneStatus } from '@/lib/ai/cos/cosLaneStatus'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const LANE = 'runpod-terminal-endpoint-gc'
const SWEEP_LANE = 'runpod-pinned-worker-sweep'

/**
 * Every 5 minutes, first release always-on workers left behind by killed exam/canary runs (each one bills
 * $0.59-$0.94/hour around the clock until released), then delete terminal endpoints. The sweep runs on its own:
 * if it fails, garbage collection still runs, and the reverse. Released orphans reach min=0/max=0, which is also
 * what lets the GC below delete a failed student's endpoint.
 */
async function sweepPinnedWorkers() {
  try {
    const sweep = await releaseOrphanedPinnedWorkers()
    await recordCosLaneStatus({
      db: cosServiceDb(),
      lane: SWEEP_LANE,
      outcome: sweep.failed > 0 ? 'failed' : sweep.released > 0 ? 'worked' : 'skipped',
      reason: sweep.failed > 0 ? 'pinned_worker_release_failed' : sweep.released > 0 ? 'orphaned_always_on_workers_released' : 'no_orphaned_always_on_workers',
      detail: sweep,
    })
    return sweep
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 300)
    await recordCosLaneStatus({ db: cosServiceDb(), lane: SWEEP_LANE, outcome: 'failed', reason: 'pinned_worker_sweep_failed', detail: { error: message } }).catch(() => undefined)
    return { error: message }
  }
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  const pinnedWorkerSweep = await sweepPinnedWorkers()
  try {
    const result = await garbageCollectTerminalMassDistilledEndpoints()
    if (result.failed > 0) {
      await recordCosLaneStatus({ db: cosServiceDb(), lane: LANE, outcome: 'failed', reason: 'endpoint_deletions_failed', detail: result })
      return NextResponse.json({ ok: false, ...result, pinnedWorkerSweep, error: 'endpoint_deletions_failed' }, { status: 503, headers: { 'Cache-Control': 'no-store, max-age=0' } })
    }
    await recordCosLaneStatus({ db: cosServiceDb(), lane: LANE, outcome: result.deleted > 0 || result.alreadyGone > 0 ? 'worked' : 'skipped', reason: result.deleted > 0 ? 'terminal_endpoints_deleted' : result.alreadyGone > 0 ? 'terminal_endpoints_reconciled' : 'no_safe_terminal_endpoints', detail: result })
    return NextResponse.json({ ok: true, ...result, pinnedWorkerSweep }, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await recordCosLaneStatus({ db: cosServiceDb(), lane: LANE, outcome: 'failed', reason: 'endpoint_gc_failed', detail: { error: message.slice(0, 300) } }).catch(() => undefined)
    return NextResponse.json({ ok: false, error: message, pinnedWorkerSweep }, { status: 503, headers: { 'Cache-Control': 'no-store, max-age=0' } })
  }
}

// saas/app/api/cron/cos-university-line-observation/route.ts
//
// The assembly line, observed without being driven. Owner, 2026-10-06.
//
// The controller route (`cos-university-lifecycle-orchestrator`) runs a tick on every call: it writes the ledger,
// leases units and wakes stations. The outside prover must not drive the line it measures, so it reads this route.
// Read only by construction: the database handle is wrapped by `readOnlyDb`, which refuses every write and RPC.
// Authorized with CRON_SECRET so the GitHub Actions watchdog can read it; it starts no work and spends nothing.
import { NextRequest, NextResponse } from 'next/server'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { readLinePauseSetting } from '@/lib/ai/cos/cosUniversitySettings'
import { LIVE_STATUSES, lineConstraint } from '@/lib/ai/cos/cosUniversityAssemblyLine'
import { LINE_OBSERVATION_SCHEMA_VERSION, describeLineObservation, observeLine } from '@/lib/ai/cos/cosUniversityLineObservation'
import { readOnlyDb } from '@/lib/ai/cos/cosUniversityReadOnlyDb'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Same window as the controller, so the two describe the same units.
const MAX_ARTIFACTS = 500
const LEDGER_READ_CHUNK = 50
const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' }

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  return Boolean(secret && req.headers.get('authorization') === `Bearer ${secret}`)
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401, headers: NO_STORE })
  const service = cosServiceDb()
  if (!service) return NextResponse.json({ ok: false, error: 'service_database_unavailable' }, { status: 503, headers: NO_STORE })
  const db = readOnlyDb(service)
  const now = new Date()
  try {
    const pause = await readLinePauseSetting(db as any)
    if (pause.paused) {
      return NextResponse.json({
        ok: true, schemaVersion: LINE_OBSERVATION_SCHEMA_VERSION, at: now.toISOString(), paused: true, units: [],
        summary: describeLineObservation({ at: now.toISOString(), paused: true }),
        readOnly: true, authorityExpanded: false,
      }, { headers: NO_STORE })
    }

    const source = await db.from('cos_local_distillation_artifacts')
      .select('candidate_id,trained_artifact_hash,status,updated_at')
      .in('status', [...LIVE_STATUSES])
      .order('updated_at', { ascending: true })
      .limit(MAX_ARTIFACTS)
    if (source.error) throw source.error
    const artifacts = source.data || []

    const ids = artifacts.map((row: any) => String(row.candidate_id || '')).filter(Boolean)
    const ledger: any[] = []
    for (let offset = 0; offset < ids.length; offset += LEDGER_READ_CHUNK) {
      const read = await db.from('cos_university_lifecycle_orchestration')
        .select('candidate_id,station,stage_entered_at,last_transition_at,lease_until,terminal')
        .in('candidate_id', ids.slice(offset, offset + LEDGER_READ_CHUNK))
      if (read.error) throw read.error
      ledger.push(...(read.data || []))
    }

    const observation = observeLine({ artifacts, ledger, now })
    return NextResponse.json({
      ok: true,
      schemaVersion: LINE_OBSERVATION_SCHEMA_VERSION,
      at: now.toISOString(),
      paused: false,
      windowComplete: artifacts.length < MAX_ARTIFACTS,
      line: observation.line,
      constraint: lineConstraint(),
      lineStops: observation.lineStops,
      ledgerDisagreements: observation.ledgerDisagreements,
      ledgerMissing: observation.ledgerMissing,
      units: observation.units,
      unitsReported: observation.units.length,
      summary: describeLineObservation({ at: now.toISOString(), paused: false, windowComplete: artifacts.length < MAX_ARTIFACTS, observation }),
      readOnly: true,
      authorityExpanded: false,
    }, { headers: NO_STORE })
  } catch (error) {
    const message = error instanceof Error ? error.message : JSON.stringify(error)
    return NextResponse.json({ ok: false, error: String(message).slice(0, 400), readOnly: true }, { status: 500, headers: NO_STORE })
  }
}
// end of saas/app/api/cron/cos-university-line-observation/route.ts (if this line is missing, the paste was cut short)

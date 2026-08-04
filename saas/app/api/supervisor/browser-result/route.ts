// saas/app/api/supervisor/browser-result/route.ts
//
// RECEIVES WHAT THE EXECUTION HOST DID.
//
// The GitHub Actions runner posts its browser-host-result-v1 document here when a run
// finishes. This is the only endpoint in the supervisor that is called by something
// outside a browser session, so it is the only one that cannot use requireAdmin — and
// that makes its authentication the most important thing in the file.
//
// THREE CHECKS, ALL REQUIRED, AND NONE OF THEM REDUNDANT:
//
//   1. A SHARED SECRET, compared in constant time. Without it this is an open endpoint
//      that writes into an incident record.
//   2. THE FINGERPRINT MUST MATCH A DISPATCH THIS SYSTEM SENT. The secret proves the
//      caller is the host; the fingerprint proves the result belongs to a package we
//      actually chose to run. A leaked secret alone should not let anyone write arbitrary
//      execution history.
//   3. THE ROW MUST NOT ALREADY HAVE A RESULT. A host that retries after a timeout would
//      otherwise overwrite the record of what happened the first time, which is the one
//      case where the truth is most contested.
//
// It records. It does not act: nothing here re-runs, escalates or repairs. A result that
// says the run failed is a fact for the incident, and deciding what to do about it belongs
// to the orchestrator and the person reading the ledger, not to the endpoint that received
// a POST from a CI runner.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { timingSafeEqual } from 'node:crypto'

export const runtime = 'nodejs'

const LEDGER = 'supervisor_dispatch_ledger'

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

/** Length-safe and timing-safe. A plain === leaks the shared secret one character at a time. */
function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export async function POST(req: NextRequest) {
  const expected = process.env.BROWSER_HOST_CALLBACK_SECRET || ''
  if (!expected) {
    // Refusing outright is the safe default: an unset secret must not mean "accept
    // anything", which is how an unconfigured endpoint becomes an open one.
    return NextResponse.json({ ok: false, error: 'BROWSER_HOST_CALLBACK_SECRET is not configured, so results cannot be accepted.' }, { status: 503 })
  }

  const provided = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!provided || !secretMatches(provided, expected)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 })
  }

  let result: any = {}
  try { result = await req.json() } catch { result = {} }

  const fingerprint = String(result?.packageFingerprint || '')
  const dispatchId = String(result?.dispatchId || '')
  if (!fingerprint || !dispatchId) {
    return NextResponse.json({ ok: false, error: 'Result must carry packageFingerprint and dispatchId.' }, { status: 400 })
  }
  if (result?.schemaVersion !== 'browser-host-result-v1') {
    return NextResponse.json({ ok: false, error: `Unsupported result schema "${result?.schemaVersion}".` }, { status: 400 })
  }

  const db = admin()
  if (!db) return NextResponse.json({ ok: false, error: 'Supabase service credentials are not configured.' }, { status: 500 })

  const { data: row, error: readError } = await db.from(LEDGER)
    .select('dispatch_id,package_fingerprint,status,result_received_at')
    .eq('dispatch_id', dispatchId)
    .maybeSingle()

  if (readError) return NextResponse.json({ ok: false, error: readError.message }, { status: 500 })
  if (!row) return NextResponse.json({ ok: false, error: 'No dispatch with that id was sent from this system.' }, { status: 404 })
  if (row.package_fingerprint !== fingerprint) {
    return NextResponse.json({ ok: false, error: 'The result fingerprint does not match the package that was dispatched.' }, { status: 409 })
  }
  if (row.result_received_at) {
    return NextResponse.json({ ok: false, error: `A result was already recorded for this dispatch at ${row.result_received_at}.` }, { status: 409 })
  }

  // The host's own status maps onto the ledger's vocabulary. 'paused' and 'blocked' become
  // 'completed' rather than 'failed' BECAUSE THEY ARE NOT FAILURES: the run reached a
  // checkpoint or an origin boundary and stopped on purpose, which is the system working.
  // The exact host status stays in the stored document for anyone who needs the distinction.
  const hostStatus = String(result?.status || '')
  const ledgerStatus = hostStatus === 'failed' ? 'failed' : 'completed'
  const now = new Date().toISOString()

  const { error: writeError } = await db.from(LEDGER).update({
    status: ledgerStatus,
    result,
    result_received_at: now,
    completed_at: now,
    updated_at: now,
  }).eq('dispatch_id', dispatchId).is('result_received_at', null)

  if (writeError) return NextResponse.json({ ok: false, error: writeError.message }, { status: 500 })

  return NextResponse.json({ ok: true, dispatchId, recordedStatus: ledgerStatus, hostStatus })
}

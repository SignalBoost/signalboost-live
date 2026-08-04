// saas/app/api/supervisor/browser-dispatch/route.ts
//
// SENDS A BROWSER PACKAGE TO THE EXECUTION HOST.
//
// The workflow and the runner have been on main since earlier today; what was missing was
// the step between them and this system — a package had to be copied out of a dispatch
// and pasted into a GitHub Actions form by hand. This closes that gap: the package goes
// to the host over repository_dispatch, and the ledger records that it went.
//
// WHAT THIS ROUTE REFUSES, and why each refusal is here rather than trusted to the host:
//
//   · A package without a fingerprint. The runner recomputes and rejects one anyway, but
//     a package that cannot be verified should never leave this building — a rejection at
//     the host costs a GitHub Actions run and a confusing red X.
//   · A package the ledger does not know. Every dispatch is recorded BEFORE it is sent, so
//     a result arriving later can be matched to something this system chose to do. An
//     unrecorded dispatch is indistinguishable from someone else's.
//   · A second send of a fingerprint already dispatched. Two workflow runs driving the
//     same browser task at the same target is exactly the kind of duplicate action the
//     whole execution model exists to prevent.
//
// It does NOT decide whether the task is safe — the package was already built under the
// approval and origin rules. This route is transport with a memory.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin, auditAdminAction } from '@/lib/outreach/security'

export const runtime = 'nodejs'

const GITHUB_API = 'https://api.github.com'
const REPO = 'SignalBoost/signalboost-live'
const EVENT_TYPE = 'browser-agent-package'
const LEDGER = 'supervisor_dispatch_ledger'

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  let body: any = {}
  try { body = await req.json() } catch { body = {} }
  const pkg = body?.package

  if (!pkg || typeof pkg !== 'object') {
    return NextResponse.json({ ok: false, error: 'Send { "package": { … } } — the browser runtime package produced by a browser dispatch.' }, { status: 400 })
  }
  for (const field of ['packageId', 'dispatchId', 'incidentId', 'packageFingerprint', 'targetOrigin', 'browserTask'] as const) {
    if (!pkg[field]) return NextResponse.json({ ok: false, error: `Package is missing ${field}, so it cannot be dispatched or matched to a result later.` }, { status: 400 })
  }

  const token = process.env.GITHUB_WRITE_TOKEN
  if (!token) {
    return NextResponse.json({ ok: false, error: 'GITHUB_WRITE_TOKEN is not configured, so there is no host to dispatch to.' }, { status: 400 })
  }

  const db = admin()
  if (!db) return NextResponse.json({ ok: false, error: 'Supabase service credentials are not configured.' }, { status: 500 })

  // Already sent? Checked before writing anything, so a retry after a network failure does
  // not silently start a second browser run against the same target.
  const { data: existing } = await db.from(LEDGER)
    .select('dispatch_id,status,host,result_received_at')
    .eq('package_fingerprint', pkg.packageFingerprint)
    .maybeSingle()

  if (existing && !body?.force) {
    return NextResponse.json({
      ok: false,
      alreadyDispatched: true,
      dispatchId: existing.dispatch_id,
      status: existing.status,
      resultReceivedAt: existing.result_received_at,
      error: `This exact package was already dispatched (${existing.dispatch_id}, status ${existing.status}). Send { "force": true } only if you are certain the first run never started.`,
    }, { status: 409 })
  }

  // RECORDED BEFORE SENT. If the GitHub call succeeds and the write fails, a result comes
  // back for a dispatch nobody remembers making; the reverse merely leaves a claimed row
  // with no run behind it, which is visible and harmless.
  const claimedAt = new Date().toISOString()
  const { error: ledgerError } = await db.from(LEDGER).upsert({
    dispatch_id: String(pkg.dispatchId),
    incident_id: String(pkg.incidentId),
    executor_kind: 'browser',
    status: 'claimed',
    claimed_at: claimedAt,
    schema_version: String(pkg.schemaVersion || 'browser-runtime-dry-run-v1'),
    package_fingerprint: String(pkg.packageFingerprint),
    host: 'github-actions',
    updated_at: claimedAt,
  }, { onConflict: 'dispatch_id' })

  if (ledgerError) {
    return NextResponse.json({ ok: false, error: `Could not record the dispatch, so it was not sent: ${ledgerError.message}` }, { status: 500 })
  }

  try {
    const response = await fetch(`${GITHUB_API}/repos/${REPO}/dispatches`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      body: JSON.stringify({ event_type: EVENT_TYPE, client_payload: { package: pkg } }),
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      // The row is marked rejected rather than deleted: an attempt that failed is part of
      // the incident's history, and a ledger that forgets its failures is a ledger that
      // makes the same mistake look novel every time.
      await db.from(LEDGER).update({ status: 'rejected', updated_at: new Date().toISOString() }).eq('dispatch_id', String(pkg.dispatchId))
      const hint = response.status === 403 || response.status === 404
        ? ' GITHUB_WRITE_TOKEN needs Contents: read and write on this repository for repository_dispatch to be accepted.'
        : ''
      return NextResponse.json({ ok: false, error: `GitHub refused the dispatch with HTTP ${response.status}: ${detail.slice(0, 200)}.${hint}` }, { status: 502 })
    }
  } catch (error: any) {
    await db.from(LEDGER).update({ status: 'rejected', updated_at: new Date().toISOString() }).eq('dispatch_id', String(pkg.dispatchId))
    return NextResponse.json({ ok: false, error: `Dispatch failed: ${String(error?.message || error)}` }, { status: 502 })
  }

  await auditAdminAction({
    admin: ctx.admin,
    actorId: ctx.user.id,
    action: 'supervisor.browser_dispatched',
    targetType: 'supervisor_dispatch_ledger',
    targetId: String(pkg.dispatchId),
    metadata: { incidentId: String(pkg.incidentId), fingerprint: String(pkg.packageFingerprint), targetOrigin: String(pkg.targetOrigin) },
  })

  return NextResponse.json({
    ok: true,
    dispatchId: String(pkg.dispatchId),
    fingerprint: String(pkg.packageFingerprint),
    host: 'github-actions',
    // GitHub's dispatch API returns 204 with no run id, so there is nothing to link to
    // yet. Saying so is better than inventing a URL that may point at the wrong run.
    note: 'Dispatched. GitHub does not return a run id for repository_dispatch, so watch the Actions tab; the result will arrive on this ledger row when the run finishes.',
  })
}

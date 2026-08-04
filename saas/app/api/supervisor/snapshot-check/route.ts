// saas/app/api/supervisor/snapshot-check/route.ts
//
// Proves the checkpoint mechanism works against the real Vercel account, without touching
// anything. GET only, capture only — no restore path exists in this file at all, so there
// is no request shape that could roll back a deployment by accident.
//
// It answers the question a buyer asks in a demo and the question you need answered
// before you claim it: is there a known-good build to fall back to right now, and would a
// deployment repair be transactionally bounded or not?

import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import { vercelSnapshotAdapterFromEnv, vercelSnapshotRestoreStatus } from '@/lib/supervisor/adapters/vercel-snapshot-host'

export const runtime = 'nodejs'

export async function GET() {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  const adapter = vercelSnapshotAdapterFromEnv()
  if (!adapter) {
    return NextResponse.json({
      ok: false,
      configured: false,
      // Named precisely, because "not configured" sends someone hunting through settings.
      error: 'VERCEL_TOKEN and VERCEL_PROJECT_ID are not both set, so no checkpoint mechanism is available. Until they are, a deployment repair is correctly classified UNBOUNDED and will not run unattended.',
    }, { status: 200 })
  }

  try {
    const capabilities = await adapter.capabilities()
    const captured = await adapter.capture({ scope: 'deployment', provider: 'vercel', environment: 'production', reason: 'snapshot-check' })

    return NextResponse.json({
      ok: captured.ok,
      configured: true,
      // The honest headline: with rollback disabled this reads false, which is what makes
      // a deployment plan UNBOUNDED rather than merely unprotected.
      atomicRestore: capabilities[0]?.atomicRestore ?? false,
      rollbackEnabled: capabilities[0]?.atomicRestore ?? false,
      knownGoodDeployment: captured.snapshot?.snapshotId ?? null,
      capturedAt: captured.snapshot?.capturedAt ?? null,
      error: captured.error ?? null,
      restoreStatus: vercelSnapshotRestoreStatus(),
      note: capabilities[0]?.atomicRestore
        ? 'A deployment repair would be BOUNDED: a checkpoint is taken before any change and a failed verification restores it in one operation.'
        : 'Production rollback is disabled, so a deployment repair is classified UNBOUNDED and will not run unattended. Capture still works, and the known-good deployment id above is what an operator would roll back to by hand.',
    }, { status: 200 })
  } catch (error: any) {
    return NextResponse.json({ ok: false, configured: true, error: String(error?.message || error) }, { status: 500 })
  }
}

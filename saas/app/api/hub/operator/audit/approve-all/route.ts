// One owner approval for every fix in one immutable audit run. The database RPC
// atomically changes only that run from complete to approved and writes the
// approval event, so retries and concurrent clicks cannot approve it twice.

import { NextRequest, NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'
import { getAdminSupabase } from '@/utils/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const REQUIRED_MIGRATIONS = [
  '20260719_audit_run_global_approval.sql',
  '20260719_audit_remediation_findings_approval.sql',
  '20260719_repair_audit_approval_schema_drift.sql',
] as const

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function isApprovalSchemaDrift(message: string): boolean {
  const normalized = message.toLowerCase()
  return (
    normalized.includes('column "approved" of relation "audit_runs" does not exist') ||
    normalized.includes('approve_audit_run_remediation') ||
    normalized.includes('audit_remediation_approvals') ||
    normalized.includes('column "fixed"') ||
    normalized.includes('schema cache')
  )
}

export async function POST(req: NextRequest) {
  const ctx = await getAccess()
  if (!ctx.isOwner || !ctx.userId) return NextResponse.json({ ok: false, error: 'Owner access required.' }, { status: 403 })

  let body: { runId?: unknown } = {}
  try { body = await req.json() } catch { /* validated below */ }
  if (!isUuid(body.runId)) return NextResponse.json({ ok: false, error: 'A valid audit run id is required.' }, { status: 400 })

  const approval = await getAdminSupabase().rpc('approve_audit_run_remediation', {
    p_run_id: body.runId,
    p_approved_by: ctx.userId,
  })

  if (approval.error) {
    const message = String(approval.error.message || '')
    if (isApprovalSchemaDrift(message)) {
      return NextResponse.json({
        ok: false,
        code: 'audit_approval_schema_not_ready',
        error: 'Audit approval is temporarily unavailable because the Supabase approval schema is not current. Apply the required audit approval migrations, then retry.',
        requiredMigrations: REQUIRED_MIGRATIONS,
        retryable: true,
      }, { status: 503 })
    }
    return NextResponse.json({ ok: false, code: 'audit_approval_failed', error: 'Could not approve this audit run.' }, { status: 500 })
  }

  const event = Array.isArray(approval.data) ? approval.data[0] : approval.data
  if (!event?.approved) {
    const status = event?.reason === 'already_approved' ? 409 : 422
    return NextResponse.json({ ok: false, code: event?.reason || 'approval_refused', error: event?.message || 'This audit run cannot be approved.' }, { status })
  }

  // `findingsFixed` is intentionally the exact persisted run count. The batch is
  // scoped by p_run_id in the RPC; no historical or subsequently-created finding
  // can be included. The approval record preserves the thin-entry-point rollback
  // marker so Supervisor can restore the prior entry point if corruption is found.
  return NextResponse.json({
    ok: true,
    runId: event.run_id,
    approvedBy: event.approved_by,
    findingsFixed: event.findings_fixed,
    status: 'approved',
    timestamp: event.timestamp,
    rollback: { entryPoint: 'thin', available: true },
  })
}

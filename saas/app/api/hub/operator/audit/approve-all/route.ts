// One owner approval for every fix in one immutable audit run. The database RPC
// atomically changes only that run from complete to approved and writes the
// approval event, so retries and concurrent clicks cannot approve it twice.

import { NextRequest, NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'
import { AUDIT_APPROVAL_SCHEMA_REPAIR_SQL } from '@/lib/audit/approvalSchemaRepair'
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
  const missingObject = normalized.includes('does not exist') || normalized.includes('could not find') || normalized.includes('schema cache')
  return (
    normalized.includes('column "approved" of relation "audit_runs" does not exist') ||
    (normalized.includes('approve_audit_run_remediation') && missingObject) ||
    (normalized.includes('audit_remediation_approvals') && missingObject) ||
    (normalized.includes('column "fixed"') && missingObject)
  )
}

function embeddedRpcError(data: unknown): string | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const value = (data as { error?: unknown }).error
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export async function POST(req: NextRequest) {
  const ctx = await getAccess()
  if (!ctx.isOwner || !ctx.userId) return NextResponse.json({ ok: false, error: 'Owner access required.' }, { status: 403 })

  let body: { runId?: unknown } = {}
  try { body = await req.json() } catch { /* validated below */ }
  if (!isUuid(body.runId)) return NextResponse.json({ ok: false, error: 'A valid audit run id is required.' }, { status: 400 })

  const admin = getAdminSupabase()
  let schemaRepairAttempted = false
  let schemaRepaired = false
  let approval = await admin.rpc('approve_audit_run_remediation', {
    p_run_id: body.runId,
    p_approved_by: ctx.userId,
  })

  // Production may briefly be ahead of a partially-applied Supabase migration.
  // The owner has already given the final run-level approval by clicking this
  // action. For only the known approval-schema drift, execute the repository's
  // fixed, idempotent SQL through the existing service-role-only SQL RPC, then
  // retry the same atomic approval once. Request content can never supply SQL.
  if (approval.error && isApprovalSchemaDrift(String(approval.error.message || ''))) {
    schemaRepairAttempted = true
    const repair = await admin.rpc('hub_exec_sql', { query: AUDIT_APPROVAL_SCHEMA_REPAIR_SQL })
    const repairFailed = Boolean(repair.error) || Boolean(embeddedRpcError(repair.data))

    if (!repairFailed) {
      schemaRepaired = true
      await admin.from('audit_logs').insert({
        run_id: body.runId,
        user_id: ctx.userId,
        payload: {
          event: 'audit_approval_schema_repaired',
          runId: body.runId,
          approvedBy: ctx.userId,
          migration: '20260719_repair_audit_approval_schema_drift.sql',
          status: 'repaired',
          timestamp: new Date().toISOString(),
        },
      })
      approval = await admin.rpc('approve_audit_run_remediation', {
        p_run_id: body.runId,
        p_approved_by: ctx.userId,
      })
    }
  }

  if (approval.error) {
    const message = String(approval.error.message || '')
    if (isApprovalSchemaDrift(message)) {
      return NextResponse.json({
        ok: false,
        code: 'audit_approval_schema_not_ready',
        error: 'Audit approval is temporarily unavailable because the Supabase approval schema is not current. Apply the required audit approval migrations, then retry.',
        requiredMigrations: REQUIRED_MIGRATIONS,
        repairAttempted: schemaRepairAttempted,
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
    schemaRepaired,
    rollback: { entryPoint: 'thin', available: true },
  })
}

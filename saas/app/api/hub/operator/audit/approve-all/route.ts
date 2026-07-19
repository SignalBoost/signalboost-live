// One owner approval authorizes every safe fix in one immutable audit run.
// Approval is persisted atomically, then deterministic remediation creates one
// ai/* branch and one PR. Retries are idempotent for already-approved runs.

import { NextRequest, NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'
import { AUDIT_APPROVAL_SCHEMA_REPAIR_STATEMENTS } from '@/lib/audit/approvalSchemaRepair'
import { runApprovedAuditRemediation } from '@/lib/audit/approvedRunRemediation'
import { getAdminSupabase } from '@/utils/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

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
    normalized.includes('column reference "run_id" is ambiguous') ||
    normalized.includes('column reference run_id is ambiguous') ||
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

function remediationError(remediation: Awaited<ReturnType<typeof runApprovedAuditRemediation>>): string {
  const first = remediation.skipped.find(item => item.reason)?.reason
  return first || 'The approved run could not create a remediation pull request.'
}

export async function POST(req: NextRequest) {
  const ctx = await getAccess()
  if (!ctx.isOwner || !ctx.userId) {
    return NextResponse.json({ ok: false, error: 'Owner access required.' }, { status: 403 })
  }

  let body: { runId?: unknown } = {}
  try { body = await req.json() } catch { /* validated below */ }
  if (!isUuid(body.runId)) {
    return NextResponse.json({ ok: false, error: 'A valid audit run id is required.' }, { status: 400 })
  }

  const admin = getAdminSupabase()
  let schemaRepairAttempted = false
  let schemaRepaired = false
  let schemaRepairFailedStep: number | null = null
  let approval = await admin.rpc('approve_audit_run_remediation', {
    p_run_id: body.runId,
    p_approved_by: ctx.userId,
  })

  if (approval.error && isApprovalSchemaDrift(String(approval.error.message || ''))) {
    schemaRepairAttempted = true
    for (const [index, query] of AUDIT_APPROVAL_SCHEMA_REPAIR_STATEMENTS.entries()) {
      const repair = await admin.rpc('hub_exec_sql', { query })
      if (repair.error || embeddedRpcError(repair.data)) {
        schemaRepairFailedStep = index + 1
        break
      }
    }

    if (schemaRepairFailedStep === null) {
      schemaRepaired = true
      await admin.from('audit_logs').insert({
        run_id: body.runId,
        user_id: ctx.userId,
        payload: {
          event: 'audit_approval_schema_repaired',
          runId: body.runId,
          approvedBy: ctx.userId,
          migration: '20260719_repair_audit_approval_schema_drift.sql',
          statementsApplied: AUDIT_APPROVAL_SCHEMA_REPAIR_STATEMENTS.length,
          status: 'repaired',
          timestamp: new Date().toISOString(),
        },
      })
      await new Promise(resolve => setTimeout(resolve, 250))
      approval = await admin.rpc('approve_audit_run_remediation', {
        p_run_id: body.runId,
        p_approved_by: ctx.userId,
      })
    }
  }

  if (approval.error) {
    const message = String(approval.error.message || '')
    if (isApprovalSchemaDrift(message)) {
      const repairDetail = schemaRepairFailedStep !== null
        ? ` Automatic repair stopped at step ${schemaRepairFailedStep} of ${AUDIT_APPROVAL_SCHEMA_REPAIR_STATEMENTS.length}.`
        : schemaRepaired
          ? ' Automatic repair completed, but Supabase has not exposed the repaired approval function yet. Retry once.'
          : ''
      return NextResponse.json({
        ok: false,
        code: 'audit_approval_schema_not_ready',
        error: `Audit approval is temporarily unavailable because the Supabase approval schema is not current.${repairDetail}`,
        requiredMigrations: REQUIRED_MIGRATIONS,
        repairAttempted: schemaRepairAttempted,
        repairCompleted: schemaRepaired,
        repairFailedStep: schemaRepairFailedStep,
        retryable: true,
      }, { status: 503 })
    }
    return NextResponse.json({ ok: false, code: 'audit_approval_failed', error: 'Could not approve this audit run.' }, { status: 500 })
  }

  const event = Array.isArray(approval.data) ? approval.data[0] : approval.data
  const alreadyApproved = event?.reason === 'already_approved'
  if (!event?.approved && !alreadyApproved) {
    const status = event?.reason === 'run_not_complete' ? 422 : 409
    return NextResponse.json({ ok: false, code: event?.reason || 'approval_refused', error: event?.message || 'This audit run cannot be approved.' }, { status })
  }

  const remediation = await runApprovedAuditRemediation({
    admin,
    runId: body.runId,
    actorUserId: ctx.userId,
  })
  if (!remediation.ok) {
    return NextResponse.json({
      ok: false,
      approved: true,
      code: 'audit_remediation_failed',
      error: `The run is approved, but the code fixes could not be prepared. ${remediationError(remediation)}`,
      retryable: true,
      remediation,
      schemaRepaired,
    }, { status: 502 })
  }

  const findingsFixed = remediation.findingsApplied + remediation.findingsAlreadyResolved
  return NextResponse.json({
    ok: true,
    runId: body.runId,
    approvedBy: event?.approved_by || ctx.userId,
    findingsFixed,
    findingsApproved: Number(event?.findings_fixed || remediation.findingsTotal || 0),
    status: 'approved',
    timestamp: event?.timestamp || remediation.approvedAt,
    alreadyApproved,
    schemaRepaired,
    remediation,
    rollback: { entryPoint: 'thin', available: true },
  })
}

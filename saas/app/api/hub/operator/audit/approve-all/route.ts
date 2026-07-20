// One owner approval authorizes every safe fix in one immutable audit run.
// Approval records consent only. The remediation controller creates one governed
// PR, waits for protected checks, merges it, and only then marks findings fixed.

import { NextRequest, NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'
import { AUDIT_APPROVAL_SCHEMA_REPAIR_STATEMENTS } from '@/lib/audit/approvalSchemaRepair'
import {
  installAuditRemediationLifecycle,
  isAuditLifecycleFunctionMissing,
} from '@/lib/audit/remediationLifecycleRepair'
import { runApprovedAuditRemediationWithRetry } from '@/lib/audit/approvedRunRemediationRetry'
import { getAdminSupabase } from '@/utils/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const REQUIRED_MIGRATIONS = [
  '20260719_audit_run_global_approval.sql',
  '20260719_audit_remediation_findings_approval.sql',
  '20260719_repair_audit_approval_schema_drift.sql',
  '20260720_audit_remediation_lifecycle_v2.sql',
] as const

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function isApprovalSchemaDrift(message: string): boolean {
  const normalized = String(message || '').toLowerCase()
  const missingObject = normalized.includes('does not exist') || normalized.includes('could not find') || normalized.includes('schema cache')
  return (
    isAuditLifecycleFunctionMissing(normalized) ||
    normalized.includes('column "approved" of relation "audit_runs" does not exist') ||
    normalized.includes('column reference "run_id" is ambiguous') ||
    normalized.includes('column reference run_id is ambiguous') ||
    (normalized.includes('audit_remediation_approvals') && missingObject) ||
    (normalized.includes('column "fixed"') && missingObject)
  )
}

function embeddedRpcError(data: unknown): string | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const value = (data as { error?: unknown }).error
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

async function installBaseApprovalSchema(admin: any): Promise<{ ok: boolean; failedStep: number | null; error: string }> {
  for (const [index, query] of AUDIT_APPROVAL_SCHEMA_REPAIR_STATEMENTS.entries()) {
    const result = await admin.rpc('hub_exec_sql', { query })
    const error = result.error?.message || embeddedRpcError(result.data)
    if (error) return { ok: false, failedStep: index + 1, error: String(error) }
  }
  await new Promise(resolve => setTimeout(resolve, 250))
  return { ok: true, failedStep: null, error: '' }
}

function remediationError(remediation: Awaited<ReturnType<typeof runApprovedAuditRemediationWithRetry>>): string {
  const first = remediation.skipped.find(item => item.reason)?.reason
  return first || remediation.autoMergeError || 'The approved run could not complete its governed remediation workflow.'
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
  let repairAttempted = false
  let repairCompleted = false
  let repairFailedStep: number | null = null

  let approval = await admin.rpc('approve_audit_run_remediation_v2', {
    p_run_id: body.runId,
    p_approved_by: ctx.userId,
  })

  if (approval.error && isApprovalSchemaDrift(String(approval.error.message || ''))) {
    repairAttempted = true
    const baseRepair = await installBaseApprovalSchema(admin)
    if (!baseRepair.ok) {
      repairFailedStep = baseRepair.failedStep
    } else {
      const lifecycleRepair = await installAuditRemediationLifecycle(admin)
      if (!lifecycleRepair.ok) repairFailedStep = AUDIT_APPROVAL_SCHEMA_REPAIR_STATEMENTS.length + (lifecycleRepair.failedStep || 0)
      else repairCompleted = true
    }

    if (repairFailedStep === null) {
      approval = await admin.rpc('approve_audit_run_remediation_v2', {
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
        error: repairFailedStep === null
          ? 'Audit approval lifecycle is not ready yet. Retry once after the schema cache reloads.'
          : `Audit approval lifecycle repair stopped at step ${repairFailedStep}.`,
        requiredMigrations: REQUIRED_MIGRATIONS,
        repairAttempted,
        repairCompleted,
        repairFailedStep,
        retryable: true,
      }, { status: 503 })
    }
    return NextResponse.json({ ok: false, code: 'audit_approval_failed', error: 'Could not approve this audit run.' }, { status: 500 })
  }

  const event = Array.isArray(approval.data) ? approval.data[0] : approval.data
  const alreadyApproved = event?.reason === 'already_approved'
  if (!event?.approved && !alreadyApproved) {
    const status = event?.reason === 'run_not_complete' ? 422 : 409
    return NextResponse.json({
      ok: false,
      code: event?.reason || 'approval_refused',
      error: event?.message || 'This audit run cannot be approved.',
    }, { status })
  }

  const remediation = await runApprovedAuditRemediationWithRetry({
    admin,
    runId: body.runId,
    actorUserId: ctx.userId,
  })
  if (!remediation.ok) {
    return NextResponse.json({
      ok: false,
      approved: true,
      code: 'audit_remediation_failed',
      error: `Approval was recorded, but the automated remediation system did not complete. ${remediationError(remediation)}`,
      retryable: true,
      remediation,
      repairCompleted,
    }, { status: 502 })
  }

  const findingsApproved = Number(event?.findings_approved || remediation.findingsTotal || 0)
  const findingsFixed = remediation.merged ? remediation.findingsApplied : 0

  return NextResponse.json({
    ok: true,
    runId: body.runId,
    approved: true,
    approvedBy: event?.approved_by || ctx.userId,
    findingsApproved,
    findingsFixed,
    status: remediation.lifecycleStatus,
    timestamp: event?.timestamp || remediation.approvedAt,
    alreadyApproved,
    repairCompleted,
    remediation,
    rollback: { entryPoint: 'thin', available: true },
  })
}

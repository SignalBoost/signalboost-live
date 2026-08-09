// One owner approval authorizes every safe fix in one immutable audit run.
// Approval records consent immediately. The governed remediation controller then
// continues after the HTTP response so large approved runs do not time out the UI.

import { after, NextRequest, NextResponse } from 'next/server'
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
// Governed remediation can process many files/model calls. Vercel Fluid Compute
// may keep the post-response work alive up to this function duration.
export const maxDuration = 800

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

  const runId = body.runId
  const actorUserId = ctx.userId
  const admin = getAdminSupabase()
  let repairAttempted = false
  let repairCompleted = false
  let repairFailedStep: number | null = null

  let approval = await admin.rpc('approve_audit_run_remediation_v2', {
    p_run_id: runId,
    p_approved_by: actorUserId,
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
        p_run_id: runId,
        p_approved_by: actorUserId,
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

  // Do not hold the browser request open while a large approved run makes many
  // model/GitHub calls. `after` is tied to this deployment invocation and keeps
  // the governed workflow running after the approval response is sent.
  after(async () => {
    try {
      await runApprovedAuditRemediationWithRetry({ admin, runId, actorUserId })
    } catch (error) {
      await admin.from('audit_logs').insert({
        run_id: runId,
        user_id: actorUserId,
        payload: {
          kind: 'audit_batch_remediation',
          approval: 'final',
          ok: false,
          status: 'failed',
          lifecycleStatus: 'failed',
          autoMergeError: error instanceof Error ? error.message : 'Governed remediation worker failed.',
          approvedAt: new Date().toISOString(),
        },
      })
    }
  })

  return NextResponse.json({
    ok: true,
    runId,
    approved: true,
    approvedBy: event?.approved_by || actorUserId,
    findingsApproved: Number(event?.findings_approved || 0),
    findingsFixed: 0,
    status: 'preparing',
    timestamp: event?.timestamp || new Date().toISOString(),
    alreadyApproved,
    repairCompleted,
    remediation: {
      kind: 'audit_batch_remediation',
      approval: 'final',
      ok: true,
      runId,
      status: 'preparing',
      lifecycleStatus: 'preparing',
      activityCheckedAt: new Date().toISOString(),
    },
    rollback: { entryPoint: 'thin', available: true },
  }, { status: 202 })
}

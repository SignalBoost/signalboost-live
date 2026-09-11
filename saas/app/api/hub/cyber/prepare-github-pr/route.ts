// Routine, isolated dependency proposals. A proposal is not a verified repair.
// No merge, deployment, arbitrary repository, or Guardian mutation authority.
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/access'
import { getAdminSupabase } from '@/utils/supabase/server'
import { readRepoFileFrom } from '@/lib/audit/repoTarget'
import { commitFileToBranch, ensureBranch } from '@/lib/ai/tools/repoWriter'
import { DEPENDENCY_REPOSITORY, DEPENDENCY_PREPARATION_POLICY, sameOriginCyberMutation,
  trustedDependencyChanges, updateVerifiedPackageJson } from '@/lib/cyber/dependencyRemediationPolicy'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

function authorizedCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  return !!secret && req.headers.get('authorization') === `Bearer ${secret}`
}

async function runPreparation(req: Request, remediationId?: string) {
  const cron = authorizedCron(req)
  let userId: string | null = null
  if (!cron) {
    const guard = await requireAdmin()
    if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })
    if (!sameOriginCyberMutation(req)) return NextResponse.json({ ok: false, error: 'cross_origin_mutation_denied' }, { status: 403 })
    const ctx = guard.ctx as any
    userId = ctx?.userId ?? ctx?.user?.id ?? ctx?.id ?? null
    if (!userId) return NextResponse.json({ ok: false, error: 'Authenticated user identity is required.' }, { status: 403 })
  }
  const admin = getAdminSupabase()
  let query = admin.from('remediation_requests')
    .select('id,user_id,source_area,source_type,source_id,repo,status,fix_plan_status,implementation_status,human_approval_required,human_approved,fix_plan_approved')
    .eq('source_area', 'cybersecurity').eq('source_type', 'dependency_scan')
    .in('status', ['in_progress', 'approved', 'awaiting_human_review'])
    .eq('implementation_status', 'awaiting_github_pr_preparation')
    // Filter before limit(1), so a gated legacy row cannot consume the worker slot.
    .or('human_approval_required.eq.false,and(status.eq.approved,human_approved.eq.true,fix_plan_approved.eq.true,fix_plan_status.eq.approved_for_pr)')
  if (remediationId) query = query.eq('id', remediationId)
  if (!cron) query = query.eq('user_id', userId!)
  const loaded = await query.order('updated_at', { ascending: true }).limit(1).maybeSingle()
  if (loaded.error) return NextResponse.json({ ok: false, error: 'Could not load preparation work.' }, { status: 500 })
  const row = loaded.data
  if (!row) return NextResponse.json({ ok: false, error: 'No queued dependency preparation was found.' }, { status: 409 })

  const approvalFree = row.human_approval_required === false
  const explicitlyApproved = row.status === 'approved' && row.human_approved === true
    && row.fix_plan_approved === true && row.fix_plan_status === 'approved_for_pr'
  if (!approvalFree && !explicitlyApproved) {
    return NextResponse.json({ ok: false, error: 'Existing approval is still required.', approvalRequired: true }, { status: 409 })
  }

  // Compare-and-set claim: concurrent invocations cannot both mutate the branch.
  let claimQuery = admin.from('remediation_requests').update({
    status: 'in_progress', implementation_status: 'github_pr_preparing', updated_at: new Date().toISOString(),
  }).eq('id', row.id).eq('status', row.status).eq('implementation_status', 'awaiting_github_pr_preparation')
    .eq('user_id', row.user_id).eq('source_id', row.source_id)
    .eq('source_area', 'cybersecurity').eq('source_type', 'dependency_scan').eq('repo', row.repo)
  // Recheck the exact authorization lane atomically with the claim. A policy
  // change or revoked vote after selection must not authorize repository work.
  claimQuery = approvalFree
    ? claimQuery.eq('human_approval_required', false)
    : claimQuery.eq('human_approved', true).eq('fix_plan_approved', true).eq('fix_plan_status', 'approved_for_pr')
  const claim = await claimQuery.select('id').maybeSingle()
  if (claim.error) return NextResponse.json({ ok: false, error: 'Could not claim preparation work.' }, { status: 500 })
  if (!claim.data) return NextResponse.json({ ok: false, error: 'Preparation state changed; no duplicate work was started.' }, { status: 409 })

  async function finish(status: string, notes: string, prUrl?: string) {
    const update = await admin.from('remediation_requests').update({
      implementation_status: status, implementation_notes: notes,
      // Completion/failure is an execution result, never an approval-policy edit.
      ...(prUrl ? { pull_request_url: prUrl } : {}),
      updated_at: new Date().toISOString(),
    }).eq('id', row.id).eq('status', 'in_progress').eq('implementation_status', 'github_pr_preparing').select('id').maybeSingle()
    return !update.error && !!update.data
  }
  async function blocked(reason: string, status = 'verification_blocked') {
    const saved = await finish(status, `${reason}. No verified repair, merge or deployment is claimed.`)
    return NextResponse.json({ ok: false, remediationId: row.id, error: saved ? reason : 'Could not persist preparation outcome.', approvalRequired: false }, { status: saved ? 409 : 500 })
  }

  try {
    const scan = await admin.from('cyber_dependency_scans').select('id,user_id,report')
      .eq('id', row.source_id).eq('user_id', row.user_id).maybeSingle()
    if (scan.error) return blocked('owned_scan_evidence_unavailable')
    const verdict = trustedDependencyChanges(row, scan.data)
    if (verdict.ok === false) return blocked(verdict.reason)

    const grouped = new Map<string, typeof verdict.changes>()
    for (const change of verdict.changes) grouped.set(change.sourceFile, [...(grouped.get(change.sourceFile) || []), change])
    const branch = `cyber-${row.id}`
    const preparedBranch = await ensureBranch(branch)
    if (!preparedBranch.ok) return blocked('isolated_branch_unavailable', 'github_pr_preparation_failed')
    // Read the actual proposal branch, not a moving main snapshot. Validate every
    // manifest before the first file write; never overwrite unrelated main changes.
    const staged: Array<{ path: string; content: string }> = []
    for (const [path, changes] of grouped) {
      const current = await readRepoFileFrom(DEPENDENCY_REPOSITORY, preparedBranch.branch, path)
      if (!current.ok || !current.content) return blocked('repository_manifest_unavailable')
      staged.push({ path, content: updateVerifiedPackageJson(current.content, changes) })
    }

    const touched: string[] = []
    let prUrl = ''
    let prNumber = 0
    for (const file of staged) {
      const result = await commitFileToBranch({ branch, path: file.path, content: file.content,
        message: `Cyber dependency proposal (${DEPENDENCY_PREPARATION_POLICY}): ${row.id}` })
      if (!result.ok || !result.prUrl)
        return blocked('branch_proposal_incomplete_check_branch_evidence', 'github_pr_preparation_failed')
      touched.push(file.path)
      prUrl = result.prUrl
      prNumber = result.prNumber || 0
    }
    const saved = await finish('github_pr_prepared',
      `Prepared ${touched.length} manifest proposal(s) on ai/${branch}. Lockfile regeneration, tests and required CI remain outstanding; no merge or deployment was performed.`, prUrl)
    if (!saved) return NextResponse.json({ ok: false, error: 'Proposal exists but its outcome could not be persisted.', prUrl }, { status: 500 })
    return NextResponse.json({ ok: true, remediationId: row.id, branch: `ai/${branch}`, prUrl, prNumber, touched, approvalRequired: false, verifiedRepair: false })
  } catch {
    return blocked('preparation_failed_check_current_evidence', 'github_pr_preparation_failed')
  }
}

export async function GET(req: Request) {
  if (!authorizedCron(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  return runPreparation(req)
}

export async function POST(req: Request) {
  let body: { remediationId?: string } = {}
  try { body = await req.json() } catch { /* authenticated worker selects the next queued item */ }
  return runPreparation(req, body.remediationId)
}

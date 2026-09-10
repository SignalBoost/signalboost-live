// Continuous owned-platform Audit -> governed remediation.
//
// Customer/external repository audits remain report-only until their owner authorizes
// changes. The canonical iTMounts repository is different: the platform owner has
// preauthorized routine Self-Healing, so each new deployed revision is audited and
// safe findings enter the existing governed repair / test / merge / verification path.

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabase } from '@/utils/supabase/server'
import { isOwnerEmail } from '@/lib/auth/ownerEmails'
import { runAudit } from '@/lib/audit/runner'
import { runApprovedAuditRemediationWithRetry } from '@/lib/audit/approvedRunRemediationRetry'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 800

const OWNED_REPOSITORY = 'SignalBoost/signalboost-live'
const OWNED_REPOSITORY_URL = `https://github.com/${OWNED_REPOSITORY}`
const MAX_FILES = 12
const SELF_HEALING_KIND = 'self_healing_owned_audit'

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  return Boolean(secret && req.headers.get('authorization') === `Bearer ${secret}`)
}

function record(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}
}

async function resolveOwnerUserId(admin: any): Promise<string> {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 })
    if (error) throw new Error(`audit_self_healing_owner_lookup_failed:${error.message}`)
    const users = Array.isArray(data?.users) ? data.users : []
    for (const user of users) {
      if (typeof user?.id === 'string' && isOwnerEmail(typeof user?.email === 'string' ? user.email : null)) return user.id
    }
    if (users.length < 100) break
  }
  throw new Error('audit_self_healing_owner_identity_unavailable')
}

async function latestRevisionRun(admin: any, commitSha: string) {
  const logs = await admin
    .from('audit_logs')
    .select('run_id,created_at,payload')
    .eq('payload->>kind', SELF_HEALING_KIND)
    .order('created_at', { ascending: false })
    .limit(20)
  if (logs.error) throw new Error(`audit_self_healing_log_read_failed:${logs.error.message}`)

  const matching = (logs.data || []).find((row: any) => String(record(row.payload).commitSha || '').toLowerCase() === commitSha)
  if (!matching?.run_id) return null
  const run = await admin.from('audit_runs').select('*').eq('id', matching.run_id).maybeSingle()
  if (run.error) throw new Error(`audit_self_healing_run_read_failed:${run.error.message}`)
  return run.data || null
}

async function recordPolicyEvidence(admin: any, runId: string, ownerUserId: string, commitSha: string, state: string, detail = '') {
  await admin.from('audit_logs').insert({
    run_id: runId,
    user_id: ownerUserId,
    payload: {
      kind: 'self_healing_audit_policy',
      policy: 'owned_platform_continuous_self_healing',
      repository: OWNED_REPOSITORY,
      commitSha,
      state,
      detail,
      recordedAt: new Date().toISOString(),
    },
  })
}

async function approveAndRemediate(admin: any, runId: string, ownerUserId: string, commitSha: string) {
  const approval = await admin.rpc('approve_audit_run_remediation_v2', {
    p_run_id: runId,
    p_approved_by: ownerUserId,
  })
  if (approval.error) {
    await recordPolicyEvidence(admin, runId, ownerUserId, commitSha, 'approval_failed', approval.error.message)
    throw new Error(`audit_self_healing_preauthorization_failed:${approval.error.message}`)
  }
  await recordPolicyEvidence(admin, runId, ownerUserId, commitSha, 'preauthorized')
  return runApprovedAuditRemediationWithRetry({ admin, runId, actorUserId: ownerUserId })
}

async function createAuditRun(admin: any, ownerUserId: string, commitSha: string) {
  const started = await admin.from('audit_runs').insert({
    status: 'running',
    prefix: OWNED_REPOSITORY_URL,
    created_by: ownerUserId,
  }).select('id').single()
  if (started.error || !started.data?.id) throw new Error(`audit_self_healing_run_open_failed:${started.error?.message || 'insert_failed'}`)
  const runId = String(started.data.id)

  const result = await runAudit({ url: OWNED_REPOSITORY_URL, maxFiles: MAX_FILES, lang: 'en' })
  if (!result.ok) {
    await admin.from('audit_runs').update({
      status: 'failed', error: result.error || 'runner error', files_scanned: 0, findings_count: 0,
    }).eq('id', runId)
    await admin.from('audit_logs').insert({
      run_id: runId,
      user_id: ownerUserId,
      payload: { kind: SELF_HEALING_KIND, commitSha, repository: OWNED_REPOSITORY, ok: false, error: result.error || 'Audit runner failed.' },
    })
    return { runId, result }
  }

  if (result.findings.length) {
    const inserted = await admin.from('audit_findings').insert(result.findings.map(finding => ({
      run_id: runId,
      file: finding.file,
      severity: finding.severity,
      category: finding.category,
      title: finding.title,
      detail: finding.detail,
      recommendation: finding.recommendation,
      line: finding.line ?? null,
    })))
    if (inserted.error) {
      await admin.from('audit_runs').update({ status: 'failed', error: `findings insert: ${inserted.error.message}` }).eq('id', runId)
      throw new Error(`audit_self_healing_findings_store_failed:${inserted.error.message}`)
    }
  }

  await admin.from('audit_runs').update({
    status: 'complete',
    files_scanned: result.filesScanned.length,
    findings_count: result.findings.length,
  }).eq('id', runId)

  await admin.from('audit_logs').insert({
    run_id: runId,
    user_id: ownerUserId,
    payload: {
      kind: SELF_HEALING_KIND,
      commitSha,
      repository: OWNED_REPOSITORY,
      runId,
      prefix: OWNED_REPOSITORY_URL,
      filesScanned: result.filesScanned,
      findingsCount: result.findings.length,
      findings: result.findings,
      narrative: result.narrative || '',
      lang: 'en',
      generatedAt: new Date().toISOString(),
    },
  })
  return { runId, result }
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if (process.env.AUDIT_SELF_HEALING_ENABLED === 'false') {
    return NextResponse.json({ ok: true, enabled: false, action: 'disabled' })
  }

  const admin = getAdminSupabase()
  const ownerUserId = await resolveOwnerUserId(admin)
  const commitSha = String(process.env.VERCEL_GIT_COMMIT_SHA || 'unknown').trim().toLowerCase() || 'unknown'

  try {
    const existing = await latestRevisionRun(admin, commitSha)
    if (existing?.id) {
      const status = String(existing.status || '')
      const findings = Number(existing.findings_count || 0)
      if ((status === 'complete' && findings === 0) || status === 'remediated') {
        return NextResponse.json({ ok: true, enabled: true, action: 'already_verified', commitSha, runId: existing.id, findings })
      }
      if (status === 'approved' || (status === 'complete' && findings > 0)) {
        const remediation = await approveAndRemediate(admin, String(existing.id), ownerUserId, commitSha)
        return NextResponse.json({ ok: remediation.ok, enabled: true, action: 'remediation_recovered', commitSha, runId: existing.id, findings, remediation }, { status: remediation.ok ? 200 : 502 })
      }
      if (status === 'running') {
        return NextResponse.json({ ok: true, enabled: true, action: 'already_running', commitSha, runId: existing.id })
      }
      // Failed revisions intentionally fall through to a fresh bounded retry.
    }

    const { runId, result } = await createAuditRun(admin, ownerUserId, commitSha)
    if (!result.ok) return NextResponse.json({ ok: false, enabled: true, action: 'audit_failed', commitSha, runId, error: result.error }, { status: 502 })
    if (!result.findings.length) {
      return NextResponse.json({ ok: true, enabled: true, action: 'verified_clean', commitSha, runId, filesScanned: result.filesScanned.length, findings: 0 })
    }

    const remediation = await approveAndRemediate(admin, runId, ownerUserId, commitSha)
    return NextResponse.json({
      ok: remediation.ok,
      enabled: true,
      action: 'self_healing_started',
      commitSha,
      runId,
      filesScanned: result.filesScanned.length,
      findings: result.findings.length,
      remediation,
    }, { status: remediation.ok ? 200 : 502 })
  } catch (error) {
    return NextResponse.json({
      ok: false,
      enabled: true,
      action: 'self_healing_error',
      commitSha,
      error: error instanceof Error ? error.message : 'owned-platform audit self-healing failed',
    }, { status: 503 })
  }
}

export async function POST(req: NextRequest) {
  return GET(req)
}

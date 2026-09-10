// saas/app/api/hub/audit/activity/route.ts
// Owner-gated evidence and activity timeline. This is the human-visible proof
// surface for autonomous work: audit events, audit runs/remediation, and owned-site
// Self-Healing Builder jobs are normalized into one newest-first timeline.

import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/access'
import { createClient } from '@supabase/supabase-js'
import { buildActivityReport, type ActivityRawRow } from '@/lib/audit/activityReport'
import { PUBLIC_BRAND } from '@/lib/public-brand'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const LIMIT = 200

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } }) as any
}

function record(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function taskStatus(value: unknown): string {
  const status = text(value).toLowerCase()
  if (status === 'succeeded' || status === 'fixed' || status === 'merged' || status === 'complete' || status === 'completed') return 'success'
  if (status === 'failed' || status === 'checks_failed' || status === 'verification_failed') return 'failure'
  if (status === 'queued' || status === 'running' || status === 'verifying') return status
  if (status === 'paused' || status === 'testing' || status === 'checks_pending' || status === 'auto_merge_queued' || status === 'repairing') return 'testing'
  return status || 'error'
}

function selfHealingRows(rows: any[]): ActivityRawRow[] {
  return (rows || []).map(row => {
    const metadata = record(row.metadata)
    const result = record(row.result)
    const source = text(metadata.selfHealingSource) || 'owned-platform'
    const pr = Number(result.pull_request_number)
    const merge = text(result.merge_commit_sha)
    const error = text(row.error || result.error)
    const evidence = [
      `job ${String(row.id || '').slice(0, 8)}`,
      Number.isInteger(pr) && pr > 0 ? `PR #${pr}` : '',
      merge ? `merge ${merge.slice(0, 12)}` : '',
      error ? `error ${error.slice(0, 160)}` : '',
    ].filter(Boolean).join(' · ')
    return {
      id: `self-healing:${row.id}`,
      created_at: row.updated_at || row.finished_at || row.started_at || row.created_at || '',
      actor: 'Self-Healing Supervisor',
      action: `Owned-site ${source}`,
      status: taskStatus(row.status),
      target: PUBLIC_BRAND.siteUrl,
      message: evidence || 'Owned-platform Self-Healing task recorded.',
    }
  })
}

function auditRunRows(rows: any[]): ActivityRawRow[] {
  return (rows || []).map(row => ({
    id: `audit-run:${row.id}`,
    created_at: row.updated_at || row.created_at || '',
    actor: text(row.created_by) ? 'Audit / Self-Healing' : 'Audit',
    action: 'Repository audit',
    status: taskStatus(row.status),
    target: text(row.prefix),
    message: `${Number(row.files_scanned || 0)} files scanned · ${Number(row.findings_count || 0)} findings${text(row.error) ? ` · ${text(row.error).slice(0, 180)}` : ''}`,
  }))
}

function remediationRows(rows: any[]): ActivityRawRow[] {
  return (rows || []).flatMap(row => {
    const payload = record(row.payload)
    if (payload.kind !== 'audit_batch_remediation') return []
    const pr = Number(payload.prNumber || payload.pullRequestNumber)
    const merge = text(payload.mergeCommitSha || payload.merge_commit_sha)
    const lifecycle = text(payload.lifecycleStatus || payload.status)
    const message = [
      `run ${String(row.run_id || '').slice(0, 8)}`,
      Number.isInteger(pr) && pr > 0 ? `PR #${pr}` : '',
      merge ? `merge ${merge.slice(0, 12)}` : '',
      Number(payload.findingsApplied) >= 0 ? `${Number(payload.findingsApplied || 0)}/${Number(payload.findingsTotal || 0)} findings applied` : '',
      text(payload.autoMergeError).slice(0, 160),
    ].filter(Boolean).join(' · ')
    return [{
      id: `audit-remediation:${row.id}`,
      created_at: row.created_at || '',
      actor: 'Self-Healing Supervisor',
      action: 'Audit remediation',
      status: taskStatus(lifecycle),
      target: 'SignalBoost/signalboost-live',
      message: message || 'Governed audit remediation evidence recorded.',
    }]
  })
}

export async function GET() {
  const guard = await requireAdmin()
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })
  try {
    const client = db()
    if (!client) return NextResponse.json({ ok: true, report: buildActivityReport([]) })

    const [hub, builder, auditRuns, auditLogs] = await Promise.all([
      client.from('hub_audit_log').select('id,created_at,actor,action,status,target,message').order('created_at', { ascending: false }).limit(LIMIT),
      client.from('builder_jobs').select('id,status,created_at,started_at,finished_at,updated_at,error,result,metadata').contains('metadata', { selfHealingOwnedSite: true }).order('created_at', { ascending: false }).limit(80),
      client.from('audit_runs').select('id,created_at,updated_at,created_by,status,prefix,files_scanned,findings_count,error').order('created_at', { ascending: false }).limit(80),
      client.from('audit_logs').select('id,created_at,run_id,payload').order('created_at', { ascending: false }).limit(120),
    ])

    const firstError = hub.error || builder.error || auditRuns.error || auditLogs.error
    if (firstError) return NextResponse.json({ ok: false, error: firstError.message }, { status: 500 })

    const rows: ActivityRawRow[] = [
      ...((hub.data || []) as ActivityRawRow[]),
      ...selfHealingRows(builder.data || []),
      ...auditRunRows(auditRuns.data || []),
      ...remediationRows(auditLogs.data || []),
    ]
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
      .slice(0, LIMIT)

    return NextResponse.json({ ok: true, report: buildActivityReport(rows) })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load the activity and evidence timeline.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

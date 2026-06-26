// saas/app/api/hub/cyber/prepare-github-pr/route.ts
// Prepares an owner-reviewable code proposal for approved dependency remediations.
// Guardrails:
// - only handles this platform repo for now
// - only edits direct package.json dependency entries
// - only edits when OSV supplied a concrete targetVersion
// - uses the existing repoWriter, which writes to ai/* branches only

import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/access'
import { getAdminSupabase } from '@/utils/supabase/server'
import { readRepoFileFrom } from '@/lib/audit/repoTarget'
import { commitFileToBranch } from '@/lib/ai/tools/repoWriter'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

const PLATFORM_REPO = process.env.AUDIT_GITHUB_REPO || 'SignalBoost/signalboost-live'

type Change = {
  packageName?: string
  currentVersion?: string
  targetVersion?: string | null
  sourceFile?: string
  advisoryId?: string
}

function branchFor(id: string) {
  return `cyber-${String(id || '').slice(0, 8)}`
}

function versionSpec(currentSpec: string, targetVersion: string) {
  const prefix = String(currentSpec || '').trim().startsWith('^') ? '^' : String(currentSpec || '').trim().startsWith('~') ? '~' : ''
  return `${prefix}${targetVersion}`
}

function groupDirectPackageJsonChanges(plan: any): Map<string, Change[]> {
  const out = new Map<string, Change[]>()
  const changes = Array.isArray(plan?.proposedChanges) ? plan.proposedChanges : []
  for (const c of changes) {
    const sourceFile = String(c?.sourceFile || '').trim()
    const targetVersion = String(c?.targetVersion || '').trim()
    const packageName = String(c?.packageName || '').trim()
    if (!sourceFile.endsWith('package.json')) continue
    if (!packageName || !targetVersion) continue
    const arr = out.get(sourceFile) || []
    arr.push({ ...c, sourceFile, targetVersion, packageName })
    out.set(sourceFile, arr)
  }
  return out
}

function updatePackageJson(content: string, changes: Change[]) {
  const json = JSON.parse(content)
  let changed = false
  for (const c of changes) {
    const name = String(c.packageName || '').trim()
    const targetVersion = String(c.targetVersion || '').trim()
    if (!name || !targetVersion) continue
    for (const group of ['dependencies', 'devDependencies', 'optionalDependencies']) {
      if (json?.[group]?.[name]) {
        json[group][name] = versionSpec(String(json[group][name]), targetVersion)
        changed = true
      }
    }
  }
  if (!changed) return { ok: false, content, changed: false, error: 'No matching direct package.json dependency entry was found.' }
  return { ok: true, content: `${JSON.stringify(json, null, 2)}\n`, changed: true, error: '' }
}

async function loadNextRow(admin: any, remediationId?: string | null) {
  let query = admin.from('remediation_requests')
    .select('id,repo,target,title,fix_plan,implementation_status')
    .eq('source_area', 'cybersecurity')
    .eq('source_type', 'dependency_scan')
    .eq('status', 'approved')
    .eq('fix_plan_status', 'approved_for_pr')
    .eq('implementation_status', 'awaiting_github_pr_preparation')

  if (remediationId) query = query.eq('id', remediationId)
  const { data, error } = await query.order('updated_at', { ascending: true }).limit(1).maybeSingle()
  if (error) return { ok: false, row: null, error: error.message }
  if (!data) return { ok: false, row: null, error: 'No approved remediation is waiting for GitHub PR preparation.' }
  return { ok: true, row: data, error: '' }
}

export async function POST(req: Request) {
  const guard = await requireAdmin()
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })

  let body: { remediationId?: string } = {}
  try { body = await req.json() } catch { /* optional body */ }

  const admin = getAdminSupabase()
  const loaded = await loadNextRow(admin, body.remediationId || null)
  if (!loaded.ok || !loaded.row) return NextResponse.json({ ok: false, error: loaded.error }, { status: 400 })

  const row = loaded.row
  const repo = String(row.repo || '').trim() || PLATFORM_REPO
  const now = new Date().toISOString()

  if (repo !== PLATFORM_REPO) {
    await admin.from('remediation_requests').update({
      implementation_status: 'manual_repository_connection_required',
      implementation_notes: `Automatic PR preparation currently supports ${PLATFORM_REPO}. Connect write access for ${repo} before preparing this PR.`,
      updated_at: now,
    }).eq('id', row.id)
    return NextResponse.json({ ok: false, error: `Repository ${repo} is not connected for write preparation yet.` }, { status: 400 })
  }

  const grouped = groupDirectPackageJsonChanges(row.fix_plan)
  if (grouped.size === 0) {
    await admin.from('remediation_requests').update({
      implementation_status: 'manual_version_confirmation_required',
      implementation_notes: 'No direct package.json change with a known targetVersion was found. Transitive or lockfile-only findings require manual version confirmation first.',
      updated_at: now,
    }).eq('id', row.id)
    return NextResponse.json({ ok: false, error: 'No safe direct package.json update was available.' }, { status: 400 })
  }

  const branch = branchFor(row.id)
  let prUrl = ''
  let prNumber = 0
  const touched: string[] = []
  const errors: string[] = []

  for (const [path, changes] of grouped.entries()) {
    const current = await readRepoFileFrom(repo, 'main', path)
    if (!current.ok || !current.content) { errors.push(`${path}: could not read file`); continue }
    let updated: { ok: boolean; content: string; changed: boolean; error: string }
    try { updated = updatePackageJson(current.content, changes) } catch (err) {
      errors.push(`${path}: ${err instanceof Error ? err.message : 'invalid package.json'}`)
      continue
    }
    if (!updated.ok || !updated.changed) { errors.push(`${path}: ${updated.error}`); continue }

    const result = await commitFileToBranch({
      branch,
      path,
      content: updated.content,
      message: `Cyber remediation: update dependencies for ${row.id}`,
    })
    if (!result.ok) { errors.push(`${path}: ${result.error}`); continue }
    touched.push(path)
    if (result.prUrl) prUrl = result.prUrl
    if (result.prNumber) prNumber = result.prNumber
  }

  if (touched.length === 0) {
    await admin.from('remediation_requests').update({
      implementation_status: 'github_pr_preparation_failed',
      implementation_notes: errors.join('\n') || 'No files were updated.',
      updated_at: new Date().toISOString(),
    }).eq('id', row.id)
    return NextResponse.json({ ok: false, error: errors.join('\n') || 'No files were updated.' }, { status: 400 })
  }

  await admin.from('remediation_requests').update({
    implementation_status: 'github_pr_prepared',
    implementation_notes: `Prepared ${touched.length} file update(s) on ai/${branch}.${errors.length ? ` Warnings: ${errors.join(' | ')}` : ''}`,
    pull_request_url: prUrl || null,
    updated_at: new Date().toISOString(),
  }).eq('id', row.id)

  return NextResponse.json({ ok: true, remediationId: row.id, branch: `ai/${branch}`, prUrl, prNumber, touched, warnings: errors })
}

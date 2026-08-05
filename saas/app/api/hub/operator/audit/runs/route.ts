// Audit run history and detail. Because approval is already durable, an owner
// history refresh may safely recover the newest approved run's single remediation
// PR. The operation is idempotent and never approves a run or writes to main.
//
// Report language behavior:
//   - the original audit_findings rows are immutable source records;
//   - translated display copies are cached as audit_report_translation logs;
//   - reopening a run after a language change reuses an existing translation or
//     generates one once, without changing remediation inputs.

import { NextRequest, NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'
import type { ApprovedRunRemediationResult } from '@/lib/audit/approvedRunRemediation'
import { runApprovedAuditRemediationWithRetry } from '@/lib/audit/approvedRunRemediationRetry'
import {
  AUDIT_REPORT_TRANSLATION_KIND,
  translateAuditReport,
  type AuditReportTranslationPayload,
} from '@/lib/audit/reportTranslation'
import { getAdminSupabase } from '@/utils/supabase/server'
import { parseRepoUrl, listRepoTree } from '@/lib/audit/repoTarget'
import { verifyFindings, summarizeFreshness, actionableFindings, type VerifiedFinding } from '@/lib/audit/findingFreshness'
import { localizeKnownFindingText, normalizeReportLang, reportLangFromCookie } from '@/lib/i18n/reportLanguage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const SEV_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }
const HEARTBEAT_KIND = 'audit_remediation_heartbeat'

// Mirrors the runner's default target so a run recorded from a bare path prefix
// (rather than a full GitHub URL) can still be re-read. Kept in sync by name, not
// by import, because runner.ts holds it privately.
const AUDIT_REPO = process.env.AUDIT_GITHUB_REPO || 'SignalBoost/signalboost-live'

// ─────────────────────────────────────────────────────────────────────────────
// FRESHNESS: a stored finding is a claim about a file at a moment, and this route
// is where that claim is read back — sometimes weeks later. On 5 Aug 2026 a report
// served from here listed phrases that had been localized away on 27 Jul; nothing
// on screen distinguished "still broken" from "fixed last week", and the owner was
// about to spend a day on findings that no longer existed.
//
// So each finding is re-checked against the CURRENT source before it is returned,
// and the ones that no longer reproduce are moved out of `findings` into
// `staleFindings` — visible if you want them, out of the fix queue by default.
//
// IT FAILS OPEN, DELIBERATELY. If the repo or branch cannot be resolved, or if the
// pass comes back mostly unreadable (a rate limit, a renamed default branch), the
// ORIGINAL list is returned untouched with freshnessError set. Hiding a real
// finding because a network call failed is far worse than showing a stale one:
// the first loses work silently, the second is merely noise the operator can see.
const STALE_MAX_FILES = 120
const UNREADABLE_ABORT_RATIO = 0.5

interface FreshnessPass {
  findings: any[]
  stale: VerifiedFinding[]
  summary: ReturnType<typeof summarizeFreshness> | null
  error: string
}

async function runFreshnessPass(prefix: string, findings: any[]): Promise<FreshnessPass> {
  const untouched = (error: string): FreshnessPass => ({ findings, stale: [], summary: null, error })
  if (!findings.length) return { findings, stale: [], summary: null, error: '' }

  try {
    const parsed = parseRepoUrl(prefix)
    const repo = parsed?.repo || AUDIT_REPO
    let branch = parsed?.branch || ''
    if (!branch) {
      const tree = await listRepoTree(repo)
      if (!tree.ok) return untouched(`Could not resolve the repository to re-check against: ${tree.error || repo}.`)
      branch = tree.branch
    }
    if (!repo || !branch) return untouched('Could not resolve the repository and branch to re-check against.')

    const verified = await verifyFindings(repo, branch, findings as any, { maxFiles: STALE_MAX_FILES })
    const missing = verified.filter(v => v.freshness === 'file-missing').length
    if (verified.length && missing / verified.length > UNREADABLE_ABORT_RATIO) {
      return untouched('Most files could not be read while re-checking — showing the recorded findings unfiltered.')
    }

    return {
      findings: actionableFindings(verified),
      stale: verified.filter(v => v.freshness === 'stale'),
      summary: summarizeFreshness(verified),
      error: '',
    }
  } catch (error) {
    return untouched(error instanceof Error ? error.message : 'Re-check failed — showing the recorded findings unfiltered.')
  }
}

type RemediationWithHeartbeat = ApprovedRunRemediationResult & {
  lifecycleStatus?: string
  mergedAt?: string
  activityHeartbeatAt?: string
}

function localizeFinding(row: any, lang: string) {
  const localized = localizeKnownFindingText({
    category: row?.category,
    title: row?.title,
    detail: row?.detail,
    recommendation: row?.recommendation,
  }, lang)
  return {
    ...row,
    category: localized.category || row?.category,
    title: localized.title || row?.title,
    detail: localized.detail || row?.detail,
    recommendation: localized.recommendation || row?.recommendation,
  }
}

function applyTranslation(
  rows: any[],
  translation: AuditReportTranslationPayload | null,
  sourceLang: string,
  targetLang: string,
) {
  if (normalizeReportLang(sourceLang) === normalizeReportLang(targetLang)) return rows
  if (!translation) return rows.map((row) => localizeFinding(row, targetLang))

  const translatedById = new Map(
    translation.findings.map((finding) => [String(finding.id), finding]),
  )
  return rows.map((row) => {
    const translated = translatedById.get(String(row?.id))
    if (!translated) return localizeFinding(row, targetLang)
    return {
      ...row,
      category: translated.category || row?.category,
      title: translated.title || row?.title,
      detail: translated.detail || row?.detail,
      recommendation: translated.recommendation || row?.recommendation,
    }
  })
}

function renderLogPayload(
  payload: any,
  findings: any[],
  translation: AuditReportTranslationPayload | null,
  targetLang: string,
) {
  if (!payload || typeof payload !== 'object') return payload ?? null
  return {
    ...payload,
    lang: normalizeReportLang(targetLang),
    findings,
    narrative: translation?.narrative ?? String(payload.narrative || ''),
  }
}

function splitAuditPayloads(rows: any[], targetLang: string) {
  let scan: any = null
  let remediation: RemediationWithHeartbeat | null = null
  let remediationUpdatedAt = ''
  let translation: AuditReportTranslationPayload | null = null
  const availableLanguages = new Set<string>()

  for (const row of rows || []) {
    const payload = row?.payload
    if (!payload || typeof payload !== 'object') continue

    if (payload.kind === AUDIT_REPORT_TRANSLATION_KIND) {
      const translatedLang = normalizeReportLang(payload.targetLang)
      availableLanguages.add(translatedLang)
      if (!translation && translatedLang === normalizeReportLang(targetLang)) {
        translation = payload as AuditReportTranslationPayload
      }
      continue
    }

    if (!remediation && payload.kind === 'audit_batch_remediation' && payload.approval === 'final') {
      remediation = payload as RemediationWithHeartbeat
      remediationUpdatedAt = typeof row?.created_at === 'string' ? row.created_at : ''
      continue
    }
    if (!scan && Array.isArray(payload.findings)) scan = payload
  }

  if (scan?.lang) availableLanguages.add(normalizeReportLang(scan.lang))
  return { scan, remediation, remediationUpdatedAt, translation, availableLanguages }
}
async function createCachedTranslation(params: {
  admin: any
  runId: string
  userId: string
  sourceLang: string
  targetLang: string
  findings: any[]
  narrative: string
}): Promise<AuditReportTranslationPayload | null> {
  if (normalizeReportLang(params.sourceLang) === normalizeReportLang(params.targetLang)) return null
  try {
    const translation = await translateAuditReport({
      runId: params.runId,
      sourceLang: params.sourceLang,
      targetLang: params.targetLang,
      findings: params.findings,
      narrative: params.narrative,
    })
    const inserted = await params.admin.from('audit_logs').insert({
      run_id: params.runId,
      user_id: params.userId,
      payload: translation,
    })
    if (inserted.error) {
      console.error('audit report translation cache write failed', inserted.error.message)
    }
    return translation
  } catch (error) {
    console.error('audit report translation failed', error instanceof Error ? error.message : error)
    return null
  }
}

async function recoverApprovedRun(admin: any, runId: string, actorUserId: string) {
  try {
    return await runApprovedAuditRemediationWithRetry({ admin, runId, actorUserId })
  } catch (error) {
    return {
      kind: 'audit_batch_remediation',
      ok: false,
      approval: 'final',
      runId,
      status: 'failed',
      branch: '',
      prUrl: '',
      prNumber: 0,
      autoMergeQueued: false,
      autoMergeError: '',
      findingsTotal: 0,
      findingsApplied: 0,
      findingsAlreadyResolved: 0,
      filesChanged: 0,
      skipped: [{ file: '(recovery)', findingCount: 0, reason: error instanceof Error ? error.message : 'Approved remediation recovery failed.' }],
      approvedAt: new Date().toISOString(),
      lifecycleStatus: 'failed',
      activityHeartbeatAt: '',
    } satisfies RemediationWithHeartbeat
  }
}

function withActivity(
  remediation: RemediationWithHeartbeat | null,
  persistedHeartbeatAt: string,
  updatedAt: string,
) {
  if (!remediation) return null
  const activityCheckedAt = remediation.activityHeartbeatAt || persistedHeartbeatAt || ''
  return {
    ...remediation,
    activityCheckedAt,
    lifecycleUpdatedAt: updatedAt || remediation.mergedAt || remediation.approvedAt || activityCheckedAt,
  }
}

export async function GET(req: NextRequest) {
  const ctx = await getAccess()
  if (!ctx.isOwner || !ctx.userId) {
    return NextResponse.json({ ok: false, error: 'Owner access required.' }, { status: 403 })
  }

  const lang = normalizeReportLang(reportLangFromCookie(req.headers.get('cookie')))
  const admin = getAdminSupabase()
  const runId = new URL(req.url).searchParams.get('runId')

  if (runId) {
    const run = await admin.from('audit_runs').select('*').eq('id', runId).single()
    if (run.error || !run.data) {
      return NextResponse.json({ ok: false, error: 'Run not found.' }, { status: 404 })
    }

    const recovery = run.data.status === 'approved'
      ? await recoverApprovedRun(admin, runId, ctx.userId)
      : null

    const findingsResult = await admin.from('audit_findings').select('*').eq('run_id', runId)
    if (findingsResult.error) {
      return NextResponse.json({ ok: false, error: findingsResult.error.message }, { status: 500 })
    }
    const sourceFindings = (findingsResult.data || []).slice().sort(
      (a: any, b: any) => (SEV_RANK[a.severity] ?? 9) - (SEV_RANK[b.severity] ?? 9),
    )

    const [logRows, heartbeatRow] = await Promise.all([
      admin
        .from('audit_logs')
        .select('payload,created_at')
        .eq('run_id', runId)
        .order('created_at', { ascending: false })
        .limit(200),
      admin
        .from('audit_logs')
        .select('created_at')
        .eq('run_id', runId)
        .eq('payload->>kind', HEARTBEAT_KIND)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])
    const payloads = splitAuditPayloads(logRows.data || [], lang)
    const sourceLang = normalizeReportLang(payloads.scan?.lang)

    if (!payloads.translation && sourceLang !== lang) {
      payloads.translation = await createCachedTranslation({
        admin,
        runId,
        userId: ctx.userId,
        sourceLang,
        targetLang: lang,
        findings: sourceFindings,
        narrative: String(payloads.scan?.narrative || ''),
      })
      if (payloads.translation) payloads.availableLanguages.add(lang)
    }

    const translated = applyTranslation(sourceFindings, payloads.translation, sourceLang, lang)
    // Re-check against the repository as it is NOW, before any of this is shown.
    const fresh = await runFreshnessPass(String(run.data.prefix || payloads.scan?.prefix || ''), translated)
    const findings = fresh.findings
    const persistedHeartbeatAt = typeof heartbeatRow.data?.created_at === 'string'
      ? heartbeatRow.data.created_at
      : ''
    const remediation = withActivity(
      (recovery || payloads.remediation) as RemediationWithHeartbeat | null,
      persistedHeartbeatAt,
      payloads.remediationUpdatedAt || String(run.data.updated_at || run.data.created_at || ''),
    )

    return NextResponse.json({
      ok: true,
      run: run.data,
      findings,
      log: renderLogPayload(payloads.scan, findings, payloads.translation, lang),
      reportLanguage: lang,
      sourceLanguage: sourceLang,
      availableLanguages: Array.from(payloads.availableLanguages).sort(),
      // Findings that no longer reproduce are returned separately rather than
      // deleted: the run's own record stays intact and an operator can still see
      // what was fixed since it ran.
      staleFindings: fresh.stale,
      freshness: fresh.summary,
      freshnessError: fresh.error,
      // For approved runs, the recovery call is the freshest lifecycle state.
      // Older durable logs remain the fallback for already-remediated history.
      remediation,
    })
  }

  const runs = await admin
    .from('audit_runs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(30)

  if (runs.error) {
    return NextResponse.json({ ok: false, error: runs.error.message }, { status: 500 })
  }

  const newestApproved = (runs.data || []).find((run: any) => run?.status === 'approved')
  const recovered = newestApproved?.id
    ? await recoverApprovedRun(admin, String(newestApproved.id), ctx.userId)
    : null
  const recovery = withActivity(
    recovered as RemediationWithHeartbeat | null,
    '',
    String(newestApproved?.updated_at || newestApproved?.created_at || ''),
  )

  return NextResponse.json({ ok: true, runs: runs.data || [], recovery })
}

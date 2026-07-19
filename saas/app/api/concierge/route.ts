import { after, NextRequest, NextResponse } from 'next/server'
import { POST as supportPost } from '@/app/api/support/route'
import { detectPrimaryCorruption } from '@/lib/cos-backup/policy'
import { recordCosRecovery, runBackupCos } from '@/lib/cos-backup/runtime'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

function latestUserText(body: any): string {
  const messages = Array.isArray(body?.messages) ? body.messages : []
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role !== 'user') continue
    const content = messages[i]?.content
    if (typeof content === 'string') return content
    if (Array.isArray(content)) {
      return content.map((block: any) => String(block?.text || '')).join('\n').trim()
    }
  }
  return ''
}

function languageFrom(body: any): string {
  const value = String(body?.context?.language || 'en').toLowerCase()
  return ['en', 'es', 'pt', 'pl', 'ru'].includes(value) ? value : 'en'
}

async function responseSnapshot(response: Response): Promise<{ reply: string; source: string }> {
  try {
    const payload = await response.clone().json()
    return {
      reply: String(payload?.reply || payload?.message || ''),
      source: String(payload?.source || payload?.telemetry?.source || ''),
    }
  } catch {
    try {
      return { reply: await response.clone().text(), source: '' }
    } catch {
      return { reply: '', source: '' }
    }
  }
}

function sourceCommit(): string {
  return process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || 'runtime-unknown'
}

function timestamp(): string {
  return new Date().toISOString().replace('T', ' ').replace('Z', '')
}

export async function POST(req: NextRequest) {
  const body = await req.clone().json().catch(() => ({}))
  const input = latestUserText(body)
  const language = languageFrom(body)

  // Start the read-only shadow path immediately, but never wait for it before
  // returning a healthy Primary response. runBackupCos has its own hard deadline.
  const backupPromise = runBackupCos(input, language).catch(() => null)

  let primary: Response | null = null
  try {
    primary = await supportPost(new NextRequest(req.clone()))
  } catch {
    primary = null
  }

  const primarySnapshot = primary
    ? await responseSnapshot(primary)
    : { reply: '', source: '' }
  const immediateReasons = detectPrimaryCorruption({
    status: primary?.status || 500,
    reply: primarySnapshot.reply,
    source: primarySnapshot.source,
  })

  if (primary && immediateReasons.length === 0) {
    // Complete the shadow comparison after the healthy response is sent. This
    // preserves continuity evidence without making normal Concierge latency
    // depend on the redundant provider.
    after(async () => {
      const backup = await backupPromise
      if (!backup?.ok) return
      const shadowReasons = detectPrimaryCorruption({
        status: primary.status,
        reply: primarySnapshot.reply,
        source: primarySnapshot.source,
        backup,
      })
      if (!shadowReasons.includes('primary_backup_quality_divergence')) return
      await recordCosRecovery({
        ok: true,
        sourceCommit: sourceCommit(),
        action: 'Flagged Primary for Review',
        reason: shadowReasons.join(', '),
        timestamp: timestamp(),
        divergenceDetails: shadowReasons,
        recoveryStatus: 'primary_returned_shadow_alert',
      })
    })
    return primary
  }

  // A failed, empty, canned, or error-degraded Primary response is quarantined
  // for this request. Only now may Backup COS delay the response, and its wait is
  // bounded by the runtime deadline.
  const backup = await backupPromise
  const reasons = detectPrimaryCorruption({
    status: primary?.status || 500,
    reply: primarySnapshot.reply,
    source: primarySnapshot.source,
    backup,
  })
  const recovered = Boolean(backup?.ok)
  const commit = sourceCommit()

  await recordCosRecovery({
    ok: recovered,
    sourceCommit: commit,
    action: 'Activated Backup Read-Only Continuity',
    reason: reasons.join(', ') || 'Primary unavailable',
    timestamp: timestamp(),
    divergenceDetails: reasons,
    recoveryStatus: recovered ? 'backup_read_only_active' : 'backup_failed',
  })

  if (recovered && backup) {
    return NextResponse.json({
      reply: backup.answer,
      source: 'backup-cos-continuity',
      continuity_mode: 'backup_read_only',
      primary_quarantined: true,
      divergence: reasons,
      sourceCommit: commit,
      execution_allowed: false,
      approval_required: backup.requiresApproval,
    })
  }

  return NextResponse.json({
    reply: 'COS continuity protection detected a primary failure. The immutable core remains protected, but both reasoning providers are temporarily unavailable. No action was executed.',
    source: 'cos-immutable-core-fallback',
    continuity_mode: 'immutable_core_only',
    primary_quarantined: true,
    divergence: reasons,
    sourceCommit: commit,
    execution_allowed: false,
  }, { status: 200 })
}

// saas/app/api/concierge/route.ts
// Concierge remains a governed transport boundary. The canonical /api/support
// Primary COS runs first. Backup COS is invoked only after deterministic evidence
// that the Primary response is unavailable, degraded, empty, or known-corrupt.

import { NextRequest, NextResponse } from 'next/server'
import { POST as supportPost } from '@/app/api/support/route'
import { detectPrimaryCorruption } from '@/lib/cos-backup/continuityPolicy'
import { recordCosRecovery, runBackupCos, type BackupCosAnswer } from '@/lib/cos-backup/runtime'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BACKUP_TIMEOUT_MS = 20_000
const SUPPORTED_LANGUAGES = new Set(['en', 'es', 'pt', 'pl', 'ru'])

type PrimaryEnvelope = {
  reply: string
  source: string
}

function latestUserText(body: any): string {
  const messages = Array.isArray(body?.messages) ? body.messages : []
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role !== 'user') continue
    const content = messages[i]?.content
    if (typeof content === 'string') return content.trim()
  }
  return ''
}

function languageFrom(body: any): string {
  const value = String(body?.context?.language || 'en').toLowerCase()
  return SUPPORTED_LANGUAGES.has(value) ? value : 'en'
}

async function responseEnvelope(response: Response): Promise<PrimaryEnvelope> {
  try {
    const payload = await response.clone().json()
    return {
      reply: String(payload?.reply || payload?.message || '').trim(),
      source: String(payload?.source || payload?.telemetry?.source || '').trim(),
    }
  } catch {
    try {
      return { reply: (await response.clone().text()).trim(), source: '' }
    } catch {
      return { reply: '', source: '' }
    }
  }
}

async function runBackupWithDeadline(input: string, language: string): Promise<BackupCosAnswer | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      runBackupCos(input, language).catch(() => null),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), BACKUP_TIMEOUT_MS)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export async function POST(req: NextRequest) {
  const bodyPromise = req.clone().json().catch(() => ({}))

  let primary: Response | null = null
  try {
    primary = await supportPost(req)
  } catch {
    primary = null
  }

  const body = await bodyPromise
  const envelope = primary
    ? await responseEnvelope(primary)
    : { reply: '', source: '' }
  const reasons = detectPrimaryCorruption({
    status: primary?.status ?? 500,
    reply: envelope.reply,
    source: envelope.source,
  })

  // Healthy Primary responses return immediately. Normal Concierge traffic is
  // never delayed by, or made dependent on, the redundant reasoning provider.
  if (primary && reasons.length === 0) return primary

  const input = latestUserText(body)
  const language = languageFrom(body)
  const backup = await runBackupWithDeadline(input, language)
  const recovered = Boolean(backup?.ok)
  const sourceCommit = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || 'runtime-unknown'

  await recordCosRecovery({
    ok: recovered,
    sourceCommit,
    action: 'Activated Backup Read-Only Continuity',
    reason: reasons.join(', ') || 'Primary unavailable',
    timestamp: new Date().toISOString(),
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
      sourceCommit,
      execution_allowed: false,
      approval_required: backup.requiresApproval,
    })
  }

  return NextResponse.json({
    reply: 'COS continuity protection detected a Primary failure. The immutable core remains protected, but both reasoning providers are temporarily unavailable. No action was executed.',
    source: 'cos-immutable-core-fallback',
    continuity_mode: 'immutable_core_only',
    primary_quarantined: true,
    divergence: reasons,
    sourceCommit,
    execution_allowed: false,
  }, { status: 200 })
}

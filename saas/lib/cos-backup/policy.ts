// saas/lib/cos-backup/policy.ts
// Dependency-free continuity policy. Keep this file free of Next.js, database,
// provider, and path-alias imports so the governance test can execute it directly.

export type BackupCosAnswer = {
  ok: boolean
  answer: string
  intent: string
  requiresApproval: boolean
  proposedTool: string | null
  confidence: number
  brainDigest: string
  provider?: string | null
  model?: string | null
  reasoningSource?: 'provider' | 'cache' | 'configured_reasoner' | null
  externalAiInvoked?: boolean
}

export type PrimaryCosSnapshot = {
  status: number
  reply: string
  source?: string | null
  backup?: BackupCosAnswer | null
}

const CORRUPTION_SIGNATURES = [
  'concierge created the press & print campaign',
  'draft linkedin post (edit before publishing)',
  'your linkedin outreach message is saved',
  'sent this request to the cosa video pipeline',
]

function pushUnique(reasons: string[], reason: string) {
  if (!reasons.includes(reason)) reasons.push(reason)
}

export function detectPrimaryCorruption(input: PrimaryCosSnapshot): string[] {
  const status = Number(input.status)

  // Authentication, authorization, validation, rate-limit, and other client
  // denials belong to the governed Primary route. Continuity must never convert
  // a Primary 4xx response into a successful Backup COS answer.
  if (Number.isFinite(status) && status >= 400 && status < 500) return []

  const reasons: string[] = []
  const reply = String(input.reply || '').trim()
  const lowerReply = reply.toLowerCase()
  const source = String(input.source || '').trim().toLowerCase()

  if (!Number.isFinite(status) || status >= 500) pushUnique(reasons, 'primary_http_failure')
  if (!reply) pushUnique(reasons, 'primary_empty_reply')
  if (source === 'error-degraded' || source.endsWith('-degraded')) {
    pushUnique(reasons, 'primary_degraded_response')
  }

  for (const signature of CORRUPTION_SIGNATURES) {
    if (lowerReply.includes(signature)) pushUnique(reasons, `canned_response:${signature}`)
  }

  if (
    input.backup?.ok &&
    reply.length > 0 &&
    reply.length < 20 &&
    input.backup.answer.trim().length >= 80
  ) {
    pushUnique(reasons, 'primary_backup_quality_divergence')
  }

  return reasons
}

export function isPrimaryHealthy(input: Omit<PrimaryCosSnapshot, 'backup'>): boolean {
  return detectPrimaryCorruption(input).length === 0
}

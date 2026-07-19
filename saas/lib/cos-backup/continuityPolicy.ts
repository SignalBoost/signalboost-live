// saas/lib/cos-backup/continuityPolicy.ts
// Pure, dependency-free failover policy. Direct Node TypeScript governance tests
// can import this file without resolving Next.js or @/* aliases.

export const COS_CONTINUITY_POLICY_SCHEMA = 'signalboost-cos-continuity-policy-v1' as const

const DEGRADED_PRIMARY_SOURCES = new Set(['error-degraded'])

const CORRUPTION_SIGNATURES = [
  'concierge created the press & print campaign',
  'draft linkedin post (edit before publishing)',
  'your linkedin outreach message is saved',
  'sent this request to the cosa video pipeline',
] as const

export type PrimaryCosSignal = {
  status: number
  reply: string
  source?: string | null
}

export function detectPrimaryCorruption(input: PrimaryCosSignal): string[] {
  const reasons: string[] = []
  const reply = String(input.reply || '').trim()
  const source = String(input.source || '').trim().toLowerCase()
  const lowerReply = reply.toLowerCase()

  if (!Number.isFinite(input.status) || input.status >= 500) reasons.push('primary_http_failure')
  if (DEGRADED_PRIMARY_SOURCES.has(source)) reasons.push(`primary_degraded_source:${source}`)
  if (!reply) reasons.push('primary_empty_reply')

  for (const signature of CORRUPTION_SIGNATURES) {
    if (lowerReply.includes(signature)) reasons.push(`canned_response:${signature}`)
  }

  return [...new Set(reasons)]
}

// saas/lib/cos-marketing-sales/contactLimiter.ts
// Planning guard for the portable COS Marketing + Sales Engine.
// It limits planned contact touches by corporate domain before any owner-approved action.

import type { DomainThrottleDecision, OutreachDispatchRecord } from './types'

export const CONTACT_WINDOW_HOURS = 48
export const CONTACT_MAX_PER_DOMAIN = 2

export function extractDomain(emailOrDomain: string): string {
  const value = String(emailOrDomain || '').trim().toLowerCase()
  const domain = value.includes('@') ? value.split('@').pop() || '' : value
  return domain.replace(/^www\./, '')
}

export function checkDomainContactLimit(params: {
  recipientEmail: string
  history: OutreachDispatchRecord[]
  now?: Date
  windowHours?: number
  maxPerDomain?: number
}): DomainThrottleDecision {
  const now = params.now || new Date()
  const windowHours = params.windowHours ?? CONTACT_WINDOW_HOURS
  const maxDispatches = params.maxPerDomain ?? CONTACT_MAX_PER_DOMAIN
  const domain = extractDomain(params.recipientEmail)
  const windowStart = now.getTime() - windowHours * 60 * 60 * 1000

  const usedDispatches = params.history.filter(record => {
    const recordDomain = extractDomain(record.recipientDomain || record.recipientEmail)
    if (recordDomain !== domain) return false
    if (record.status !== 'sent' && record.status !== 'planned') return false
    const createdAt = new Date(record.createdAt).getTime()
    return Number.isFinite(createdAt) && createdAt >= windowStart && createdAt <= now.getTime()
  }).length

  const remainingDispatches = Math.max(0, maxDispatches - usedDispatches)
  const allowed = usedDispatches < maxDispatches

  return {
    allowed,
    domain,
    windowHours,
    maxDispatches,
    usedDispatches,
    remainingDispatches,
    reason: allowed ? undefined : `Contact limit active for ${domain}: ${usedDispatches} planned or completed touches in ${windowHours} hours.`,
  }
}

export function createPlannedContactRecord(params: {
  leadId?: string
  recipientEmail: string
  channel: OutreachDispatchRecord['channel']
  status?: OutreachDispatchRecord['status']
  now?: Date
}): OutreachDispatchRecord {
  const now = params.now || new Date()
  return {
    id: crypto.randomUUID(),
    leadId: params.leadId,
    recipientEmail: params.recipientEmail.toLowerCase(),
    recipientDomain: extractDomain(params.recipientEmail),
    channel: params.channel,
    status: params.status || 'planned',
    createdAt: now.toISOString(),
  }
}

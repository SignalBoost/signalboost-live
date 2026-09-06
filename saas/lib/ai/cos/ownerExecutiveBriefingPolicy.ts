import type { GmailMessageSummary } from '../../google-workspace/gmail.ts'

export type OwnerBriefingItem = {
  sourceType: 'gmail' | 'supervisor'
  sourceId: string
  severity: 'urgent' | 'important' | 'routine'
  title: string
  detail: string
  observedAt: string
}

const URGENT = /\b(urgent|immediate action|required today|security alert|suspicious|fraud|breach|locked|overdue|final notice|cancell?ed|deadline today)\b/i
const IMPORTANT = /\b(action required|approval|deadline|invoice|payment|travel|flight|passport|visa|meeting|interview|contract|legal|tax|benefit|claim|voucher|github|deployment|failed|failure|warning)\b/i

export function classifyOwnerEmail(message: GmailMessageSummary): OwnerBriefingItem {
  const combined = `${message.subject} ${message.snippet}`
  const severity = URGENT.test(combined) ? 'urgent'
    : message.labels.includes('IMPORTANT') || message.labels.includes('STARRED') || IMPORTANT.test(combined) ? 'important'
      : 'routine'
  return {
    sourceType: 'gmail',
    sourceId: message.id,
    severity,
    title: message.subject,
    detail: `From ${message.from || 'unknown sender'} · ${message.snippet || 'No preview available'}`.slice(0, 900),
    observedAt: message.internalDate || new Date().toISOString(),
  }
}

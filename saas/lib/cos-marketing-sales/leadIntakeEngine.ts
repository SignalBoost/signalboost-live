// saas/lib/cos-marketing-sales/leadIntakeEngine.ts
// Shared public lead intake builder for SignalBoost lead magnets.
// It prepares a tagged lead package and owner-review plan only.

import type { CosLocale, LeadCapture, LeadIntakePayload, LeadIntakeResult, LeadIntakeSource, OutreachPlan } from './types'
import { salesOutreachManager } from './salesOutreachManager'

const SOURCE_TAGS: Record<LeadIntakeSource, string[]> = {
  website_optimizer: ['website', 'optimization', 'seo', 'conversion'],
  repo_check: ['repo', 'audit', 'dependencies', 'developer'],
  cybersecurity_check: ['cybersecurity', 'headers', 'risk-review', 'website'],
  audit_preview: ['audit', 'risk-review', 'remediation'],
}

const SOURCE_NOTES: Record<LeadIntakeSource, string> = {
  website_optimizer: 'Lead requested help after a public website optimization preview.',
  repo_check: 'Lead requested help after a public repository audit preview.',
  cybersecurity_check: 'Lead requested help after a public cybersecurity preview.',
  audit_preview: 'Lead requested help after an audit preview.',
}

export function normalizeCosLocale(locale?: string): CosLocale {
  if (locale === 'es' || locale === 'pt-BR' || locale === 'pl' || locale === 'ru') return locale
  if (locale === 'pt') return 'pt-BR'
  return 'en'
}

export function normalizeLeadSource(source?: string): LeadIntakeSource | null {
  if (source === 'website_optimizer' || source === 'repo_check' || source === 'cybersecurity_check' || source === 'audit_preview') return source
  return null
}

export function isValidLeadEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

export function getDomainFromEmail(email: string) {
  return String(email || '').trim().toLowerCase().split('@').pop()?.replace(/^www\./, '') || 'unknown'
}

export function normalizePublicTarget(raw: string): string | null {
  const input = String(raw || '').trim().slice(0, 350)
  if (!input) return null
  const withProtocol = /^https?:\/\//i.test(input) ? input : `https://${input}`
  try {
    const url = new URL(withProtocol)
    if (!['http:', 'https:'].includes(url.protocol)) return null
    const host = url.hostname.toLowerCase()
    if (!host || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return null
    url.hash = ''
    return url.toString()
  } catch {
    return null
  }
}

function scoreLead(payload: LeadIntakePayload) {
  const base = payload.source === 'cybersecurity_check' ? 72 : payload.source === 'website_optimizer' ? 68 : 64
  const findingCount = Array.isArray(payload.findings) ? payload.findings.length : 0
  const severityBoost = (payload.findings || []).some(finding => finding.severity === 'high' || finding.severity === 'critical') ? 12 : 0
  const score = Math.max(0, Math.min(100, Math.round(payload.score ?? base + Math.min(12, findingCount * 2) + severityBoost)))
  return score
}

function sourceSummary(payload: LeadIntakePayload) {
  const findings = payload.findings || []
  const topCodes = findings.map(finding => finding.code).filter(Boolean).slice(0, 8)
  const topCategories = Array.from(new Set(findings.map(finding => finding.category).filter(Boolean))).slice(0, 6)
  return {
    source: payload.source,
    targetUrl: payload.targetUrl,
    score: payload.score,
    summary: payload.summary || {},
    findingCount: findings.length,
    topCodes,
    topCategories,
  }
}

export function buildLeadIntake(payload: LeadIntakePayload): Omit<LeadIntakeResult, 'storage'> {
  const now = new Date().toISOString()
  const email = payload.email.trim().toLowerCase()
  const domain = getDomainFromEmail(email)
  const tags = Array.from(new Set([...(SOURCE_TAGS[payload.source] || []), ...(payload.tags || [])])).filter(Boolean)
  const lead: LeadCapture = {
    id: crypto.randomUUID(),
    email,
    name: payload.name?.trim() || undefined,
    company: payload.company?.trim() || domain,
    domain,
    source: payload.source,
    status: 'tagged',
    locale: normalizeCosLocale(payload.locale),
    country: payload.country,
    tags,
    score: scoreLead(payload),
    notes: SOURCE_NOTES[payload.source],
    followUpMilestones: ['personalized_audit_link', 'multilingual_brief', 'interactive_demo_offer'],
    createdAt: now,
    updatedAt: now,
  }

  const outreachPlan: OutreachPlan = salesOutreachManager.createValueDropCadence({ lead, history: [] })

  return {
    id: crypto.randomUUID(),
    lead: outreachPlan.lead,
    source: payload.source,
    targetUrl: payload.targetUrl,
    tags,
    approvalStatus: 'pending_owner_review',
    outreachPlan,
  }
}

export function buildOutreachQueueRow(intake: Omit<LeadIntakeResult, 'storage'>, payload: LeadIntakePayload) {
  const firstStep = intake.outreachPlan.cadence[0]
  const summary = sourceSummary(payload)
  return {
    business_id: `${payload.source}:${intake.lead.domain}`,
    source_platform: payload.source,
    business_name: payload.company?.trim() || payload.name?.trim() || intake.lead.domain,
    business_url: payload.targetUrl,
    analyzer_summary: {
      intakeId: intake.id,
      contact: { email: intake.lead.email, name: intake.lead.name, company: intake.lead.company },
      leadScore: intake.lead.score,
      tags: intake.tags,
      sourceSummary: summary,
      approvalStatus: intake.approvalStatus,
    },
    business_model_profile: {
      lead: intake.lead,
      source: payload.source,
      targetUrl: payload.targetUrl,
    },
    predictive_needs: {
      nextAction: intake.outreachPlan.nextAction,
      domainThrottle: intake.outreachPlan.domainThrottle,
      cadence: intake.outreachPlan.cadence,
    },
    website_json: {
      targetUrl: payload.targetUrl,
      scanSummary: payload.summary || {},
      findings: payload.findings || [],
    },
    review_strategy: {},
    social_plan: {},
    promo_plan: {},
    outreach_message: firstStep ? `${firstStep.subject}\n\n${firstStep.body}` : 'Owner review required before any external follow-up.',
    status: 'pending',
  }
}

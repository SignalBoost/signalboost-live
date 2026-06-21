// saas/lib/audit/reportModel.ts
//
// Audit Center — canonical data model. (i18n-native: findings carry message
// KEYS + params, never baked UI prose. English lives only as a fallback for the
// LLM exec-summary and as t()'s last-resort arg.)
//
// Every report is a VIEW over the shapes here. Findings engine writes them,
// report generators read them, the UI renders them via t(), PDF/CSV export them.
//
// Load-bearing principles:
//   1. DETERMINISTIC CORE. Findings carry `derivedFrom` provenance + an
//      `evidenceRequired` flag. The LLM never invents a finding; it only
//      summarizes Finding[] + AuditScore the rules produced.
//   2. HONEST DERIVABILITY. Checks the provider APIs don't expose become
//      `evidenceRequired`, never fabricated facts.
//   3. i18n-NATIVE. Customer-facing text is `messageKey` + `params`; the
//      renderer resolves `t(messageKey + '.title', fallback)` and interpolates.

import type { Severity } from './runner' // 'critical' | 'high' | 'medium' | 'low' | 'info'

export type { Severity }

// ─────────────────────────────────────────────────────────────────────────────
// 1. Findings
// ─────────────────────────────────────────────────────────────────────────────

export type FindingCategory =
  | 'inventory'
  | 'secret'
  | 'identity'
  | 'access'
  | 'rls-bypass'
  | 'authz'
  | 'config'
  | 'change-management'
  | 'billing'
  | 'database'
  | 'deployment'
  | 'audit-log'
  | 'compliance'
  | 'standards'

export type FindingStatus = 'open' | 'in_progress' | 'resolved' | 'accepted' | 'wont_fix'

export type FindingSource =
  | 'stripe-api'
  | 'supabase-api'
  | 'vercel-api'
  | 'github-api'
  | 'hub-records'
  | 'pr-cockpit'
  | 'env-inventory'
  | 'manual'

/** Resolved, display-ready finding text (post-translation + interpolation). */
export interface FindingText {
  title: string
  detail: string
  recommendation: string
  impact?: string
}

export interface Finding {
  /** Deterministic, language-independent, stable across runs. */
  id: string
  provider: string
  category: FindingCategory
  severity: Severity
  /**
   * Base i18n key. The renderer resolves `${messageKey}.title`,
   * `${messageKey}.detail`, `${messageKey}.recommendation`, `${messageKey}.impact`.
   */
  messageKey: string
  /** Interpolation values for the {tokens} in the templates. */
  params?: Record<string, string | number>
  /** English fallback — LLM exec-summary input, PDF fallback, t() fallback. Never shown raw in UI. */
  fallback: FindingText
  derivedFrom: FindingSource
  evidenceRequired: boolean
  status: FindingStatus
  owner?: string
  dueDate?: string // ISO date
  suggestedFixTemplateId?: string
}

/**
 * Resolve a finding's text for display. Pure: the caller passes its own `t`
 * (from useTranslation) and `interp` (from lib/i18n/interpolate) so this module
 * stays React-free.
 */
export function resolveFinding(
  finding: Finding,
  t: (key: string, fallback: string) => string,
  interp: (template: string, params?: Record<string, string | number>) => string,
): FindingText {
  const k = finding.messageKey
  const p = finding.params
  const out: FindingText = {
    title: interp(t(`${k}.title`, finding.fallback.title), p),
    detail: interp(t(`${k}.detail`, finding.fallback.detail), p),
    recommendation: interp(t(`${k}.recommendation`, finding.fallback.recommendation), p),
  }
  if (finding.fallback.impact) {
    out.impact = interp(t(`${k}.impact`, finding.fallback.impact), p)
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Scoring
// ─────────────────────────────────────────────────────────────────────────────

export interface AuditScore {
  score: number // 0–100, higher = more ready
  critical: number
  high: number
  medium: number
  low: number
  info: number
  evidenceRequired: number
  total: number
}

const SEVERITY_WEIGHT: Record<Severity, number> = {
  critical: 15,
  high: 8,
  medium: 3,
  low: 1,
  info: 0,
}

/**
 * Deterministic score. Evidence-required findings do NOT subtract points (no
 * proven defect, only a gap to verify); they're counted separately.
 */
export function scoreFromFindings(findings: Finding[]): AuditScore {
  const out: AuditScore = {
    score: 100,
    critical: 0, high: 0, medium: 0, low: 0, info: 0,
    evidenceRequired: 0,
    total: findings.length,
  }
  let penalty = 0
  for (const f of findings) {
    if (f.evidenceRequired) { out.evidenceRequired++; continue }
    if (f.status === 'resolved' || f.status === 'accepted' || f.status === 'wont_fix') continue
    out[f.severity]++
    penalty += SEVERITY_WEIGHT[f.severity] || 0
  }
  out.score = Math.max(0, Math.min(100, 100 - penalty))
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Identity & Access — raw access metadata only (no employment inference)
// ─────────────────────────────────────────────────────────────────────────────

export type MfaState = 'enabled' | 'disabled' | 'unknown'
export type IdentityKind = 'user' | 'service_account' | 'access_key' | 'collaborator' | 'token'

/** Days without recorded activity/login before an identity is "stale". */
export const STALE_ACCESS_DAYS = 90

export interface IdentityRow {
  provider: string
  principal: string
  kind: IdentityKind
  role: string
  isPrivileged: boolean
  mfaState: MfaState // 'unknown' = provider does not expose it
  active: boolean
  lastSeen?: string // ISO; undefined = no activity ever recorded
  lastSeenDays?: number
  stale: boolean
  /** Stable flag codes for the UI to translate (e.g. 'stale','privilegedNoMfa','neverLoggedIn'). */
  flags: string[]
}

export interface IdentityAccessSummary {
  total: number
  privileged: number
  stale: number
  privilegedNoMfa: number
  mfaUnknown: number
}

export function daysSince(iso?: string, now: number = Date.now()): number | undefined {
  if (!iso) return undefined
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return undefined
  return Math.max(0, Math.floor((now - t) / 86_400_000))
}

export function summarizeIdentities(rows: IdentityRow[]): IdentityAccessSummary {
  const out: IdentityAccessSummary = { total: rows.length, privileged: 0, stale: 0, privilegedNoMfa: 0, mfaUnknown: 0 }
  for (const r of rows) {
    if (r.isPrivileged) out.privileged++
    if (r.stale) out.stale++
    if (r.isPrivileged && r.mfaState === 'disabled') out.privilegedNoMfa++
    if (r.mfaState === 'unknown') out.mfaUnknown++
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Other per-report row shapes
// ─────────────────────────────────────────────────────────────────────────────

export type ConnectionStatus = 'connected' | 'missing' | 'error' | 'not_configured'

export interface ProviderInventoryRow {
  provider: string
  status: ConnectionStatus
  risk: Severity | 'unknown'
  category: string
  connectedBy?: string
  lastCheckedAt?: string
  note?: string
}

/** Secrets report row — METADATA ONLY. Never carries a real secret value. */
export interface SecretInventoryRow {
  name: string
  provider: string
  environment?: 'production' | 'preview' | 'development' | 'unknown'
  present: boolean
  maskedHint?: string // '[MASKED_PRESENT]' — never the value
  createdAt?: string
  lastRotatedAt?: string
  risk: Severity
  rotationKnown: boolean
}

export interface RemediationItem {
  findingId: string
  messageKey: string
  params?: Record<string, string | number>
  severity: Severity
  owner?: string
  dueDate?: string
  status: FindingStatus
  evidenceRequired: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Compliance readiness — readiness %, NEVER certification
// ─────────────────────────────────────────────────────────────────────────────

export type ComplianceFramework = 'SOC2' | 'ISO27001' | 'NIST_CSF' | 'CIS'

export interface ComplianceReadinessRow {
  framework: ComplianceFramework
  domain: string
  readinessPercent: number
  evidenceStrength: 'good' | 'partial' | 'weak' | 'missing'
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Report envelope + registry
// ─────────────────────────────────────────────────────────────────────────────

export type ReportId =
  | 'executive-summary'
  | 'provider-inventory'
  | 'identity-access'
  | 'secrets-keys'
  | 'remediation-roadmap'
  | 'pr-cockpit-trail'
  | 'github-changes'
  | 'supabase-security'
  | 'stripe-config'
  | 'vercel-deployment'
  | 'audit-log'
  | 'compliance-readiness'

export type Derivability = 'auto' | 'partial' | 'manual'

export interface ReportMeta {
  id: ReportId
  /** i18n key for the title (resolves under audit.report.*). */
  titleKey: string
  /** i18n key for the description. */
  descriptionKey: string
  /** English fallbacks — pass safe-wording. */
  title: string
  description: string
  mvpOrder: number
  derivability: Derivability
}

export const REPORT_REGISTRY: ReportMeta[] = [
  { id: 'executive-summary',    titleKey: 'audit.report.executiveSummary.title',   descriptionKey: 'audit.report.executiveSummary.description',   title: 'Executive Risk Summary',            description: 'Overall readiness score, finding counts, and top risks for owners and leadership.', mvpOrder: 1, derivability: 'auto' },
  { id: 'provider-inventory',   titleKey: 'audit.report.providerInventory.title',  descriptionKey: 'audit.report.providerInventory.description',  title: 'Provider Inventory Report',         description: 'Every connected provider with status, risk, and last-checked time.',               mvpOrder: 2, derivability: 'partial' },
  { id: 'identity-access',      titleKey: 'audit.report.identityAccess.title',     descriptionKey: 'audit.report.identityAccess.description',     title: 'Identity & Access Review',          description: 'Who has access, privilege level, MFA state, and last-seen activity.',              mvpOrder: 3, derivability: 'partial' },
  { id: 'secrets-keys',         titleKey: 'audit.report.secretsKeys.title',        descriptionKey: 'audit.report.secretsKeys.description',        title: 'Secrets & API Key Exposure Report', description: 'Configured credentials by environment and rotation posture. Metadata only.',        mvpOrder: 4, derivability: 'partial' },
  { id: 'remediation-roadmap',  titleKey: 'audit.report.remediationRoadmap.title', descriptionKey: 'audit.report.remediationRoadmap.description', title: 'Remediation Roadmap',               description: 'Prioritized fixes with business impact, owner, and due date.',                      mvpOrder: 5, derivability: 'auto' },
  { id: 'pr-cockpit-trail',     titleKey: 'audit.report.prCockpitTrail.title',     descriptionKey: 'audit.report.prCockpitTrail.description',     title: 'PR Cockpit Approval Trail',         description: 'Every staged infrastructure change, who approved it, and merge result.',           mvpOrder: 6, derivability: 'auto' },
  { id: 'github-changes',       titleKey: 'audit.report.githubChanges.title',      descriptionKey: 'audit.report.githubChanges.description',      title: 'Code Change Management Report',     description: 'Branch protection, open/stale PRs, and review posture.',                           mvpOrder: 7, derivability: 'partial' },
  { id: 'supabase-security',    titleKey: 'audit.report.supabaseSecurity.title',   descriptionKey: 'audit.report.supabaseSecurity.description',   title: 'Database Security Report',          description: 'RLS coverage, public buckets, and service-role usage.',                            mvpOrder: 8, derivability: 'partial' },
  { id: 'stripe-config',        titleKey: 'audit.report.stripeConfig.title',       descriptionKey: 'audit.report.stripeConfig.description',       title: 'Billing Configuration Report',      description: 'Products, prices, webhook coverage, and live/test consistency.',                   mvpOrder: 9, derivability: 'auto' },
  { id: 'vercel-deployment',    titleKey: 'audit.report.vercelDeployment.title',   descriptionKey: 'audit.report.vercelDeployment.description',   title: 'Deployment & Env Var Report',       description: 'Production vs preview variables, exposed public vars, and deployment posture.',     mvpOrder: 10, derivability: 'auto' },
  { id: 'audit-log',            titleKey: 'audit.report.auditLog.title',           descriptionKey: 'audit.report.auditLog.description',           title: 'Audit Log & Activity Timeline',     description: 'Recorded actions, actors, and results from the Hub audit log.',                    mvpOrder: 11, derivability: 'auto' },
  { id: 'compliance-readiness', titleKey: 'audit.report.complianceReadiness.title', descriptionKey: 'audit.report.complianceReadiness.description', title: 'Compliance Readiness Matrix',      description: 'Readiness percentages against SOC 2, ISO 27001, NIST CSF, and CIS. Readiness only — not certification.', mvpOrder: 12, derivability: 'partial' },
]

export function reportMeta(id: ReportId): ReportMeta | undefined {
  return REPORT_REGISTRY.find(r => r.id === id)
}

export function mvpReportOrder(): ReportMeta[] {
  return REPORT_REGISTRY.filter(r => r.mvpOrder > 0).sort((a, b) => a.mvpOrder - b.mvpOrder)
}

export interface AuditReport<T = unknown> {
  ok: boolean
  reportId: ReportId
  title: string // resolved (translated) at generation time
  generatedAt: string
  summary: string
  score?: AuditScore
  rows: T[]
  findings?: Finding[]
  evidenceRequired?: number
  error?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Wording guard — refuse certification claims
// ─────────────────────────────────────────────────────────────────────────────

const BANNED_WORDING = [
  /soc\s*2\s*certified/i,
  /iso\s*27001\s*certified/i,
  /official(ly)?\s+compliant/i,
  /guaranteed\s+compliant/i,
  /certified\s+compliant/i,
  /we\s+certify/i,
]

export function checkSafeWording(text: string): { ok: boolean; violation?: string } {
  for (const re of BANNED_WORDING) {
    const m = re.exec(text || '')
    if (m) return { ok: false, violation: m[0] }
  }
  return { ok: true }
}

export function assertSafeWording(text: string): void {
  const v = checkSafeWording(text)
  if (!v.ok) throw new Error(`Unsafe compliance wording: "${v.violation}". Use readiness/assessment language.`)
}

/** Deterministic, language-independent finding id (hash of provider+category+basis). */
export function makeFindingId(provider: string, category: FindingCategory, basis: string): string {
  const s = `${provider}|${category}|${basis}`.toLowerCase()
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return `f_${h.toString(16)}`
}

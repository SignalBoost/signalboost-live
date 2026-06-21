// saas/lib/audit/reportModel.ts
//
// Audit Center — canonical data model.
//
// Every report in the Audit Center (Provider Inventory, Secrets, Identity,
// Stripe/Supabase/Vercel config, PR Cockpit trail, Compliance Matrix,
// Remediation Roadmap, Executive Summary) is a VIEW over the shapes defined
// here. This is the single spine: findings engine writes it, report generators
// read it, the UI renders it, PDF/CSV export it.
//
// Two load-bearing principles encoded in these types:
//   1. DETERMINISTIC CORE. Findings carry provenance (`derivedFrom`) and an
//      `evidenceRequired` flag. The LLM never invents a finding — it only
//      summarizes findings produced by the rules engine. The exec-summary
//      narrative consumes Finding[] + AuditScore, not raw provider data.
//   2. HONEST DERIVABILITY. Many checks customers expect (MFA state, last-login,
//      rotation age, termination status) are NOT exposed by provider REST APIs.
//      Those become `evidenceRequired` findings ("manual evidence"), never
//      fabricated facts. `Derivability` tags each report accordingly.
//
// Wording discipline is enforced in code: assertSafeWording() rejects any string
// that claims certification. We sell "readiness", never "SOC 2 certified".

import type { Severity } from './runner' // 'critical' | 'high' | 'medium' | 'low' | 'info'

export type { Severity }

// ─────────────────────────────────────────────────────────────────────────────
// 1. Findings — the atomic unit every report is built from
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

/** Where a finding's evidence came from — provenance is mandatory for trust. */
export type FindingSource =
  | 'stripe-api'
  | 'supabase-api'
  | 'vercel-api'
  | 'github-api'
  | 'hub-records'
  | 'pr-cockpit'
  | 'env-inventory'
  | 'manual' // requires a human to attach evidence; never auto-asserted as fact

export interface Finding {
  /** Deterministic, stable across runs (hash of provider+category+title). */
  id: string
  provider: string // 'github' | 'stripe' | ... | 'platform'
  category: FindingCategory
  severity: Severity
  title: string
  detail: string
  recommendation: string
  /** Plain-language consequence for a non-technical owner. */
  businessImpact?: string
  /** Which data source substantiates this. 'manual' = not auto-derivable. */
  derivedFrom: FindingSource
  /**
   * True when we cannot substantiate the check from available APIs and a human
   * must attach proof (e.g. MFA enabled, contractor offboarded). Rendered as
   * "evidence required", NEVER counted as a confirmed defect in the score.
   */
  evidenceRequired: boolean
  status: FindingStatus
  owner?: string
  dueDate?: string // ISO date
  /** Optional pointer the UI uses for the "Create PR fix" workflow. */
  suggestedFixTemplateId?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Scoring
// ─────────────────────────────────────────────────────────────────────────────

export interface AuditScore {
  /** 0–100, higher = more ready. */
  score: number
  critical: number
  high: number
  medium: number
  low: number
  info: number
  /** Findings we could not auto-verify (evidenceRequired) — excluded from score. */
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
 * Deterministic score. Evidence-required findings do NOT subtract points — we
 * have not proven a defect, only flagged a gap a human must verify. They are
 * counted separately so the report can surface "N items need manual evidence".
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
// 3. Per-report row shapes
// ─────────────────────────────────────────────────────────────────────────────

export type ConnectionStatus = 'connected' | 'missing' | 'error' | 'not_configured'

export interface ProviderInventoryRow {
  provider: string
  status: ConnectionStatus
  risk: Severity | 'unknown'
  category: string
  connectedBy?: string // from Hub records; 'unknown' when not tracked
  lastCheckedAt?: string
  note?: string
}

/** Secrets report row — METADATA ONLY. Never carries a real secret value. */
export interface SecretInventoryRow {
  name: string // e.g. 'STRIPE_SECRET_KEY'
  provider: string
  environment?: 'production' | 'preview' | 'development' | 'unknown'
  present: boolean
  maskedHint?: string // e.g. '[MASKED_PRESENT]' — never the value
  createdAt?: string
  lastRotatedAt?: string // often 'unknown' — provider APIs rarely expose this
  risk: Severity
  rotationRecommendation?: string
  rotationKnown: boolean // false → rotation age is manual evidence
}

// Identity & Access — raw access metadata only. We do NOT infer employment
// status (active employee vs terminated contractor); that is the customer's
// call. We report what the provider APIs expose: role/privilege, MFA state when
// available, and last-seen activity. Management uses the clean list to decide
// who to remove.

export type MfaState = 'enabled' | 'disabled' | 'unknown'
export type IdentityKind = 'user' | 'service_account' | 'access_key' | 'collaborator' | 'token'

/** Days without recorded activity/login before an identity is "stale". */
export const STALE_ACCESS_DAYS = 90

export interface IdentityRow {
  provider: string
  principal: string // email / username / service-account id / access-key id
  kind: IdentityKind
  role: string
  /** Owner/admin/root-equivalent privilege. */
  isPrivileged: boolean
  mfaState: MfaState // 'unknown' = provider does not expose it
  active: boolean
  lastSeen?: string // ISO; undefined = no activity ever recorded
  /** Days since lastSeen (or since creation if never seen). undefined when unknowable. */
  lastSeenDays?: number
  /** Computed: stale per STALE_ACCESS_DAYS, or privileged-without-active-MFA. */
  stale: boolean
  /** Human-readable flags, e.g. 'stale', 'privileged-no-mfa', 'never-logged-in'. */
  flags: string[]
}

/** Aggregate counts for the Identity & Access Review header. */
export interface IdentityAccessSummary {
  total: number
  privileged: number
  stale: number
  privilegedNoMfa: number
  mfaUnknown: number
}

/** Whole-number days since an ISO timestamp; undefined when input is absent/invalid. */
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

export interface RemediationItem {
  findingId: string
  title: string
  severity: Severity
  businessImpact: string
  recommendedFix: string
  owner?: string
  dueDate?: string
  status: FindingStatus
  evidenceRequired: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Compliance readiness — readiness %, NEVER certification
// ─────────────────────────────────────────────────────────────────────────────

export type ComplianceFramework = 'SOC2' | 'ISO27001' | 'NIST_CSF' | 'CIS'

export interface ComplianceReadinessRow {
  framework: ComplianceFramework
  domain: string // e.g. 'Security', 'Access Review', 'Change Management'
  readinessPercent: number // 0–100
  evidenceStrength: 'good' | 'partial' | 'weak' | 'missing'
  note?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Report envelope + registry
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

/** How much of a report we can produce automatically from available data. */
export type Derivability = 'auto' | 'partial' | 'manual'

export interface ReportMeta {
  id: ReportId
  /** Customer-safe title — passes assertSafeWording(). */
  title: string
  description: string
  /** MVP build order from the product spec (1 = build first). 0 = post-MVP. */
  mvpOrder: number
  derivability: Derivability
}

/**
 * The canonical registry. Titles use readiness/assessment language only.
 * MVP order mirrors the product spec: Exec Summary, Provider Inventory,
 * Identity & Access, Secrets/API Key, Remediation Roadmap.
 */
export const REPORT_REGISTRY: ReportMeta[] = [
  { id: 'executive-summary',   title: 'Executive Risk Summary',           description: 'Overall readiness score, finding counts, and top risks for owners and leadership.', mvpOrder: 1, derivability: 'auto' },
  { id: 'provider-inventory',  title: 'Provider Inventory Report',        description: 'Every connected provider with status, risk, and last-checked time.',               mvpOrder: 2, derivability: 'partial' },
  { id: 'identity-access',     title: 'Identity & Access Review',         description: 'Who has access, admin/owner rights, and stale or unverified accounts.',           mvpOrder: 3, derivability: 'partial' },
  { id: 'secrets-keys',        title: 'Secrets & API Key Exposure Report', description: 'Configured credentials by environment and rotation posture. Metadata only — no values.', mvpOrder: 4, derivability: 'partial' },
  { id: 'remediation-roadmap', title: 'Remediation Roadmap',             description: 'Prioritized fixes with business impact, owner, and due date.',                     mvpOrder: 5, derivability: 'auto' },
  { id: 'pr-cockpit-trail',    title: 'PR Cockpit Approval Trail',        description: 'Every staged infrastructure change, who approved it, and merge result.',          mvpOrder: 6, derivability: 'auto' },
  { id: 'github-changes',      title: 'Code Change Management Report',    description: 'Branch protection, open/stale PRs, and review posture.',                          mvpOrder: 7, derivability: 'partial' },
  { id: 'supabase-security',   title: 'Database Security Report',         description: 'RLS coverage, public buckets, and service-role usage.',                           mvpOrder: 8, derivability: 'partial' },
  { id: 'stripe-config',       title: 'Billing Configuration Report',     description: 'Products, prices, webhook coverage, and live/test consistency.',                  mvpOrder: 9, derivability: 'auto' },
  { id: 'vercel-deployment',   title: 'Deployment & Env Var Report',      description: 'Production vs preview variables, exposed public vars, and deployment posture.',    mvpOrder: 10, derivability: 'auto' },
  { id: 'audit-log',           title: 'Audit Log & Activity Timeline',    description: 'Recorded actions, actors, and results from the Hub audit log.',                   mvpOrder: 11, derivability: 'auto' },
  { id: 'compliance-readiness', title: 'Compliance Readiness Matrix',     description: 'Readiness percentages against SOC 2, ISO 27001, NIST CSF, and CIS. Readiness only — not certification.', mvpOrder: 12, derivability: 'partial' },
]

export function reportMeta(id: ReportId): ReportMeta | undefined {
  return REPORT_REGISTRY.find(r => r.id === id)
}

export function mvpReportOrder(): ReportMeta[] {
  return REPORT_REGISTRY.filter(r => r.mvpOrder > 0).sort((a, b) => a.mvpOrder - b.mvpOrder)
}

/** Generic report envelope. `rows` payload type varies per report. */
export interface AuditReport<T = unknown> {
  ok: boolean
  reportId: ReportId
  title: string
  generatedAt: string
  /** Short human summary line for the report header. */
  summary: string
  score?: AuditScore
  rows: T[]
  /** Findings backing this report (for the Remediation/Exec cross-links). */
  findings?: Finding[]
  /** Count of items needing manual evidence, surfaced in the header. */
  evidenceRequired?: number
  error?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Wording guard — refuse to ship certification claims
// ─────────────────────────────────────────────────────────────────────────────

const BANNED_WORDING = [
  /soc\s*2\s*certified/i,
  /iso\s*27001\s*certified/i,
  /official(ly)?\s+compliant/i,
  /guaranteed\s+compliant/i,
  /certified\s+compliant/i,
  /we\s+certify/i,
]

/**
 * Returns a safe-wording verdict for any customer-facing string. Use in tests
 * and before persisting/rendering report titles or summaries so a certification
 * claim can never reach a customer.
 */
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

/** Deterministic finding id so repeated runs produce stable, dedupable ids. */
export function makeFindingId(provider: string, category: FindingCategory, title: string): string {
  const basis = `${provider}|${category}|${title}`.toLowerCase()
  let h = 5381
  for (let i = 0; i < basis.length; i++) h = ((h << 5) + h + basis.charCodeAt(i)) >>> 0
  return `f_${h.toString(16)}`
}

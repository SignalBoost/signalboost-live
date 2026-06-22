// saas/lib/audit/complianceReport.ts
//
// Compliance Readiness Matrix generator. PURE — snapshot in, structured report
// out. No I/O, no LLM, no React. This is a READINESS VIEW over the findings the
// engine already produces: it maps each finding's category to a control family,
// then crosswalks each family to SOC 2 / ISO 27001 / NIST CSF / CIS references.
// It is a readiness indication only — NOT a certification or a formal audit.

import { runFindings, type AuditSnapshot } from '@/lib/audit/findingsEngine'
import { type Finding, type Severity, type FindingCategory } from '@/lib/audit/reportModel'

export type FrameworkId = 'soc2' | 'iso27001' | 'nist' | 'cis'
export type FamilyStatus = 'ready' | 'attention' | 'gap'

const FRAMEWORKS: FrameworkId[] = ['soc2', 'iso27001', 'nist', 'cis']
const NA = '—'

interface FamilyDef {
  id: string
  categories: FindingCategory[]
  refs: Record<FrameworkId, string>
}

// Control families and their (approximate) crosswalk references. Reference codes
// are indicative, to orient readiness — not an authoritative control mapping.
const FAMILIES: FamilyDef[] = [
  { id: 'accessControl',   categories: ['identity', 'access', 'authz'], refs: { soc2: 'CC6.1', iso27001: 'A.5.15', nist: 'PR.AA', cis: 'CIS 6' } },
  { id: 'changeManagement', categories: ['change-management'],          refs: { soc2: 'CC8.1', iso27001: 'A.8.32', nist: 'PR.PS', cis: 'CIS 4' } },
  { id: 'dataSecurity',    categories: ['database', 'rls-bypass'],      refs: { soc2: 'CC6.7', iso27001: 'A.8.24', nist: 'PR.DS', cis: 'CIS 3' } },
  { id: 'secrets',         categories: ['secret'],                      refs: { soc2: 'CC6.1', iso27001: 'A.8.24', nist: 'PR.DS-1', cis: 'CIS 3' } },
  { id: 'configuration',   categories: ['config', 'deployment'],        refs: { soc2: 'CC7.1', iso27001: 'A.8.9', nist: 'PR.PS-1', cis: 'CIS 4' } },
  { id: 'logging',         categories: ['audit-log'],                   refs: { soc2: 'CC7.2', iso27001: 'A.8.15', nist: 'DE.CM', cis: 'CIS 8' } },
  { id: 'inventory',       categories: ['inventory'],                   refs: { soc2: 'CC3.2', iso27001: 'A.5.9', nist: 'ID.AM', cis: 'CIS 1' } },
  { id: 'payments',        categories: ['billing'],                     refs: { soc2: 'PI1.1', iso27001: NA, nist: NA, cis: NA } },
]

export interface ComplianceFamilyRow {
  id: string
  status: FamilyStatus
  findingCount: number
  worst: Severity | null
  refs: Record<FrameworkId, string>
}

export interface FrameworkReadiness {
  id: FrameworkId
  ready: number
  total: number
  pct: number
}

export interface ComplianceReportData {
  generatedAt: string
  overallPct: number
  frameworks: FrameworkReadiness[]
  families: ComplianceFamilyRow[]
  summary: { families: number; ready: number; attention: number; gaps: number; openFindings: number }
}

const SEV_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }

function worstSeverity(findings: Finding[]): Severity | null {
  if (!findings.length) return null
  return findings.reduce<Severity>((acc, f) => (SEV_RANK[f.severity] < SEV_RANK[acc] ? f.severity : acc), 'info')
}

export function buildComplianceReport(snapshot: AuditSnapshot): ComplianceReportData {
  // Include the manual-evidence baseline: for readiness, unproven controls count.
  const all = runFindings(snapshot, { includeManualBaseline: true })
  const findings = all.findings || []

  const families: ComplianceFamilyRow[] = FAMILIES.map(def => {
    const matched = findings.filter(f => def.categories.indexOf(f.category) !== -1)
    const worst = worstSeverity(matched)
    let status: FamilyStatus
    if (matched.length === 0) status = 'ready'
    else if (worst === 'critical' || worst === 'high') status = 'gap'
    else status = 'attention'
    return { id: def.id, status, findingCount: matched.length, worst, refs: def.refs }
  })

  const frameworks: FrameworkReadiness[] = FRAMEWORKS.map(fw => {
    const applicable = families.filter(f => f.refs[fw] && f.refs[fw] !== NA)
    const ready = applicable.filter(f => f.status === 'ready').length
    const total = applicable.length
    return { id: fw, ready, total, pct: total ? Math.round((ready / total) * 100) : 100 }
  })

  const ready = families.filter(f => f.status === 'ready').length
  return {
    generatedAt: new Date().toISOString(),
    overallPct: families.length ? Math.round((ready / families.length) * 100) : 100,
    frameworks,
    families,
    summary: {
      families: families.length,
      ready,
      attention: families.filter(f => f.status === 'attention').length,
      gaps: families.filter(f => f.status === 'gap').length,
      openFindings: findings.length,
    },
  }
}

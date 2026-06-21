// saas/lib/audit/secretsReport.ts
//
// Secrets & API Key Exposure generator. PURE — snapshot in, structured report
// out. METADATA ONLY: a row never carries a secret value, only its name, the
// environment, presence, rotation posture, client-exposure flag, and a masked
// hint. No I/O, no LLM, no React.

import { runFindings, type AuditSnapshot } from '@/lib/audit/findingsEngine'
import { scoreFromFindings, type Finding, type AuditScore, type Severity } from '@/lib/audit/reportModel'

export interface SecretRow {
  name: string
  provider: string
  environment: 'production' | 'preview' | 'development' | 'unknown'
  present: boolean
  publicExposed: boolean
  rotationKnown: boolean
  lastRotatedAt?: string
  maskedHint: string // always '[MASKED_PRESENT]' or '[MISSING]' — never a value
  risk: Severity
}

export interface SecretsReportData {
  generatedAt: string
  rows: SecretRow[]
  findings: Finding[] // secret-category only
  score: AuditScore
  summary: { total: number; clientExposed: number; rotationUnknown: number }
}

const RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }

function riskFor(publicExposed: boolean, rotationKnown: boolean): Severity {
  if (publicExposed) return 'critical'
  if (!rotationKnown) return 'low'
  return 'info'
}

export function buildSecretsReport(snapshot: AuditSnapshot): SecretsReportData {
  const secrets = Array.isArray(snapshot.secrets) ? snapshot.secrets : []

  const rows: SecretRow[] = secrets.map(s => {
    const publicExposed = !!s.publicExposed
    const rotationKnown = !!s.rotationKnown
    return {
      name: s.name,
      provider: s.provider || 'platform',
      environment: s.environment || 'unknown',
      present: s.present !== false,
      publicExposed,
      rotationKnown,
      lastRotatedAt: s.lastRotatedAt,
      maskedHint: s.present !== false ? '[MASKED_PRESENT]' : '[MISSING]',
      risk: riskFor(publicExposed, rotationKnown),
    }
  })

  rows.sort((a, b) => RANK[a.risk] - RANK[b.risk] || a.name.localeCompare(b.name))

  const all = runFindings(snapshot, { includeManualBaseline: false })
  const findings = (all.findings || []).filter(f => f.category === 'secret')

  return {
    generatedAt: new Date().toISOString(),
    rows,
    findings,
    score: scoreFromFindings(findings),
    summary: {
      total: rows.length,
      clientExposed: rows.filter(r => r.publicExposed).length,
      rotationUnknown: rows.filter(r => !r.rotationKnown).length,
    },
  }
}

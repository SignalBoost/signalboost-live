// saas/lib/audit/vercelReport.ts
//
// Cloud / Deployment Configuration report generator (Vercel). PURE — snapshot
// in, structured report out. No I/O, no LLM, no React. Surfaces the deployment
// posture: environment-variable scopes (names only, never values), public
// sensitive-var exposure, production↔preview drift, plus vercel findings.

import { runFindings, type AuditSnapshot, type NormalizedVercel } from '@/lib/audit/findingsEngine'
import { scoreFromFindings, type Finding, type AuditScore } from '@/lib/audit/reportModel'

export interface VercelScopeRow {
  scope: string
  names: string[]
}

export interface VercelReportData {
  generatedAt: string
  configured: boolean
  scopes: VercelScopeRow[]
  findings: Finding[] // vercel-provider only
  score: AuditScore
  summary: {
    scopes: number
    totalVars: number
    publicSensitive: number // count of publicSensitiveEnv findings
    driftFlagged: boolean
  }
}

// Stable display order; unknown scopes fall to the end alphabetically.
const SCOPE_ORDER: Record<string, number> = { production: 0, preview: 1, development: 2 }

export function buildVercelReport(snapshot: AuditSnapshot): VercelReportData {
  const v: NormalizedVercel | undefined = snapshot.vercel
  const configured = !!(v && v.configured)

  const scopes: VercelScopeRow[] = ((v && v.envScopes) || [])
    .map(s => ({ scope: s.scope, names: (s.names || []).slice().sort((a, b) => a.localeCompare(b)) }))
    .sort((a, b) => {
      const ra = a.scope in SCOPE_ORDER ? SCOPE_ORDER[a.scope] : 99
      const rb = b.scope in SCOPE_ORDER ? SCOPE_ORDER[b.scope] : 99
      return ra - rb || a.scope.localeCompare(b.scope)
    })

  const all = runFindings(snapshot, { includeManualBaseline: false })
  const findings = (all.findings || []).filter(f => f.provider === 'vercel')

  return {
    generatedAt: new Date().toISOString(),
    configured,
    scopes,
    findings,
    score: scoreFromFindings(findings),
    summary: {
      scopes: scopes.length,
      totalVars: scopes.reduce((acc, s) => acc + s.names.length, 0),
      publicSensitive: findings.filter(f => f.messageKey === 'audit.finding.publicSensitiveEnv').length,
      driftFlagged: findings.some(f => f.messageKey === 'audit.finding.envScopeDrift'),
    },
  }
}

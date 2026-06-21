// saas/lib/audit/execSummary.ts
//
// Executive Risk Summary generator. PURE — snapshot in, structured summary out.
// No I/O, no LLM, no React. Runs the full findings engine across every provider,
// computes the readiness score and severity breakdown, and selects the top risks.
//
// The optional LLM narrative is produced by the route (server-side, resilient),
// NOT here — this module stays deterministic so the summary is identical on every
// run and never depends on a model being reachable.

import { runFindings, type AuditSnapshot } from '@/lib/audit/findingsEngine'
import {
  scoreFromFindings,
  type Finding,
  type AuditScore,
  type Severity,
} from '@/lib/audit/reportModel'

export interface ExecutiveSummaryData {
  generatedAt: string
  score: AuditScore
  /** Top actionable risks (excludes evidence-required), highest severity first. */
  topRisks: Finding[]
  /** Count of evidence-required items (gaps to verify, not proven defects). */
  evidenceRequired: number
  /** All findings, for drill-down. */
  findings: Finding[]
  /** Per-provider connection status snapshot, for the at-a-glance row. */
  providers: { id: string; status: string }[]
}

const RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }

export function buildExecutiveSummary(snapshot: AuditSnapshot, opts?: { topN?: number }): ExecutiveSummaryData {
  const topN = opts?.topN ?? 5
  const result = runFindings(snapshot, { includeManualBaseline: true })
  const findings = result.findings || []
  const score = scoreFromFindings(findings)

  const topRisks = findings
    .filter(f => !f.evidenceRequired)
    .sort((a, b) => RANK[a.severity] - RANK[b.severity])
    .slice(0, topN)

  const providers = (snapshot.providers || []).map(p => ({ id: p.id, status: p.status }))

  return {
    generatedAt: new Date().toISOString(),
    score,
    topRisks,
    evidenceRequired: score.evidenceRequired,
    findings,
    providers,
  }
}

/**
 * Deterministic English fact block handed to the LLM narrator. The model writes
 * prose ON TOP of these facts — it must never invent findings or numbers. Uses
 * the English `fallback` text so the model reasons in a single language; the
 * rendered UI still localizes every finding via t().
 */
export function execSummaryFacts(data: ExecutiveSummaryData): string {
  const s = data.score
  const lines: string[] = [
    `Readiness score: ${s.score}/100`,
    `Findings — critical: ${s.critical}, high: ${s.high}, medium: ${s.medium}, low: ${s.low}`,
    `Evidence-required items (gaps to verify, not penalized): ${data.evidenceRequired}`,
    `Providers: ${data.providers.map(p => `${p.id}=${p.status}`).join(', ') || 'none'}`,
    '',
    'Top risks:',
  ]
  if (data.topRisks.length === 0) {
    lines.push('- None above the reporting threshold.')
  } else {
    for (const f of data.topRisks) {
      lines.push(`- [${f.severity}] ${f.fallback.title} — ${f.fallback.detail}`)
    }
  }
  return lines.join('\n')
}

// saas/lib/audit/remediationRoadmap.ts
//
// Remediation Roadmap generator. PURE — snapshot in, sequenced plan out. Runs
// the full engine, then orders every actionable finding into Now / Next / Later
// tiers by severity, and puts evidence-required items on a separate track (they
// are gaps to verify, not proven defects, so they never gate the score and are
// not mixed into the fix queue).

import { runFindings, type AuditSnapshot } from '@/lib/audit/findingsEngine'
import { scoreFromFindings, type Finding, type AuditScore, type Severity } from '@/lib/audit/reportModel'

export type RemediationTier = 'now' | 'next' | 'later'

export interface RemediationEntry {
  finding: Finding
  tier: RemediationTier
}

export interface RemediationRoadmapData {
  generatedAt: string
  items: RemediationEntry[] // actionable, severity-ordered
  evidence: Finding[]       // evidence-required track
  score: AuditScore
  summary: { now: number; next: number; later: number; evidence: number; total: number }
}

const RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }

function tierFor(sev: Severity): RemediationTier {
  if (sev === 'critical') return 'now'
  if (sev === 'high') return 'next'
  return 'later'
}

export function buildRemediationRoadmap(snapshot: AuditSnapshot): RemediationRoadmapData {
  const result = runFindings(snapshot, { includeManualBaseline: true })
  const findings = result.findings || []

  const actionable = findings.filter(f => !f.evidenceRequired)
  const evidence = findings.filter(f => f.evidenceRequired)

  const items: RemediationEntry[] = actionable
    .slice()
    .sort((a, b) => RANK[a.severity] - RANK[b.severity])
    .map(finding => ({ finding, tier: tierFor(finding.severity) }))

  const summary = {
    now: items.filter(i => i.tier === 'now').length,
    next: items.filter(i => i.tier === 'next').length,
    later: items.filter(i => i.tier === 'later').length,
    evidence: evidence.length,
    total: items.length,
  }

  return {
    generatedAt: new Date().toISOString(),
    items,
    evidence,
    score: scoreFromFindings(findings),
    summary,
  }
}

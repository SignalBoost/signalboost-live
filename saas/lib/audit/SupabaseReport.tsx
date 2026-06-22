// saas/lib/audit/supabaseReport.ts
//
// Supabase / Database Security report generator. PURE — snapshot in, structured
// report out. No I/O, no LLM, no React. Surfaces the database security posture:
// per-table RLS status, public storage buckets, service-role client exposure,
// plus the supabase-category findings the engine derived.

import { runFindings, type AuditSnapshot, type NormalizedSupabase } from '@/lib/audit/findingsEngine'
import { scoreFromFindings, type Finding, type AuditScore } from '@/lib/audit/reportModel'

export interface SupabaseTableRow {
  name: string
  rlsEnabled: boolean
}

export interface SupabaseReportData {
  generatedAt: string
  configured: boolean
  projectHost?: string
  latencyMs?: number
  serviceRoleInClient: boolean
  tables: SupabaseTableRow[]
  publicBuckets: string[]
  findings: Finding[] // supabase-provider only
  score: AuditScore
  summary: {
    tables: number
    rlsDisabled: number
    publicBuckets: number
    serviceRoleInClient: boolean
  }
}

export function buildSupabaseReport(snapshot: AuditSnapshot): SupabaseReportData {
  const s: NormalizedSupabase | undefined = snapshot.supabase
  const configured = !!s && s.ok !== false

  const tables: SupabaseTableRow[] = ((s && s.tables) || [])
    .map(t => ({ name: t.name, rlsEnabled: !!t.rlsEnabled }))
    // RLS-disabled first (the risk), then alphabetical.
    .sort((a, b) => Number(a.rlsEnabled) - Number(b.rlsEnabled) || a.name.localeCompare(b.name))

  const publicBuckets: string[] = ((s && s.publicBuckets) || []).slice().sort()
  const serviceRoleInClient = !!(s && s.serviceRoleInClient)

  const all = runFindings(snapshot, { includeManualBaseline: false })
  const findings = (all.findings || []).filter(f => f.provider === 'supabase')

  return {
    generatedAt: new Date().toISOString(),
    configured,
    projectHost: s && s.projectHost,
    latencyMs: s && s.latencyMs,
    serviceRoleInClient,
    tables,
    publicBuckets,
    findings,
    score: scoreFromFindings(findings),
    summary: {
      tables: tables.length,
      rlsDisabled: tables.filter(t => !t.rlsEnabled).length,
      publicBuckets: publicBuckets.length,
      serviceRoleInClient,
    },
  }
}

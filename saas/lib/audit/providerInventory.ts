// saas/lib/audit/providerInventory.ts
//
// Provider Inventory generator. PURE — snapshot in, structured inventory out.
// No I/O, no LLM, no React. Lists every connected provider with its connection
// status, the risk level derived from its findings, and a finding count, plus
// the identity sources (hub / AWS) inferred from the snapshot's identities.

import { runFindings, type AuditSnapshot } from '@/lib/audit/findingsEngine'
import type { ConnectionStatus, Severity, Finding } from '@/lib/audit/reportModel'

export interface ProviderInventoryEntry {
  provider: string
  status: ConnectionStatus
  risk: Severity | 'unknown'
  category: string
  lastCheckedAt?: string
  findingCount: number
  evidenceRequired: number
  topSeverity?: Severity
}

export interface ProviderInventoryData {
  generatedAt: string
  rows: ProviderInventoryEntry[]
  summary: { total: number; connected: number; error: number; notConfigured: number }
}

const RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }

function highestSeverity(findings: Finding[]): Severity | undefined {
  let best: Severity | undefined
  for (const f of findings) {
    if (f.evidenceRequired) continue
    if (best === undefined || RANK[f.severity] < RANK[best]) best = f.severity
  }
  return best
}

function riskFor(status: ConnectionStatus, top: Severity | undefined): Severity | 'unknown' {
  if (top) return top
  if (status === 'error') return 'medium'
  if (status === 'not_configured' || status === 'missing') return 'unknown'
  return 'low'
}

export function buildProviderInventory(snapshot: AuditSnapshot): ProviderInventoryData {
  const result = runFindings(snapshot, { includeManualBaseline: true })
  const findings = result.findings || []
  const byProvider = new Map<string, Finding[]>()
  for (const f of findings) {
    const arr = byProvider.get(f.provider) || []
    arr.push(f)
    byProvider.set(f.provider, arr)
  }

  const checkedAt = snapshot.capturedAt
  const rows: ProviderInventoryEntry[] = []

  // Infra providers from the snapshot's provider list.
  for (const p of snapshot.providers || []) {
    const fs = byProvider.get(p.id) || []
    const top = highestSeverity(fs)
    rows.push({
      provider: p.id,
      status: p.status,
      risk: riskFor(p.status, top),
      category: p.category || 'other',
      lastCheckedAt: checkedAt,
      findingCount: fs.length,
      evidenceRequired: fs.filter(f => f.evidenceRequired).length,
      topSeverity: top,
    })
  }

  // Identity sources inferred from collected identities (hub / aws).
  const idProviders = new Set((snapshot.identities || []).map(i => i.provider))
  for (const idp of ['hub', 'aws']) {
    if (!idProviders.has(idp)) continue
    const fs = byProvider.get(idp) || []
    const top = highestSeverity(fs)
    rows.push({
      provider: idp,
      status: 'connected',
      risk: riskFor('connected', top),
      category: 'identity',
      lastCheckedAt: checkedAt,
      findingCount: fs.length,
      evidenceRequired: fs.filter(f => f.evidenceRequired).length,
      topSeverity: top,
    })
  }

  rows.sort((a, b) => {
    const ra = a.topSeverity ? RANK[a.topSeverity] : 9
    const rb = b.topSeverity ? RANK[b.topSeverity] : 9
    return ra - rb || a.provider.localeCompare(b.provider)
  })

  const summary = {
    total: rows.length,
    connected: rows.filter(r => r.status === 'connected').length,
    error: rows.filter(r => r.status === 'error').length,
    notConfigured: rows.filter(r => r.status === 'not_configured' || r.status === 'missing').length,
  }

  return { generatedAt: new Date().toISOString(), rows, summary }
}

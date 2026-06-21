// saas/lib/audit/reports.ts
//
// Pure report builders — no I/O, no React, no LLM.
// Each builder takes an AuditSnapshot and returns a typed report payload.
//
// Identity & Access report:
//   buildIdentityAccessReport(snapshot) → IdentityAccessReport
//
// Conventions:
//   - Non-strict TS: flat { ok, error? } results, no discriminated-union narrowing.
//   - No hardcoded prose. All display text lives in i18n keys; this module only
//     computes structured data (rows, findings, summary, score).

import type { AuditSnapshot } from './findingsEngine'
import { runFindings } from './findingsEngine'
import {
  type Finding,
  type IdentityRow,
  type IdentityAccessSummary,
  type AuditScore,
  type MfaState,
  STALE_ACCESS_DAYS,
  daysSince,
  summarizeIdentities,
  scoreFromFindings,
} from './reportModel'

// ─────────────────────────────────────────────────────────────────────────────
// Identity & Access report shape
// ─────────────────────────────────────────────────────────────────────────────

export interface IdentityAccessReport {
  ok: boolean
  generatedAt: string
  rows: IdentityRow[]
  findings: Finding[]
  summary: IdentityAccessSummary
  score: AuditScore
  error?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const PRIVILEGED_ROLE = /(owner|admin|root)/i

function toMfaState(mfaEnabled: boolean | undefined): MfaState {
  if (mfaEnabled === true) return 'enabled'
  if (mfaEnabled === false) return 'disabled'
  return 'unknown'
}

function isPrivileged(role: string | undefined, explicitFlag: boolean | undefined): boolean {
  if (typeof explicitFlag === 'boolean') return explicitFlag
  return PRIVILEGED_ROLE.test(role || '')
}

function buildFlags(row: {
  stale: boolean
  lastSeen: string | undefined
  mfaState: MfaState
  isPrivileged: boolean
}): string[] {
  const flags: string[] = []
  if (row.stale && row.lastSeen === undefined) flags.push('neverUsed')
  else if (row.stale) flags.push('stale')
  if (row.isPrivileged && row.mfaState === 'disabled') flags.push('privilegedNoMfa')
  if (row.mfaState === 'unknown') flags.push('mfaUnknown')
  return flags
}

// ─────────────────────────────────────────────────────────────────────────────
// Main builder
// ─────────────────────────────────────────────────────────────────────────────

export function buildIdentityAccessReport(snapshot: AuditSnapshot): IdentityAccessReport {
  const generatedAt = new Date().toISOString()

  try {
    const identities = Array.isArray(snapshot.identities) ? snapshot.identities : []

    // Map NormalizedIdentity → IdentityRow
    const rows: IdentityRow[] = identities.map(id => {
      const mfaState = toMfaState(id.mfaEnabled)
      const priv = isPrivileged(id.role, id.isPrivileged)
      const lastSeenDays = daysSince(id.lastActivity)
      const stale =
        lastSeenDays !== undefined
          ? lastSeenDays >= STALE_ACCESS_DAYS
          : (() => {
              // never-used: created long ago with no activity
              const ageDays = daysSince(id.createdAt)
              return ageDays !== undefined && ageDays >= STALE_ACCESS_DAYS
            })()

      const row: IdentityRow = {
        provider: id.provider,
        principal: id.principal,
        kind: id.kind,
        role: id.role || '',
        isPrivileged: priv,
        mfaState,
        active: id.active !== false,
        lastSeen: id.lastActivity,
        lastSeenDays,
        stale,
        flags: [],
      }
      row.flags = buildFlags({
        stale,
        lastSeen: id.lastActivity,
        mfaState,
        isPrivileged: priv,
      })
      return row
    })

    // Findings filtered to identity / access categories
    const findingsResult = runFindings(snapshot, { includeManualBaseline: false })
    const findings = findingsResult.ok
      ? findingsResult.findings.filter(
          f => f.category === 'identity' || f.category === 'access',
        )
      : []

    const summary = summarizeIdentities(rows)
    const score = scoreFromFindings(findings)

    return { ok: true, generatedAt, rows, findings, summary, score }
  } catch (err: any) {
    return {
      ok: false,
      generatedAt,
      rows: [],
      findings: [],
      summary: { total: 0, privileged: 0, stale: 0, privilegedNoMfa: 0, mfaUnknown: 0 },
      score: { score: 0, critical: 0, high: 0, medium: 0, low: 0, info: 0, evidenceRequired: 0, total: 0 },
      error: err?.message || 'Report builder failed.',
    }
  }
}

// saas/lib/audit/githubReport.ts
//
// GitHub / Software Development report generator. PURE — snapshot in, structured
// report out. No I/O, no LLM, no React. Surfaces the change-control posture:
// default-branch protection, collaborators (admins flagged), stale branches,
// open PRs, plus the github-category findings the engine derived.

import { runFindings, type AuditSnapshot, type NormalizedGithub } from '@/lib/audit/findingsEngine'
import { scoreFromFindings, type Finding, type AuditScore } from '@/lib/audit/reportModel'

export type BranchProtectionState = 'enforced' | 'missing' | 'unverified'

export interface GithubCollaborator {
  login: string
  role: string
  isAdmin: boolean
}

export interface GithubBranchRow {
  name: string
  ageDays: number
}

export interface GithubReportData {
  generatedAt: string
  configured: boolean
  defaultBranch: string
  branchProtection: BranchProtectionState
  openPRs: number
  collaborators: GithubCollaborator[]
  staleBranches: GithubBranchRow[]
  findings: Finding[] // github-provider only
  score: AuditScore
  summary: {
    collaborators: number
    admins: number
    staleBranches: number
    openPRs: number
    branchProtected: boolean
  }
}

// Roles that confer elevated (admin-equivalent) repo access on GitHub.
const ADMIN_ROLE = /admin|owner|maintain/i

function resolveProtection(g?: NormalizedGithub): BranchProtectionState {
  if (!g || g.branchProtection === undefined) return 'unverified'
  if (g.branchProtection === null || !g.branchProtection.requiresReview) return 'missing'
  return 'enforced'
}

export function buildGithubReport(snapshot: AuditSnapshot): GithubReportData {
  const g: NormalizedGithub | undefined = snapshot.github
  const configured = !!g && g.ok !== false
  const defaultBranch = (g && g.defaultBranch) || 'main'
  const branchProtection = resolveProtection(g)

  const collaborators: GithubCollaborator[] = ((g && g.collaborators) || []).map(c => ({
    login: c.login,
    role: c.role,
    isAdmin: ADMIN_ROLE.test(c.role || ''),
  }))
  collaborators.sort(
    (a, b) => Number(b.isAdmin) - Number(a.isAdmin) || a.login.localeCompare(b.login),
  )

  const staleBranches: GithubBranchRow[] = ((g && g.staleBranches) || [])
    .map(b => ({ name: b.name, ageDays: b.ageDays }))
    .sort((a, b) => b.ageDays - a.ageDays)

  const openPRs = g && typeof g.openPRs === 'number' ? g.openPRs : 0

  const all = runFindings(snapshot, { includeManualBaseline: false })
  const findings = (all.findings || []).filter(f => f.provider === 'github')

  return {
    generatedAt: new Date().toISOString(),
    configured,
    defaultBranch,
    branchProtection,
    openPRs,
    collaborators,
    staleBranches,
    findings,
    score: scoreFromFindings(findings),
    summary: {
      collaborators: collaborators.length,
      admins: collaborators.filter(c => c.isAdmin).length,
      staleBranches: staleBranches.length,
      openPRs,
      branchProtected: branchProtection === 'enforced',
    },
  }
}

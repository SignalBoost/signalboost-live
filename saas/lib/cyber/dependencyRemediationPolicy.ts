// Host-owned policy for reversible dependency proposal preparation only.
// This policy never grants merge, deployment, containment, or Stranger authority.
export const DEPENDENCY_PREPARATION_POLICY = 'dependency-proposal-v1'
export const DEPENDENCY_REPOSITORY = 'SignalBoost/signalboost-live'

export type ReviewState = {
  status: string
  human_approval_required?: boolean | null
  human_approved?: boolean | null
}

export function isTerminalRemediation(row: ReviewState): boolean {
  return ['completed', 'cancelled', 'rejected'].includes(row.status)
}

export function needsHumanApproval(row: ReviewState): boolean {
  // Missing policy metadata is not permission; terminal records are history.
  return row.status === 'awaiting_human_review'
    && row.human_approval_required !== false && row.human_approved !== true
}

export function partitionRemediationRequests<T extends ReviewState>(rows: T[]) {
  return {
    pending: rows.filter(needsHumanApproval),
    active: rows.filter(row => !isTerminalRemediation(row) && !needsHumanApproval(row)),
    history: rows.filter(isTerminalRemediation),
  }
}

export function routineDependencyState() {
  return {
    status: 'in_progress',
    human_approval_required: false,
    human_approved: false,
    approved_by: null,
    approved_at: null,
    fix_plan_status: 'ready_for_preparation',
    fix_plan_approved: false,
    fix_plan_approved_at: null,
    implementation_status: 'awaiting_github_pr_preparation',
  } as const
}

export function sameOriginCyberMutation(req: Request): boolean {
  const origin = req.headers.get('origin')
  if (req.headers.get('sec-fetch-site') === 'cross-site') return false
  return !origin || origin === new URL(req.url).origin
}

export type DependencyProposalChange = {
  packageName: string
  currentVersion: string
  targetVersion: string
  sourceFile: string
  advisoryId: string
}

function stableVersion(value: unknown): number[] | null {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)) return null
  const parts = value.split('.').map(Number)
  return parts.every(Number.isSafeInteger) ? parts : null
}

function compareVersion(a: string, b: string): number {
  const aa = stableVersion(a)!
  const bb = stableVersion(b)!
  for (let i = 0; i < 3; i++) if (aa[i] !== bb[i]) return aa[i] < bb[i] ? -1 : 1
  return 0
}

export function eligibleDependencyTarget(current: unknown, target: unknown): boolean {
  const a = stableVersion(current), b = stableVersion(target)
  // Unknown ranges, prereleases, downgrades and breaking-major changes require
  // more engineering evidence. They are not a request for a blanket approval.
  return !!a && !!b && a[0] === b[0] && (a[0] !== 0 || a[1] === b[1])
    && compareVersion(String(target), String(current)) > 0
}

export function trustedDependencyChanges(row: any, scan: any, now = Date.now()):
  { ok: true; changes: DependencyProposalChange[] } | { ok: false; reason: string } {
  if (row?.source_type !== 'dependency_scan' || row?.source_area !== 'cybersecurity')
    return { ok: false, reason: 'dependency_scan_required' }
  if (isTerminalRemediation(row)) return { ok: false, reason: 'terminal_request' }
  if (!row.user_id || scan?.user_id !== row.user_id || !row.source_id || scan?.id !== row.source_id)
    return { ok: false, reason: 'owned_scan_evidence_required' }
  const report = scan?.report
  if (report?.ok !== true || report?.repo !== DEPENDENCY_REPOSITORY
    || row.repo !== DEPENDENCY_REPOSITORY || report?.branch !== 'main')
    return { ok: false, reason: 'repository_scope_not_verified' }
  const generatedAt = Date.parse(report.generatedAt)
  if (!Number.isFinite(generatedAt) || generatedAt > now + 30_000 || now - generatedAt > 3_600_000)
    return { ok: false, reason: 'fresh_scan_evidence_required' }
  if (!Array.isArray(report.advisories) || report.advisories.length === 0 || report.advisories.length > 250)
    return { ok: false, reason: 'bounded_advisory_evidence_required' }

  const grouped = new Map<string, any[]>()
  for (const finding of report.advisories) {
    if (!finding || typeof finding.id !== 'string' || !finding.id.trim()
      || typeof finding.packageName !== 'string'
      || !/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(finding.packageName)
      || !['package.json', 'saas/package.json'].includes(finding.sourceFile)
      || !stableVersion(finding.version))
      return { ok: false, reason: 'direct_dependency_evidence_required' }
    const key = `${finding.sourceFile}:${finding.packageName}`
    grouped.set(key, [...(grouped.get(key) || []), finding])
  }
  const changes: DependencyProposalChange[] = []
  for (const findings of grouped.values()) {
    const first = findings[0]
    if (findings.some(f => f.version !== first.version)) return { ok: false, reason: 'conflicting_version_evidence' }
    const fixed = Array.isArray(first.fixedVersions) ? first.fixedVersions : []
    const candidates = fixed.filter((v: unknown): v is string => eligibleDependencyTarget(first.version, v)
      && findings.every(f => Array.isArray(f.fixedVersions) && f.fixedVersions.includes(v)))
    candidates.sort(compareVersion)
    const targetVersion = candidates[0]
    if (!targetVersion) return { ok: false, reason: 'compatible_fixed_version_evidence_required' }
    changes.push({ packageName: first.packageName, currentVersion: first.version,
      targetVersion, sourceFile: first.sourceFile, advisoryId: findings.map(f => f.id).join(', ') })
  }
  return { ok: true, changes }
}

export function updateVerifiedPackageJson(content: string, changes: DependencyProposalChange[]) {
  const json = JSON.parse(content)
  let changed = false
  for (const change of changes) {
    if (!eligibleDependencyTarget(change.currentVersion, change.targetVersion))
      throw new Error('compatible_fixed_version_evidence_required')
    let matched = false
    for (const group of ['dependencies', 'devDependencies', 'optionalDependencies']) {
      if (!Object.prototype.hasOwnProperty.call(json?.[group] || {}, change.packageName)) continue
      const spec = json[group][change.packageName]
      const match = typeof spec === 'string' ? spec.match(/^(\^|~)?(\d+\.\d+\.\d+)$/) : null
      if (!match || match[2] !== change.currentVersion) throw new Error('repository_version_changed_rescan_required')
      json[group][change.packageName] = `${match[1] || ''}${change.targetVersion}`
      matched = changed = true
    }
    if (!matched) throw new Error('direct_dependency_not_found')
  }
  if (!changed) throw new Error('no_verified_dependency_changes')
  return `${JSON.stringify(json, null, 2)}\n`
}

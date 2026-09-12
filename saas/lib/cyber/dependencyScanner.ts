// saas/lib/cyber/dependencyScanner.ts
// Cybersecurity Center MVP: dependency advisory scanner for public GitHub repos.
// Reads package manifests, checks exact dependency versions against OSV, and
// returns a normalized report suitable for monitoring and PDF/CSV export.

import { listRepoTree, parseRepoUrl, readRepoFileFrom, MAX_MANIFEST_FILE_CHARS, type RepoTarget } from '@/lib/audit/repoTarget'

export type CyberSeverity = 'critical' | 'high' | 'medium' | 'low' | 'unknown'

export interface DependencyPackage {
  name: string
  version: string
  sourceFile: string
  ecosystem: 'npm'
}

export interface DependencyAdvisory {
  id: string
  packageName: string
  version: string
  sourceFile: string
  severity: CyberSeverity
  summary: string
  detailsUrl?: string
  aliases: string[]
  fixedVersions?: string[]
  affectedRanges?: string[]
  detailStatus?: 'available' | 'unavailable'
}

export interface DependencyScanReport {
  ok: boolean
  generatedAt: string
  target: string
  repo?: string
  branch?: string
  packages: DependencyPackage[]
  advisories: DependencyAdvisory[]
  summary: {
    packagesScanned: number
    advisories: number
    critical: number
    high: number
    medium: number
    low: number
    unknown: number
  }
  error?: string
  /** Honest coverage of the inventory the advisories were checked against. */
  coverage?: {
    complete: boolean
    unreadableManifests: string[]
    capped: boolean
    /** Declared as a range with no lockfile entry: requirement known, installed version unknown. */
    unresolvedRanges: string[]
    maxPackages: number
    note?: string
  }
}

export type DependencyScanProgress = {
  stage: 'starting' | 'repository' | 'manifests' | 'packages' | 'advisories' | 'report'
  progress: number
  message: string
  done?: number
  total?: number
  at: string
}

export type DependencyScanProgressHandler = (progress: DependencyScanProgress) => void

function emitProgress(handler: DependencyScanProgressHandler | undefined, progress: Omit<DependencyScanProgress, 'at'>) {
  handler?.({ ...progress, at: new Date().toISOString() })
}

const DEFAULT_REPO = process.env.AUDIT_GITHUB_REPO || 'SignalBoost/signalboost-live'
const MAX_MANIFESTS = 25
const MAX_PACKAGES = 250
const EXACT_VERSION = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/

function targetFromInput(input?: string): RepoTarget {
  const raw = String(input || '').trim()
  const parsed = parseRepoUrl(raw)
  return parsed || { repo: DEFAULT_REPO, branch: '', subPath: '', raw: raw || `https://github.com/${DEFAULT_REPO}` }
}

/**
 * A resolved version is a version that is actually installed, as recorded in a lockfile.
 * Only an exact version qualifies: "8.5.20" is installed, "^8.4.31" is a range whose floor may be
 * years old and is very likely NOT what the tree resolves to. Scanning a range floor as if it were
 * installed produces advisories against a version the repository does not have.
 */
function resolvedVersion(value: unknown): string | null {
  const v = String(value || '').trim()
  if (!v) return null
  return EXACT_VERSION.test(v) ? v : null
}

/** True when the declared spec pins one exact version, so the manifest alone states what is installed. */
export function isExactVersionSpec(value: unknown): boolean {
  return resolvedVersion(value) !== null
}

function addPackage(out: Map<string, DependencyPackage>, name: string, version: string | null, sourceFile: string) {
  if (!name || !version) return
  const key = `${name}@${version}`
  if (!out.has(key)) out.set(key, { name, version, sourceFile, ecosystem: 'npm' })
}

/**
 * package.json states requirements, not installations. Only an exactly pinned spec is scannable;
 * every range is left to the lockfile, and reported as unresolved when no lockfile supplies it.
 */
function fromPackageJson(content: string, sourceFile: string, out: Map<string, DependencyPackage>, ranged: Map<string, string>) {
  try {
    const pkg = JSON.parse(content)
    for (const group of ['dependencies', 'devDependencies', 'optionalDependencies']) {
      const deps = pkg?.[group]
      if (!deps || typeof deps !== 'object') continue
      for (const [name, spec] of Object.entries(deps)) {
        const exact = resolvedVersion(spec)
        if (exact) addPackage(out, name, exact, sourceFile)
        else if (String(spec || '').trim()) ranged.set(name, String(spec).trim().slice(0, 100))
      }
    }
  } catch { /* malformed package.json is ignored by dependency scanner */ }
}

function fromPackageLock(content: string, sourceFile: string, out: Map<string, DependencyPackage>) {
  try {
    const lock = JSON.parse(content)
    const packages = lock?.packages
    if (packages && typeof packages === 'object') {
      for (const [path, meta] of Object.entries(packages as Record<string, any>)) {
        if (!String(path).startsWith('node_modules/')) continue
        const name = String(path).replace(/^node_modules\//, '')
        addPackage(out, name, resolvedVersion(meta?.version), sourceFile)
      }
    }
    const deps = lock?.dependencies
    if (deps && typeof deps === 'object') {
      for (const [name, meta] of Object.entries(deps as Record<string, any>)) addPackage(out, name, resolvedVersion(meta?.version), sourceFile)
    }
  } catch { /* ignore */ }
}

async function collectPackages(target: RepoTarget, maxPackages: number, onProgress?: DependencyScanProgressHandler): Promise<{ ok: boolean; branch: string; packages: DependencyPackage[]; error?: string; unreadableManifests: string[]; capped: boolean; unresolvedRanges: string[] }> {
  emitProgress(onProgress, { stage: 'repository', progress: 10, message: 'Connecting to GitHub and reading the repository tree.' })
  const tree = await listRepoTree(target.repo, target.branch)
  if (!tree.ok) return { ok: false, branch: tree.branch, packages: [], error: tree.error, unreadableManifests: [], capped: false, unresolvedRanges: [] }
  target.branch = tree.branch

  const scoped = target.subPath ? tree.files.filter(f => f.startsWith(target.subPath)) : tree.files
  const manifests = scoped
    .filter(f => /(^|\/)(package\.json|package-lock\.json)$/i.test(f))
    .filter(f => !/node_modules\//i.test(f))
    .slice(0, MAX_MANIFESTS)

  emitProgress(onProgress, { stage: 'manifests', progress: 22, message: 'Package manifests located.', done: 0, total: manifests.length })
  const out = new Map<string, DependencyPackage>()
  // A manifest that cannot be read whole is reported, never silently skipped: a partial inventory
  // would otherwise be summarised as a clean scan.
  const unreadableManifests: string[] = []
  // Ranges seen in package.json; any name the lockfile later resolves is removed below.
  const ranged = new Map<string, string>()
  for (let index = 0; index < manifests.length; index += 1) {
    const file = manifests[index]
    const res = await readRepoFileFrom(target.repo, target.branch, file, { maxChars: MAX_MANIFEST_FILE_CHARS })
    if (!res.ok || !res.content || res.truncated) { unreadableManifests.push(file); continue }
    const before = out.size
    if (file.endsWith('package-lock.json')) fromPackageLock(res.content, file, out)
    else if (file.endsWith('package.json')) fromPackageJson(res.content, file, out, ranged)
    if (out.size === before && file.endsWith('package-lock.json')) unreadableManifests.push(file)
    emitProgress(onProgress, {
      stage: 'manifests',
      progress: Math.min(55, 22 + Math.round(((index + 1) / Math.max(1, manifests.length)) * 33)),
      message: 'Reading package manifests.',
      done: index + 1,
      total: manifests.length,
    })
    if (out.size >= maxPackages) break
  }

  const resolvedNames = new Set(Array.from(out.values()).map(pkg => pkg.name))
  const unresolvedRanges = Array.from(ranged.entries())
    .filter(([name]) => !resolvedNames.has(name))
    .map(([name, spec]) => `${name}@${spec}`)
    .sort()
  return {
    ok: true, branch: target.branch, packages: Array.from(out.values()).slice(0, maxPackages),
    unreadableManifests, capped: out.size > maxPackages, unresolvedRanges,
  }
}

// OSV querybatch returns IDs/modified only. Detail records are fetched separately,
// once per ID, with bounded concurrency and a shared deadline. No external URL
// or browser-supplied advisory is allowed to provide preparation authority.
function severityFromVuln(v: any, affected: any[]): CyberSeverity {
  const levels: Record<string, CyberSeverity> = { critical: 'critical', high: 'high', moderate: 'medium', medium: 'medium', low: 'low' }
  const candidates = [v?.database_specific?.severity, ...affected.map(a => a?.ecosystem_specific?.severity)]
  const rank: Record<CyberSeverity, number> = { critical: 4, high: 3, medium: 2, low: 1, unknown: 0 }
  let found: CyberSeverity = 'unknown'
  for (const value of candidates) {
    const severity = typeof value === 'string' ? levels[value.trim().toLowerCase()] : undefined
    if (severity && rank[severity] > rank[found]) found = severity
  }
  // OSV severity[].score is a CVSS vector, not a decimal or a severity label.
  // Unsupported scoring methods remain unknown; never infer a score from prose.
  return found
}

function unique(values: string[]): string[] { return [...new Set(values)] }

function stableParts(value: unknown): number[] | null {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)) return null
  const parts = value.split('.').map(Number)
  return parts.every(Number.isSafeInteger) ? parts : null
}

function compareStable(a: number[], b: number[]): number {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1
  return 0
}

// Fixed boundaries from older/future intervals are descriptive history, not
// targets for the queried version. Unknown boundaries never grant plan evidence.
function applicableFixedVersions(events: any[], currentVersion: string): string[] {
  const current = stableParts(currentVersion)
  if (!current) return []
  const fixed: string[] = []
  let introduced: string | null = null
  for (const event of events) {
    if (!event || typeof event !== 'object' || Array.isArray(event)) { introduced = null; continue }
    const keys = ['introduced', 'fixed', 'last_affected', 'limit'].filter(k => Object.hasOwn(event, k))
    if (keys.length !== 1) { introduced = null; continue }
    if (keys[0] === 'introduced') {
      introduced = typeof event.introduced === 'string' ? event.introduced : null
      continue
    }
    if (keys[0] === 'fixed' && introduced !== null) {
      const lower = stableParts(introduced)
      const upper = stableParts(event.fixed)
      if ((introduced === '0' || (lower && compareStable(lower, current) <= 0))
        && upper && compareStable(current, upper) < 0
        && upper[0] === current[0] && (current[0] !== 0 || upper[1] === current[1])) fixed.push(event.fixed)
    }
    introduced = null
  }
  return fixed
}

function normalizeAdvisory(id: string, pkg: DependencyPackage, detail: any): DependencyAdvisory {
  const affected = Array.isArray(detail?.affected) ? detail.affected.filter((a: any) =>
    a?.package?.ecosystem === pkg.ecosystem && a?.package?.name === pkg.name) : []
  const valid = detail?.id === id && affected.length > 0 && !detail.withdrawn
  const fallback = `https://osv.dev/vulnerability/${encodeURIComponent(id)}`
  if (!valid) return { id, packageName: pkg.name, version: pkg.version, sourceFile: pkg.sourceFile,
    severity: 'unknown', summary: 'Advisory details unavailable or not verified for this package. Severity and patched versions are unconfirmed.',
    detailsUrl: fallback, aliases: [], fixedVersions: [], affectedRanges: [], detailStatus: 'unavailable' }
  const fixedVersions: string[] = []
  const affectedRanges: string[] = []
  for (const a of affected) for (const range of (Array.isArray(a.ranges) ? a.ranges : [])) {
    if (!['SEMVER', 'ECOSYSTEM'].includes(range?.type)) continue
    const events = Array.isArray(range.events) ? range.events : []
    fixedVersions.push(...applicableFixedVersions(events, pkg.version))
    const pieces: string[] = []
    for (const event of events) {
      for (const key of ['introduced', 'fixed', 'last_affected', 'limit']) {
        if (typeof event?.[key] === 'string') pieces.push(`${key.replace('_', ' ')} ${event[key]}`)
      }
    }
    if (pieces.length) affectedRanges.push(pieces.join(' → '))
  }
  const references = Array.isArray(detail.references) ? detail.references : []
  const safe = (value: unknown): value is string => {
    if (typeof value !== 'string') return false
    try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password } catch { return false }
  }
  const reference = references.find((r: any) => r?.type === 'ADVISORY' && safe(r.url))
    || references.find((r: any) => safe(r?.url))
  const description = [detail.summary, detail.details].find(v => typeof v === 'string' && v.trim())
  return { id, packageName: pkg.name, version: pkg.version, sourceFile: pkg.sourceFile,
    severity: severityFromVuln(detail, affected), summary: description ? description.trim().slice(0, 500) : 'The advisory source did not provide a description.',
    detailsUrl: reference?.url || fallback,
    aliases: Array.isArray(detail.aliases) ? detail.aliases.filter((v: unknown): v is string => typeof v === 'string').slice(0, 50) : [],
    fixedVersions: unique(fixedVersions).sort((a, b) => compareStable(stableParts(a)!, stableParts(b)!)), affectedRanges: unique(affectedRanges).slice(0, 12), detailStatus: 'available' }
}

async function queryOsv(packages: DependencyPackage[]): Promise<DependencyAdvisory[]> {
  if (packages.length === 0) return []
  const deadline = Date.now() + 45_000
  async function request(url: string, init: RequestInit = {}): Promise<any> {
    const remaining = deadline - Date.now()
    if (remaining <= 0) throw new Error('OSV lookup deadline exceeded')
    const res = await fetch(url, { ...init, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(Math.min(10_000, remaining)) })
    if (!res.ok) throw new Error(`OSV request failed HTTP ${res.status}`)
    return res.json()
  }
  const hits = packages.map(() => new Set<string>())
  let pending = packages.map((pkg, index) => ({ index, query: { package: { ecosystem: pkg.ecosystem, name: pkg.name }, version: pkg.version, page_token: undefined as string | undefined } }))
  const tokens = new Set<string>()
  for (let page = 0; pending.length; page++) {
    if (page >= 5) throw new Error('OSV pagination limit reached; scan coverage is incomplete')
    const json = await request('https://api.osv.dev/v1/querybatch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ queries: pending.map(p => p.query) }),
    })
    if (!Array.isArray(json?.results) || json.results.length !== pending.length)
      throw new Error('OSV batch response is incomplete')
    const next: typeof pending = []
    for (let i = 0; i < pending.length; i++) {
      const r = json.results[i]
      if (!r || typeof r !== 'object' || Array.isArray(r) || (r.vulns !== undefined && !Array.isArray(r.vulns)))
        throw new Error('OSV batch response is malformed')
      for (const v of r.vulns || []) {
        if (typeof v?.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(v.id))
          throw new Error('OSV advisory identity is malformed')
        hits[pending[i].index].add(v.id)
        if (hits[pending[i].index].size > 500) throw new Error('OSV advisory limit reached; scan coverage is incomplete')
      }
      if (r.next_page_token) {
        if (typeof r.next_page_token !== 'string' || r.next_page_token.length > 4096) throw new Error('OSV page token is malformed')
        const key = `${pending[i].index}:${r.next_page_token}`
        if (tokens.has(key)) throw new Error('OSV repeated a page token; scan coverage is incomplete')
        tokens.add(key)
        next.push({ index: pending[i].index, query: { ...pending[i].query, page_token: r.next_page_token } })
      }
    }
    pending = next
  }
  const ids = unique(hits.flatMap(set => [...set]))
  const details = new Map<string, any>()
  // IDs beyond the detail budget remain visible as unknown; no finding is dropped.
  const boundedIds = ids.slice(0, 250)
  let cursor = 0
  await Promise.all(Array.from({ length: Math.min(4, boundedIds.length) }, async () => {
    while (cursor < boundedIds.length) {
      const id = boundedIds[cursor++]
      try { details.set(id, await request(`https://api.osv.dev/v1/vulns/${encodeURIComponent(id)}`)) }
      catch { details.set(id, null) }
    }
  }))
  return packages.flatMap((pkg, index) => [...hits[index]].map(id => normalizeAdvisory(id, pkg, details.get(id))))
}

/**
 * Coverage is reported, never assumed. An unread manifest or a capped inventory means the advisory
 * result describes part of the dependency tree, and the report says so instead of implying a clean scan.
 */
function buildCoverage(
  unreadableManifests: string[],
  capped: boolean,
  maxPackages: number,
  unresolvedRanges: string[],
): DependencyScanReport['coverage'] {
  const complete = unreadableManifests.length === 0 && !capped && unresolvedRanges.length === 0
  const notes: string[] = []
  if (unreadableManifests.length) notes.push(`${unreadableManifests.length} manifest(s) could not be read in full: ${unreadableManifests.slice(0, 5).join(', ')}.`)
  if (capped) notes.push(`The inventory reached the ${maxPackages}-package limit for this scan, so later packages were not checked.`)
  if (unresolvedRanges.length) notes.push(`${unresolvedRanges.length} dependency range(s) have no lockfile entry, so the installed version is unknown and they were not checked: ${unresolvedRanges.slice(0, 5).join(', ')}.`)
  return {
    complete,
    unreadableManifests,
    capped,
    maxPackages,
    unresolvedRanges,
    note: complete ? undefined : `${notes.join(' ')} These findings cover part of the dependency tree, not all of it.`,
  }
}

function summarize(packages: DependencyPackage[], advisories: DependencyAdvisory[]): DependencyScanReport['summary'] {
  const summary = { packagesScanned: packages.length, advisories: advisories.length, critical: 0, high: 0, medium: 0, low: 0, unknown: 0 }
  for (const a of advisories) summary[a.severity]++
  return summary
}

export async function scanDependencyAdvisories(opts?: { url?: string; maxPackages?: number; onProgress?: DependencyScanProgressHandler }): Promise<DependencyScanReport> {
  const target = targetFromInput(opts?.url)
  const maxPackages = Math.max(1, Math.min(Number(opts?.maxPackages || 120), MAX_PACKAGES))
  const generatedAt = new Date().toISOString()
  const targetLabel = target.raw || `https://github.com/${target.repo}`
  emitProgress(opts?.onProgress, { stage: 'starting', progress: 4, message: 'Starting dependency advisory scan.' })

  try {
    const collected = await collectPackages(target, maxPackages, opts?.onProgress)
    if (!collected.ok) {
      return { ok: false, generatedAt, target: targetLabel, repo: target.repo, branch: collected.branch, packages: [], advisories: [], summary: summarize([], []), error: collected.error || 'Could not collect packages.' }
    }
    emitProgress(opts?.onProgress, { stage: 'packages', progress: 60, message: `Dependency inventory ready: ${collected.packages.length} exact package version(s).`, done: collected.packages.length, total: collected.packages.length })
    emitProgress(opts?.onProgress, { stage: 'advisories', progress: 68, message: 'Checking exact package versions against OSV advisories.' })
    const advisories = await queryOsv(collected.packages)
    emitProgress(opts?.onProgress, { stage: 'advisories', progress: 86, message: `Advisory check completed: ${advisories.length} finding(s).`, done: collected.packages.length, total: collected.packages.length })
    advisories.sort((a, b) => {
      const rank: Record<CyberSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3, unknown: 4 }
      return rank[a.severity] - rank[b.severity] || a.packageName.localeCompare(b.packageName)
    })
    emitProgress(opts?.onProgress, { stage: 'report', progress: 90, message: 'Building the cybersecurity report.' })
    const coverage = buildCoverage(collected.unreadableManifests, collected.capped, maxPackages, collected.unresolvedRanges)
    return { ok: true, generatedAt, target: targetLabel, repo: target.repo, branch: collected.branch, packages: collected.packages, advisories, summary: summarize(collected.packages, advisories), coverage }
  } catch (err) {
    return { ok: false, generatedAt, target: targetLabel, repo: target.repo, branch: target.branch, packages: [], advisories: [], summary: summarize([], []), error: err instanceof Error ? err.message : 'Dependency advisory scan failed.' }
  }
}

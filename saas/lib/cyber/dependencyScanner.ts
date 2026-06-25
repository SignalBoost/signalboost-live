// saas/lib/cyber/dependencyScanner.ts
// Cybersecurity Center MVP: dependency advisory scanner for public GitHub repos.
// Reads package manifests, checks exact dependency versions against OSV, and
// returns a normalized report suitable for monitoring and PDF/CSV export.

import { listRepoTree, parseRepoUrl, readRepoFileFrom, type RepoTarget } from '@/lib/audit/repoTarget'

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

function cleanVersion(value: unknown): string | null {
  const v = String(value || '').trim()
  if (!v) return null
  const cleaned = v.replace(/^[~^=<>\s]+/, '').trim()
  return EXACT_VERSION.test(cleaned) ? cleaned : null
}

function addPackage(out: Map<string, DependencyPackage>, name: string, version: string | null, sourceFile: string) {
  if (!name || !version) return
  const key = `${name}@${version}`
  if (!out.has(key)) out.set(key, { name, version, sourceFile, ecosystem: 'npm' })
}

function fromPackageJson(content: string, sourceFile: string, out: Map<string, DependencyPackage>) {
  try {
    const pkg = JSON.parse(content)
    for (const group of ['dependencies', 'devDependencies', 'optionalDependencies']) {
      const deps = pkg?.[group]
      if (!deps || typeof deps !== 'object') continue
      for (const [name, spec] of Object.entries(deps)) addPackage(out, name, cleanVersion(spec), sourceFile)
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
        addPackage(out, name, cleanVersion(meta?.version), sourceFile)
      }
    }
    const deps = lock?.dependencies
    if (deps && typeof deps === 'object') {
      for (const [name, meta] of Object.entries(deps as Record<string, any>)) addPackage(out, name, cleanVersion(meta?.version), sourceFile)
    }
  } catch { /* ignore */ }
}

async function collectPackages(target: RepoTarget, maxPackages: number): Promise<{ ok: boolean; branch: string; packages: DependencyPackage[]; error?: string }> {
  const tree = await listRepoTree(target.repo, target.branch)
  if (!tree.ok) return { ok: false, branch: tree.branch, packages: [], error: tree.error }
  target.branch = tree.branch

  const scoped = target.subPath ? tree.files.filter(f => f.startsWith(target.subPath)) : tree.files
  const manifests = scoped
    .filter(f => /(^|\/)(package\.json|package-lock\.json)$/i.test(f))
    .filter(f => !/node_modules\//i.test(f))
    .slice(0, MAX_MANIFESTS)

  const out = new Map<string, DependencyPackage>()
  for (const file of manifests) {
    const res = await readRepoFileFrom(target.repo, target.branch, file)
    if (!res.ok || !res.content) continue
    if (file.endsWith('package-lock.json')) fromPackageLock(res.content, file, out)
    else if (file.endsWith('package.json')) fromPackageJson(res.content, file, out)
    if (out.size >= maxPackages) break
  }

  return { ok: true, branch: target.branch, packages: Array.from(out.values()).slice(0, maxPackages) }
}

function severityFromVuln(v: any): CyberSeverity {
  const sev = String(v?.database_specific?.severity || v?.severity?.[0]?.score || '').toLowerCase()
  if (sev.includes('critical') || sev.startsWith('9') || sev.startsWith('10')) return 'critical'
  if (sev.includes('high') || /^[78]/.test(sev)) return 'high'
  if (sev.includes('medium') || /^[456]/.test(sev)) return 'medium'
  if (sev.includes('low') || /^[123]/.test(sev)) return 'low'
  return 'unknown'
}

async function queryOsv(packages: DependencyPackage[]): Promise<DependencyAdvisory[]> {
  if (packages.length === 0) return []
  const queries = packages.map(p => ({ package: { ecosystem: 'npm', name: p.name }, version: p.version }))
  const res = await fetch('https://api.osv.dev/v1/querybatch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ queries }),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`OSV request failed HTTP ${res.status}`)
  const json = await res.json()
  const results = Array.isArray(json?.results) ? json.results : []
  const advisories: DependencyAdvisory[] = []

  results.forEach((r: any, idx: number) => {
    const pkg = packages[idx]
    const vulns = Array.isArray(r?.vulns) ? r.vulns : []
    for (const v of vulns) {
      advisories.push({
        id: String(v?.id || 'unknown'),
        packageName: pkg.name,
        version: pkg.version,
        sourceFile: pkg.sourceFile,
        severity: severityFromVuln(v),
        summary: String(v?.summary || v?.details || 'Dependency advisory found.').slice(0, 500),
        detailsUrl: Array.isArray(v?.references) && v.references[0]?.url ? String(v.references[0].url) : undefined,
        aliases: Array.isArray(v?.aliases) ? v.aliases.map((a: any) => String(a)) : [],
      })
    }
  })

  return advisories
}

function summarize(packages: DependencyPackage[], advisories: DependencyAdvisory[]): DependencyScanReport['summary'] {
  const summary = { packagesScanned: packages.length, advisories: advisories.length, critical: 0, high: 0, medium: 0, low: 0, unknown: 0 }
  for (const a of advisories) summary[a.severity]++
  return summary
}

export async function scanDependencyAdvisories(opts?: { url?: string; maxPackages?: number }): Promise<DependencyScanReport> {
  const target = targetFromInput(opts?.url)
  const maxPackages = Math.max(1, Math.min(Number(opts?.maxPackages || 120), MAX_PACKAGES))
  const generatedAt = new Date().toISOString()
  const targetLabel = target.raw || `https://github.com/${target.repo}`

  try {
    const collected = await collectPackages(target, maxPackages)
    if (!collected.ok) {
      return { ok: false, generatedAt, target: targetLabel, repo: target.repo, branch: collected.branch, packages: [], advisories: [], summary: summarize([], []), error: collected.error || 'Could not collect packages.' }
    }
    const advisories = await queryOsv(collected.packages)
    advisories.sort((a, b) => {
      const rank: Record<CyberSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3, unknown: 4 }
      return rank[a.severity] - rank[b.severity] || a.packageName.localeCompare(b.packageName)
    })
    return { ok: true, generatedAt, target: targetLabel, repo: target.repo, branch: collected.branch, packages: collected.packages, advisories, summary: summarize(collected.packages, advisories) }
  } catch (err) {
    return { ok: false, generatedAt, target: targetLabel, repo: target.repo, branch: target.branch, packages: [], advisories: [], summary: summarize([], []), error: err instanceof Error ? err.message : 'Dependency advisory scan failed.' }
  }
}

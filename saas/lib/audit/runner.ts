// saas/lib/audit/runner.ts
// The analyzer runner the audit endpoint triggers.
// v3: accepts a full GitHub repository URL (or owner/repo, or a path prefix on the
// default repo). It lists the ENTIRE repo tree (the macro map), deep-scans a
// prioritized, budget-capped subset of files across the whole repo, then hands the
// findings PLUS the full tree to the synthesis pass for a holistic narrative report.
// Public repos only (private repos return a clear error from repoTarget).

import { callAuditModel } from '@/lib/audit/modelRouter'
import { synthesizeReport } from '@/lib/audit/synthesize'
import { runUxDetector } from '@/lib/audit/uxDetector'
import { parseRepoUrl, listRepoTree, readRepoFileFrom, type RepoTarget } from '@/lib/audit/repoTarget'

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info'

export interface AuditFinding {
  file:           string
  severity:       Severity
  category:       string
  title:          string
  detail:         string
  recommendation: string
  line?:          number
}

export interface AuditRunResult {
  ok:           boolean
  findings:     AuditFinding[]
  filesScanned: string[]
  repo?:        string
  narrative?:   string
  error?:       string
}

const SCANNABLE   = /\.(ts|tsx|js|jsx|sql)$/i
const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low', 'info']
const MAX_CAP     = 60
const CONCURRENCY = 4
const AUDIT_REPO  = process.env.AUDIT_GITHUB_REPO || 'SignalBoost/signalboost-live'

// Reduce a GitHub URL to an in-repo sub-path (used when the input targets the
// DEFAULT repo rather than a full external URL).
export function normalizeScanPath(input?: string): string {
  let p = String(input || '').trim()
  if (!p) return ''
  const m = p.match(/github\.com\/[^/]+\/[^/]+(?:\/(?:tree|blob)\/[^/]+)?\/?(.*)$/i)
  if (m) p = m[1] || ''
  return p.replace(/^\/+/, '').replace(/\/+$/, '')
}

// Security-relevant files first, so a budget-capped scan still covers the riskiest
// surface even when the repo is far larger than MAX FILES.
function priority(path: string): number {
  const p = path.toLowerCase()
  if (/(^|\/)(middleware\.|next\.config|package\.json)/.test(p)) return 0
  if (p.includes('/api/') || /\/route\.(ts|js|tsx|jsx)$/.test(p)) return 1
  if (p.includes('/auth/') || p.includes('access') || p.includes('/rbac')) return 1
  if (p.endsWith('.sql') || p.includes('/migrations/')) return 2
  if (p.includes('/lib/')) return 3
  if (p.includes('/app/')) return 4
  if (p.includes('/components/')) return 5
  return 6
}

function buildPrompt(path: string, content: string): string {
  return [
    `FILE: ${path}`,
    '',
    'Audit this source for security vulnerabilities (RLS / authorization bypass,',
    'injection, secret leakage, unsafe input handling), logic flaws, and standards',
    'violations. Return ONLY a JSON array (no prose, no code fences) where each item is:',
    '{"severity":"critical|high|medium|low|info","category":"string","title":"string",',
    '"detail":"string","recommendation":"string","line":<number optional>}',
    'Return [] if the file is clean.',
    '',
    '--- SOURCE START ---',
    content,
    '--- SOURCE END ---',
  ].join('\n')
}

function parseFindings(raw: string | null, file: string): AuditFinding[] {
  if (!raw) return []
  const m = raw.match(/\[[\s\S]*\]/)
  if (!m) return []
  let arr: unknown
  try { arr = JSON.parse(m[0]) } catch { return [] }
  if (!Array.isArray(arr)) return []

  const out: AuditFinding[] = []
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const sev = String(o.severity || 'info').toLowerCase() as Severity
    out.push({
      file,
      severity:       SEVERITIES.includes(sev) ? sev : 'info',
      category:       typeof o.category === 'string' ? o.category : 'standards',
      title:          typeof o.title === 'string' ? o.title : 'Finding',
      detail:         typeof o.detail === 'string' ? o.detail : '',
      recommendation: typeof o.recommendation === 'string' ? o.recommendation : '',
      line:           typeof o.line === 'number' ? o.line : undefined,
    })
  }
  return out
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let idx = 0
  async function worker(): Promise<void> {
    while (true) {
      const i = idx++
      if (i >= items.length) return
      results[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()))
  return results
}

async function scanOne(target: RepoTarget, path: string): Promise<{ path: string; scanned: boolean; findings: AuditFinding[] }> {
  const file = await readRepoFileFrom(target.repo, target.branch, path)
  if (!file.ok || !file.content) return { path, scanned: false, findings: [] }
  const raw = await callAuditModel({
    modelPreference: 'openai',
    prompt:          buildPrompt(path, file.content),
    maxTokens:       4096,
  })
  return { path, scanned: true, findings: parseFindings(raw, path) }
}

export async function runAudit(opts?: {
  url?: string
  prefix?: string
  maxFiles?: number
  onProgress?: (done: number, total: number) => void
}): Promise<AuditRunResult> {
  const raw      = String(opts?.url || opts?.prefix || '').trim()
  const maxFiles = Math.max(1, Math.min(opts?.maxFiles ?? 6, MAX_CAP))

  // A real GitHub URL / owner-repo targets THAT repo; anything else is treated as
  // an in-repo sub-path on the default repo.
  const parsed = parseRepoUrl(raw)
  const target: RepoTarget = parsed || { repo: AUDIT_REPO, branch: '', subPath: normalizeScanPath(raw), raw }

  const tree = await listRepoTree(target.repo, target.branch)
  if (!tree.ok) {
    return { ok: false, findings: [], filesScanned: [], repo: target.repo, error: tree.error || `Could not read ${target.repo}.` }
  }
  target.branch = tree.branch

  const allFiles  = tree.files
  const scannable = allFiles.filter(f => SCANNABLE.test(f))
  const scoped    = target.subPath ? scannable.filter(f => f.startsWith(target.subPath)) : scannable
  const targets   = scoped.sort((a, b) => priority(a) - priority(b) || a.localeCompare(b)).slice(0, maxFiles)

  if (targets.length === 0) {
    return {
      ok: true, findings: [], filesScanned: [], repo: target.repo, narrative: '',
      error: `No scannable source files found in ${target.repo}${target.subPath ? ` under "${target.subPath}"` : ''}.`,
    }
  }

  opts?.onProgress?.(0, targets.length)
  let done = 0
  const per = await mapPool(targets, CONCURRENCY, async (path) => {
    const r = await scanOne(target, path)
    done++
    opts?.onProgress?.(done, targets.length)
    return r
  })

  const findings: AuditFinding[] = []
  const scanned: string[] = []
  for (const r of per) {
    if (r.scanned) scanned.push(r.path)
    findings.push(...r.findings)
  }
  // UX Integrity pass — cheap static scan (no model calls) over the app/components
  // source for placeholders, dead links, no-op handlers, and TODO/FIXME markers.
  // Best-effort: a failure here never fails the run.
  try {
    const uxFindings = await runUxDetector(target, allFiles)
    findings.push(...uxFindings)
  } catch { /* UX pass is best-effort */ }

  findings.sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity))

  // Holistic synthesis — gets the WHOLE repo tree (macro map) plus the findings, so
  // it can reason about architecture and cross-file structure even for files that
  // weren't individually deep-scanned. Best-effort; never fails the run.
  const narrative = await synthesizeReport({
    repo:         target.repo,
    scope:        target.subPath || '(entire repository)',
    repoMap:      allFiles.slice(0, 500),
    filesScanned: scanned,
    findings:     findings.map(f => ({
      file: f.file, severity: f.severity, category: f.category,
      title: f.title, detail: f.detail, recommendation: f.recommendation, line: f.line,
    })),
  })

  return { ok: true, findings, filesScanned: scanned, repo: target.repo, narrative }
}

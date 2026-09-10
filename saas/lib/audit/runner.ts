// saas/lib/audit/runner.ts
// The analyzer runner the audit endpoint triggers.
// v3: accepts a full GitHub repository URL (or owner/repo, or a path prefix on the
// default repo). It lists the ENTIRE repo tree (the macro map), deep-scans a
// prioritized, budget-capped subset of files across the whole repo, then hands the
// findings PLUS the full tree to the synthesis pass for a holistic narrative report.
// Public repos only (private repos return a clear error from repoTarget).

import { callAuditModel } from '@/lib/audit/modelRouter'
import { parseAuditFindingsResponse } from '@/lib/audit/modelResponse'
import { synthesizeReport } from '@/lib/audit/synthesize'
import { runUxDetector } from '@/lib/audit/uxDetector'
import { parseRepoUrl, listRepoTree, readRepoFileFrom, type RepoTarget } from '@/lib/audit/repoTarget'
import { localizeKnownFindingText, reportLanguageName } from '@/lib/i18n/reportLanguage'
import { AUDIT_UNTRUSTED_DATA_RULE, encodeAuditUntrustedData } from '@/lib/audit/untrustedData'

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

export function normalizeScanPath(input?: string): string {
  let p = String(input || '').trim()
  if (!p) return ''
  const m = p.match(/github\.com\/[^/]+\/[^/]+(?:\/(?:tree|blob)\/[^/]+)?\/?(.*)$/i)
  if (m) p = m[1] || ''
  return p.replace(/^\/+/, '').replace(/\/+$/, '')
}

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

function buildPrompt(path: string, content: string, lang?: string): string {
  const language = reportLanguageName(lang)
  return [
    'Analyze the single untrusted repository-file record supplied below.',
    AUDIT_UNTRUSTED_DATA_RULE,
    `IMPORTANT: Write every category, title, detail, and recommendation value in ${language}. Keep file paths, package names, code identifiers, route names, and product names unchanged.`,
    '',
    'Audit this source for security vulnerabilities (RLS / authorization bypass,',
    'injection, secret leakage, unsafe input handling), logic flaws, and standards violations.',
    'Evidence rules are strict because only ONE source file is supplied in this pass:',
    'A finding is allowed only when the supplied source directly supports the claim.',
    'Do not infer the implementation or privilege of imported helpers, database/RLS policies, cookie attributes, environment configuration, middleware, deployment settings, or any other unseen source.',
    'If the file delegates a security control to a named helper or guard that is not supplied, that delegated control or guard is not evidence that the control is absent or bypassed. Omit the claim from findings unless this file itself proves the defect.',
    'Distinguish server-only logging from response disclosure: server-side logging is not client information disclosure unless the supplied source serializes or returns the sensitive detail to the client.',
    'Do not turn a possible concern that requires cross-file or runtime evidence into a confirmed severity finding. Return it only when this file contains the evidence needed to support it.',
    'Return ONLY a strict JSON object (no prose, no code fences) with this shape:',
    '{"findings":[{"severity":"high","category":"string","title":"string","detail":"string","recommendation":"string","line":1}]}.',
    'The line field is optional. Severity must be one of critical, high, medium, low, or info.',
    'Return {"findings":[]} if the file is clean or if the only concerns depend on evidence that is not present in this file.',
    encodeAuditUntrustedData('repository_source', { path, content }),
  ].join('\n')
}

function localizeKnownFinding(finding: AuditFinding, lang?: string): AuditFinding {
  const localized = localizeKnownFindingText(finding, lang)
  return {
    ...finding,
    category: localized.category || finding.category,
    title: localized.title || finding.title,
    detail: localized.detail || finding.detail,
    recommendation: localized.recommendation || finding.recommendation,
  }
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

async function scanOne(target: RepoTarget, path: string, lang?: string): Promise<{ path: string; scanned: boolean; findings: AuditFinding[] }> {
  const file = await readRepoFileFrom(target.repo, target.branch, path)
  if (!file.ok || !file.content) return { path, scanned: false, findings: [] }
  const raw = await callAuditModel({
    prompt:          buildPrompt(path, file.content, lang),
    maxTokens:       4096,
  })
  return { path, scanned: true, findings: parseAuditFindingsResponse(raw, path).map(f => localizeKnownFinding(f, lang)) }
}

export async function runAudit(opts?: {
  url?: string
  prefix?: string
  maxFiles?: number
  lang?: string
  onProgress?: (done: number, total: number) => void
}): Promise<AuditRunResult> {
  const raw      = String(opts?.url || opts?.prefix || '').trim()
  const maxFiles = Math.max(1, Math.min(opts?.maxFiles ?? 6, MAX_CAP))
  const lang = opts?.lang || 'en'

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
  let per: Array<{ path: string; scanned: boolean; findings: AuditFinding[] }>
  try {
    per = await mapPool(targets, CONCURRENCY, async (path) => {
      const r = await scanOne(target, path, lang)
      done++
      opts?.onProgress?.(done, targets.length)
      return r
    })
  } catch (error) {
    return {
      ok: false,
      findings: [],
      filesScanned: [],
      repo: target.repo,
      error: error instanceof Error ? error.message : 'COS Audit analysis failed.',
    }
  }

  const findings: AuditFinding[] = []
  const scanned: string[] = []
  for (const r of per) {
    if (r.scanned) scanned.push(r.path)
    findings.push(...r.findings)
  }
  try {
    const uxFindings = await runUxDetector(target, allFiles)
    findings.push(...uxFindings.map(f => localizeKnownFinding(f, lang)))
  } catch { /* UX pass is best-effort */ }

  findings.sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity))

  const narrative = await synthesizeReport({
    repo:         target.repo,
    scope:        target.subPath || '(entire repository)',
    repoMap:      allFiles.slice(0, 500),
    filesScanned: scanned,
    lang,
    findings:     findings.map(f => ({
      file: f.file, severity: f.severity, category: f.category,
      title: f.title, detail: f.detail, recommendation: f.recommendation, line: f.line,
    })),
  })

  return { ok: true, findings, filesScanned: scanned, repo: target.repo, narrative }
}

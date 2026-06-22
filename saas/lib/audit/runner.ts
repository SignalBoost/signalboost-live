// saas/lib/audit/runner.ts
// The independent analyzer runner the audit endpoint triggers.
// v2: recursive/full-repo capable — listRepoFiles already returns the full
// recursive tree; this raises the file cap and scans with a bounded concurrency
// pool so larger sweeps finish inside the route's duration budget.

import { listRepoFiles, readRepoFile } from '@/lib/ai/tools/repoReader'
import { callAuditModel } from '@/lib/audit/modelRouter'
import { synthesizeReport } from '@/lib/audit/synthesize'

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info'

export interface AuditFinding {
  file:           string
  severity:       Severity
  category:       string   // e.g. 'rls-bypass' | 'authz' | 'injection' | 'secret' | 'logic' | 'standards'
  title:          string
  detail:         string
  recommendation: string
  line?:          number
}

export interface AuditRunResult {
  ok:           boolean
  findings:     AuditFinding[]
  filesScanned: string[]
  narrative?:    string
  error?:       string
}

const SCANNABLE = /\.(ts|tsx|js|jsx|sql)$/i
const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low', 'info']
const MAX_CAP     = 60   // raised from 25 — full-repo sweeps
const CONCURRENCY = 4    // parallel model calls; conservative re: OpenAI rate limits
const AUDIT_REPO  = process.env.AUDIT_GITHUB_REPO || 'SignalBoost/signalboost-live'

// Accept either a repo path prefix OR a full GitHub URL and reduce it to the
// in-repo sub-path, so a report is produced whether or not the user pastes a URL:
//   https://github.com/owner/repo                    -> ''      (falls back to default scope)
//   https://github.com/owner/repo/tree/main/saas/app -> 'saas/app'
//   saas/app/api                                     -> 'saas/app/api'
export function normalizeScanPath(input?: string): string {
  let p = String(input || '').trim()
  if (!p) return ''
  const m = p.match(/github\.com\/[^/]+\/[^/]+(?:\/(?:tree|blob)\/[^/]+)?\/?(.*)$/i)
  if (m) p = m[1] || ''
  return p.replace(/^\/+/, '').replace(/\/+$/, '')
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

// Bounded-concurrency map: at most `limit` in flight at once.
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

async function scanOne(path: string): Promise<{ path: string; scanned: boolean; findings: AuditFinding[] }> {
  const file = await readRepoFile(path)
  if (!file.ok || !file.content) return { path, scanned: false, findings: [] }
  const raw = await callAuditModel({
    modelPreference: 'openai',
    prompt:          buildPrompt(path, file.content),
    maxTokens:       4096,
  })
  return { path, scanned: true, findings: parseFindings(raw, path) }
}

export async function runAudit(opts?: { prefix?: string; maxFiles?: number; onProgress?: (done: number, total: number) => void }): Promise<AuditRunResult> {
  const prefix   = normalizeScanPath(opts?.prefix) || 'saas/app/api'
  const maxFiles = Math.max(1, Math.min(opts?.maxFiles ?? 6, MAX_CAP))

  const list = await listRepoFiles(prefix)
  if (!list.ok) return { ok: false, findings: [], filesScanned: [], error: list.error || 'Failed to list repo files.' }

  const targets = list.files.filter(f => SCANNABLE.test(f)).slice(0, maxFiles)
  if (targets.length === 0) {
    return { ok: true, findings: [], filesScanned: [], error: `No scannable files under "${prefix}".` }
  }

  opts?.onProgress?.(0, targets.length)
  let done = 0
  const per = await mapPool(targets, CONCURRENCY, async (path) => {
    const r = await scanOne(path)
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

  findings.sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity))

  // Post-scan synthesis pass — turn the per-file findings into one holistic,
  // narrative markdown report. Best-effort: never fails the run.
  const narrative = await synthesizeReport({
    repo:         AUDIT_REPO,
    scope:        prefix,
    filesScanned: scanned,
    findings:     findings.map(f => ({
      file: f.file, severity: f.severity, category: f.category,
      title: f.title, detail: f.detail, recommendation: f.recommendation, line: f.line,
    })),
  })

  return { ok: true, findings, filesScanned: scanned, narrative }
}

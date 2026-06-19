// saas/lib/audit/runner.ts
// The independent analyzer runner the audit endpoint triggers.
// It reads a bounded set of source files from the repo, sends each to the
// audit router (OpenAI flagship), and parses structured findings.
//
// v1 scans a bounded slice (default 6 files under a prefix). The frontend
// roadmap deepens this to recursive directory walking, batching, and
// scheduled full-repo sweeps — without changing this contract.

import { listRepoFiles, readRepoFile } from '@/lib/ai/tools/repoReader'
import { callAuditModel } from '@/lib/audit/modelRouter'

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
  error?:       string
}

const SCANNABLE = /\.(ts|tsx|js|jsx|sql)$/i
const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low', 'info']

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
  // Tolerate stray prose / fences: extract the first JSON array.
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

export async function runAudit(opts?: { prefix?: string; maxFiles?: number }): Promise<AuditRunResult> {
  const prefix   = (opts?.prefix || 'saas/app/api').trim()
  const maxFiles = Math.max(1, Math.min(opts?.maxFiles ?? 6, 25))

  const list = await listRepoFiles(prefix)
  if (!list.ok) return { ok: false, findings: [], filesScanned: [], error: list.error || 'Failed to list repo files.' }

  const targets = list.files.filter(f => SCANNABLE.test(f)).slice(0, maxFiles)
  if (targets.length === 0) {
    return { ok: true, findings: [], filesScanned: [], error: `No scannable files under "${prefix}".` }
  }

  const findings: AuditFinding[] = []
  const scanned: string[] = []

  for (const path of targets) {
    const file = await readRepoFile(path)
    if (!file.ok || !file.content) continue
    scanned.push(path)
    const raw = await callAuditModel({
      modelPreference: 'openai',
      prompt:          buildPrompt(path, file.content),
      maxTokens:       4096,
    })
    findings.push(...parseFindings(raw, path))
  }

  // Most severe first.
  findings.sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity))
  return { ok: true, findings, filesScanned: scanned }
}

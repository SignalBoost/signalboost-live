// Resume only transiently failed file writes from an approved remediation batch.
// The deterministic branch is reused, so successful files are never duplicated and
// non-transient safety skips remain visible instead of being forced.

import type { ApprovedRunSystemResult } from '@/lib/audit/approvedRunRemediationSystem'
import { commitFileToBranch } from '@/lib/ai/tools/repoWriter'

const REPO = 'SignalBoost/signalboost-live'

type Finding = {
  file: string
  category: string
  detail: string
}

function githubToken(): string | null {
  return process.env.GITHUB_WRITE_TOKEN || null
}

function transientReason(value: string): boolean {
  const normalized = String(value || '').toLowerCase()
  return (
    /\b(429|500|502|503|504)\b/.test(normalized) ||
    normalized.includes('no server is currently available') ||
    normalized.includes('temporarily unavailable') ||
    normalized.includes('github request failed') ||
    normalized.includes('timeout') ||
    normalized.includes('timed out') ||
    normalized.includes('connection reset') ||
    normalized.includes('socket hang up')
  )
}

async function readBranchFile(branch: string, path: string): Promise<{ ok: boolean; content: string; error: string }> {
  const token = githubToken()
  if (!token) return { ok: false, content: '', error: 'GITHUB_WRITE_TOKEN is not configured.' }
  const encoded = encodeURIComponent(path).replace(/%2F/g, '/')
  try {
    const response = await fetch(
      `https://api.github.com/repos/${REPO}/contents/${encoded}?ref=${encodeURIComponent(branch)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        cache: 'no-store',
      },
    )
    const data = await response.json().catch(() => ({}))
    if (!response.ok || !data?.content) {
      return {
        ok: false,
        content: '',
        error: `GitHub GET ${path}@${branch} failed (${response.status}): ${String(data?.message || 'unknown error')}`,
      }
    }
    return { ok: true, content: Buffer.from(String(data.content), 'base64').toString('utf8'), error: '' }
  } catch (error) {
    return { ok: false, content: '', error: error instanceof Error ? error.message : 'GitHub request failed.' }
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function rawText(detail: string): string {
  const explicit = detail.match(/User-facing text\s+["“]([\s\S]*?)["”]\s+is hardcoded/i)
  if (explicit?.[1]) return explicit[1].trim()
  const quoted = detail.match(/["“]([^"”]{2,600})["”]/)
  return quoted?.[1]?.trim() || ''
}

function rawPattern(text: string): RegExp {
  return new RegExp(`>\\s*${escapeRegExp(text)}\\s*<`, 'g')
}

function ensureLocalizedImport(content: string): string {
  if (/import\s*\{\s*LocalizedText\s*\}\s*from\s*['"]@\/components\/i18n\/LocalizedText['"]/.test(content)) {
    return content
  }
  const importLine = "import { LocalizedText } from '@/components/i18n/LocalizedText'"
  const directive = content.match(/^(['"]use client['"];?\s*\n)/)
  if (directive) {
    const prefix = directive[1]
    const rest = content.slice(prefix.length).replace(/^\n/, '')
    return `${prefix}\n${importLine}\n\n${rest}`
  }
  return `${importLine}\n\n${content}`
}

function applyFindings(content: string, findings: Finding[]): {
  content: string
  applied: number
  alreadyResolved: number
  unsupported: number
} {
  let proposed = content
  let applied = 0
  let alreadyResolved = 0
  let unsupported = 0

  for (const finding of findings) {
    if (finding.category.toLowerCase() !== 'i18n-raw-string') {
      unsupported += 1
      continue
    }
    const text = rawText(finding.detail)
    if (!text) {
      unsupported += 1
      continue
    }
    const pattern = rawPattern(text)
    if (!pattern.test(proposed)) {
      alreadyResolved += 1
      continue
    }
    const next = proposed.replace(rawPattern(text), `><LocalizedText fallback={${JSON.stringify(text)}} /><`)
    if (next === proposed) unsupported += 1
    else {
      proposed = next
      applied += 1
    }
  }

  if (applied > 0) proposed = ensureLocalizedImport(proposed)
  return { content: proposed, applied, alreadyResolved, unsupported }
}

export async function recoverTransientPartialAuditWrites(params: {
  admin: any
  runId: string
  actorUserId: string
  result: ApprovedRunSystemResult
}): Promise<ApprovedRunSystemResult | null> {
  if (params.result.status !== 'partial' && params.result.lifecycleStatus !== 'partial') return null

  const retryFiles = new Set(
    params.result.skipped
      .filter(item => item.file && !item.file.startsWith('(') && transientReason(item.reason))
      .map(item => item.file),
  )
  if (!retryFiles.size || !params.result.branch) return null

  const rows = await params.admin
    .from('audit_findings')
    .select('file,category,detail')
    .eq('run_id', params.runId)
  if (rows.error) {
    return {
      ...params.result,
      ok: false,
      lifecycleStatus: 'failed',
      autoMergeError: rows.error.message,
    }
  }

  const byFile = new Map<string, Finding[]>()
  for (const row of rows.data || []) {
    const file = String(row?.file || '')
    if (!retryFiles.has(file)) continue
    const findings = byFile.get(file) || []
    findings.push({
      file,
      category: String(row?.category || ''),
      detail: String(row?.detail || ''),
    })
    byFile.set(file, findings)
  }

  let applied = 0
  let alreadyResolved = 0
  let filesChanged = 0
  const recoveredFiles = new Set<string>()
  const replacementErrors = new Map<string, string>()

  for (const file of retryFiles) {
    const current = await readBranchFile(params.result.branch, file)
    if (!current.ok) {
      replacementErrors.set(file, current.error)
      continue
    }
    const patch = applyFindings(current.content, byFile.get(file) || [])
    if (patch.unsupported > 0 && patch.applied === 0 && patch.alreadyResolved === 0) {
      replacementErrors.set(file, 'The transiently failed file no longer has a deterministic supported edit.')
      continue
    }

    if (patch.applied > 0) {
      const commit = await commitFileToBranch({
        branch: params.result.branch,
        path: file,
        content: patch.content.endsWith('\n') ? patch.content : `${patch.content}\n`,
        message: `AI audit remediation: resume approved run ${params.runId.slice(0, 8)}`,
      })
      if (!commit.ok) {
        replacementErrors.set(file, commit.error || 'Commit was refused.')
        continue
      }
      filesChanged += 1
      applied += patch.applied
    }
    alreadyResolved += patch.alreadyResolved
    recoveredFiles.add(file)
  }

  const skipped = params.result.skipped.flatMap(item => {
    if (!retryFiles.has(item.file)) return [item]
    if (recoveredFiles.has(item.file)) return []
    const reason = replacementErrors.get(item.file)
    return [{ ...item, reason: reason || item.reason }]
  })
  const hasTransientFailure = skipped.some(item => transientReason(item.reason))
  const hasSafetySkip = skipped.some(item => item.findingCount > 0 && !transientReason(item.reason))

  const recovered: ApprovedRunSystemResult = {
    ...params.result,
    ok: !hasTransientFailure,
    status: hasSafetySkip ? 'partial' : hasTransientFailure ? 'failed' : 'pr_ready',
    lifecycleStatus: hasSafetySkip ? 'partial' : hasTransientFailure ? 'failed' : 'checks_pending',
    findingsApplied: params.result.findingsApplied + applied,
    findingsAlreadyResolved: params.result.findingsAlreadyResolved + alreadyResolved,
    filesChanged: params.result.filesChanged + filesChanged,
    skipped,
    autoMergeError: hasTransientFailure ? 'One or more transient file writes still need another retry.' : '',
  }

  await params.admin.from('audit_logs').insert({
    run_id: params.runId,
    user_id: params.actorUserId,
    payload: recovered,
  })
  return recovered
}

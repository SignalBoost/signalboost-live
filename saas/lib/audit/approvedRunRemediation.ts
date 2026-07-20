// Apply an already owner-approved audit run through one governed GitHub PR.
// The current deterministic engine handles exact i18n raw-text findings only;
// unsupported findings are reported instead of guessed or marked as repaired.

import { commitFileToBranch, findBadImports, preservedFraction } from '@/lib/ai/tools/repoWriter'
import { readRepoFile } from '@/lib/ai/tools/repoReader'
import { listRepoTree, parseRepoUrl, readRepoFileFrom } from '@/lib/audit/repoTarget'

const REPO = 'SignalBoost/signalboost-live'
const BASE_BRANCH = 'main'
const MAX_FINDINGS = 300
const MAX_FILES = 60

export type ApprovedRunRemediationResult = {
  kind: 'audit_batch_remediation'
  ok: boolean
  approval: 'final'
  runId: string
  status: 'auto_merge_queued' | 'pr_ready' | 'already_resolved' | 'partial' | 'failed'
  branch: string
  prUrl: string
  prNumber: number
  autoMergeQueued: boolean
  autoMergeError: string
  findingsTotal: number
  findingsApplied: number
  findingsAlreadyResolved: number
  filesChanged: number
  skipped: Array<{ file: string; findingCount: number; reason: string }>
  approvedAt: string
}

type AuditFinding = {
  id?: string
  file: string
  severity: string
  category: string
  title: string
  detail: string
  recommendation: string
  line?: number | null
}

type GeneratedFile = {
  file: string
  content: string
  applied: number
  alreadyResolved: number
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function rawTextFromFinding(finding: AuditFinding): string {
  const explicit = finding.detail.match(/User-facing text\s+["“]([\s\S]*?)["”]\s+is hardcoded/i)
  if (explicit?.[1]) return explicit[1].trim()
  const quoted = finding.detail.match(/["“]([^"”]{2,600})["”]/)
  return quoted?.[1]?.trim() || ''
}

function isSupportedFinding(finding: AuditFinding): boolean {
  return finding.category.toLowerCase() === 'i18n-raw-string' && Boolean(rawTextFromFinding(finding))
}

function rawJsxTextPattern(text: string): RegExp {
  return new RegExp(`>\\s*${escapeRegExp(text)}\\s*<`, 'g')
}

function rawJsxTextPresent(content: string, text: string): boolean {
  return rawJsxTextPattern(text).test(content)
}

function localizedImportFor(file: string): string {
  return "import { LocalizedText } from '@/components/i18n/LocalizedText'"
}

function ensureLocalizedImport(file: string, content: string): string {
  if (/import\s*\{\s*LocalizedText\s*\}\s*from\s*['"]@\/components\/i18n\/LocalizedText['"]/.test(content)) {
    return content
  }

  const importLine = localizedImportFor(file)
  const directive = content.match(/^(['"]use client['"];?\s*\n)/)
  if (directive) {
    const prefix = directive[1]
    const rest = content.slice(prefix.length).replace(/^\n/, '')
    return `${prefix}\n${importLine}\n\n${rest}`
  }
  return `${importLine}\n\n${content}`
}

function applyFinding(content: string, finding: AuditFinding): { content: string; applied: boolean; alreadyResolved: boolean; reason: string } {
  if (!isSupportedFinding(finding)) {
    return { content, applied: false, alreadyResolved: false, reason: 'Only exact i18n raw-text findings are supported by deterministic remediation.' }
  }

  const text = rawTextFromFinding(finding)
  if (!rawJsxTextPresent(content, text)) {
    return { content, applied: false, alreadyResolved: true, reason: 'The exact raw JSX text is no longer present on main.' }
  }

  const replacement = `><LocalizedText fallback={${JSON.stringify(text)}} /><`
  const next = content.replace(rawJsxTextPattern(text), replacement)
  return { content: next, applied: next !== content, alreadyResolved: false, reason: next === content ? 'The exact JSX node could not be replaced safely.' : '' }
}

function parseDependencies(content: string): Set<string> {
  try {
    const json = JSON.parse(content) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
    return new Set([...Object.keys(json.dependencies || {}), ...Object.keys(json.devDependencies || {})])
  } catch {
    return new Set()
  }
}

async function dependencySets(): Promise<{ root: Set<string>; saas: Set<string> }> {
  const [root, saas] = await Promise.all([readRepoFile('package.json'), readRepoFile('saas/package.json')])
  return {
    root: root.ok && root.content ? parseDependencies(root.content) : new Set<string>(),
    saas: saas.ok && saas.content ? parseDependencies(saas.content) : new Set<string>(),
  }
}

function normalizeFindings(rows: any[]): AuditFinding[] {
  const output: AuditFinding[] = []
  for (const row of rows || []) {
    const file = typeof row?.file === 'string' ? row.file.trim().replace(/^\/+/, '') : ''
    if (!file || file.includes('..')) continue
    output.push({
      id: typeof row?.id === 'string' ? row.id : undefined,
      file,
      severity: String(row?.severity || 'info'),
      category: String(row?.category || 'standards'),
      title: String(row?.title || 'Audit finding'),
      detail: String(row?.detail || ''),
      recommendation: String(row?.recommendation || ''),
      line: typeof row?.line === 'number' ? row.line : null,
    })
  }
  return output
}

function groupByFile(findings: AuditFinding[]): Map<string, AuditFinding[]> {
  const grouped = new Map<string, AuditFinding[]>()
  for (const finding of findings) {
    const list = grouped.get(finding.file) || []
    list.push(finding)
    grouped.set(finding.file, list)
  }
  return grouped
}

function existingRemediation(rows: any[]): ApprovedRunRemediationResult | null {
  for (const row of rows || []) {
    const payload = row?.payload
    if (
      payload?.kind === 'audit_batch_remediation' &&
      payload?.approval === 'final' &&
      payload?.ok === true &&
      payload?.status !== 'partial' &&
      payload?.lifecycleStatus !== 'partial'
    ) {
      return payload as ApprovedRunRemediationResult
    }
  }
  return null
}

function githubToken(): string | null {
  return process.env.GITHUB_WRITE_TOKEN || null
}

async function github(path: string, init?: RequestInit): Promise<{ ok: boolean; data: any; error: string }> {
  const token = githubToken()
  if (!token) return { ok: false, data: null, error: 'GITHUB_WRITE_TOKEN is not configured.' }
  try {
    const response = await fetch(`https://api.github.com${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      },
      cache: 'no-store',
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) return { ok: false, data, error: String(data?.message || `GitHub HTTP ${response.status}`) }
    return { ok: true, data, error: '' }
  } catch (error) {
    return { ok: false, data: null, error: error instanceof Error ? error.message : 'GitHub request failed.' }
  }
}

async function updatePullRequest(prNumber: number, title: string, body: string) {
  return github(`/repos/${REPO}/pulls/${prNumber}`, {
    method: 'PATCH',
    body: JSON.stringify({ title, body }),
  })
}

async function queueAutoMerge(prNumber: number): Promise<{ queued: boolean; error: string }> {
  const token = githubToken()
  if (!token) return { queued: false, error: 'GITHUB_WRITE_TOKEN is not configured.' }
  const pr = await github(`/repos/${REPO}/pulls/${prNumber}`)
  const nodeId = pr.ok ? String(pr.data?.node_id || '') : ''
  if (!nodeId) return { queued: false, error: pr.error || 'Could not resolve the pull request node id.' }

  try {
    const response = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `mutation EnableAuditAutoMerge($pullRequestId: ID!) {
          enablePullRequestAutoMerge(input: { pullRequestId: $pullRequestId, mergeMethod: SQUASH }) {
            pullRequest { number autoMergeRequest { enabledAt } }
          }
        }`,
        variables: { pullRequestId: nodeId },
      }),
      cache: 'no-store',
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok || Array.isArray(data?.errors)) {
      const error = Array.isArray(data?.errors)
        ? data.errors.map((entry: any) => String(entry?.message || '')).filter(Boolean).join(' | ')
        : `GitHub GraphQL HTTP ${response.status}`
      return { queued: false, error: error || 'Automatic merge could not be enabled.' }
    }
    return { queued: true, error: '' }
  } catch (error) {
    return { queued: false, error: error instanceof Error ? error.message : 'Automatic merge could not be enabled.' }
  }
}

export async function runApprovedAuditRemediation(params: {
  admin: any
  runId: string
  actorUserId: string
}): Promise<ApprovedRunRemediationResult> {
  const { admin, runId, actorUserId } = params
  const empty: ApprovedRunRemediationResult = {
    kind: 'audit_batch_remediation', ok: false, approval: 'final', runId, status: 'failed', branch: '', prUrl: '', prNumber: 0,
    autoMergeQueued: false, autoMergeError: '', findingsTotal: 0, findingsApplied: 0, findingsAlreadyResolved: 0,
    filesChanged: 0, skipped: [], approvedAt: new Date().toISOString(),
  }
  if (!isUuid(runId)) return { ...empty, skipped: [{ file: '(run)', findingCount: 0, reason: 'Invalid audit run id.' }] }

  const previousLogs = await admin.from('audit_logs').select('payload').eq('run_id', runId).order('created_at', { ascending: false }).limit(50)
  const previous = existingRemediation(previousLogs.data || [])
  if (previous) return previous

  const [runResult, approvalResult] = await Promise.all([
    admin.from('audit_runs').select('*').eq('id', runId).single(),
    admin.from('audit_remediation_approvals').select('run_id,approved_by,approved_at').eq('run_id', runId).maybeSingle(),
  ])
  if (runResult.error || !runResult.data) return { ...empty, skipped: [{ file: '(run)', findingCount: 0, reason: 'Audit run not found.' }] }
  if (runResult.data.status !== 'approved' || approvalResult.error || !approvalResult.data) {
    return { ...empty, skipped: [{ file: '(run)', findingCount: 0, reason: 'A durable owner approval is required before remediation.' }] }
  }

  const parsed = parseRepoUrl(String(runResult.data.prefix || ''))
  if (parsed && parsed.repo.toLowerCase() !== REPO.toLowerCase()) {
    return { ...empty, skipped: [{ file: '(target)', findingCount: 0, reason: `Automatic writes are connected only to ${REPO}.` }] }
  }
  if (parsed?.branch && parsed.branch !== BASE_BRANCH) {
    return { ...empty, skipped: [{ file: '(target)', findingCount: 0, reason: `Automatic remediation supports only ${BASE_BRANCH}.` }] }
  }

  const findingsResult = await admin.from('audit_findings').select('id,file,severity,category,title,detail,recommendation,line').eq('run_id', runId)
  if (findingsResult.error) return { ...empty, skipped: [{ file: '(findings)', findingCount: 0, reason: findingsResult.error.message }] }
  const findings = normalizeFindings(findingsResult.data || [])
  const grouped = groupByFile(findings)
  empty.findingsTotal = findings.length
  if (!findings.length || !grouped.size) return { ...empty, skipped: [{ file: '(findings)', findingCount: 0, reason: 'This run has no actionable findings.' }] }
  if (findings.length > MAX_FINDINGS || grouped.size > MAX_FILES) {
    return { ...empty, skipped: [{ file: '(scope)', findingCount: findings.length, reason: `Batch exceeds ${MAX_FINDINGS} findings or ${MAX_FILES} files.` }] }
  }

  const tree = await listRepoTree(REPO, BASE_BRANCH)
  if (!tree.ok) return { ...empty, skipped: [{ file: '(repository)', findingCount: findings.length, reason: tree.error || 'Could not read repository tree.' }] }
  const paths = new Set(tree.files)
  const deps = await dependencySets()
  const generated: GeneratedFile[] = []
  const skipped: ApprovedRunRemediationResult['skipped'] = []
  let alreadyResolved = 0

  for (const [file, fileFindings] of grouped.entries()) {
    if (!paths.has(file)) {
      skipped.push({ file, findingCount: fileFindings.length, reason: 'The audited file no longer exists on main.' })
      continue
    }
    const current = await readRepoFileFrom(REPO, tree.branch, file)
    if (!current.ok || !current.content || current.truncated) {
      skipped.push({ file, findingCount: fileFindings.length, reason: current.truncated ? 'File is too large to repair safely.' : 'Current file could not be read.' })
      continue
    }

    let proposed = current.content
    let applied = 0
    let resolvedInFile = 0
    const unsupported: string[] = []
    for (const finding of fileFindings) {
      const result = applyFinding(proposed, finding)
      proposed = result.content
      if (result.applied) applied += 1
      else if (result.alreadyResolved) resolvedInFile += 1
      else unsupported.push(result.reason)
    }

    if (applied === 0) {
      alreadyResolved += resolvedInFile
      skipped.push({ file, findingCount: fileFindings.length - resolvedInFile, reason: unsupported[0] || 'All findings are already resolved.' })
      continue
    }

    proposed = ensureLocalizedImport(file, proposed)
    const badImports = findBadImports(proposed, file, paths, file.startsWith('saas/') ? deps.saas : deps.root)
    const kept = preservedFraction(current.content, proposed)
    const unresolved = fileFindings.filter(isSupportedFinding).filter(finding => rawJsxTextPresent(proposed, rawTextFromFinding(finding)))
    if (badImports.length || kept < 0.5 || unresolved.length) {
      skipped.push({
        file,
        findingCount: fileFindings.length,
        reason: badImports.length ? `Invalid imports: ${badImports.join(', ')}.` : kept < 0.5 ? 'The generated edit changed too much of the file.' : 'One or more raw strings remained after repair.',
      })
      continue
    }

    alreadyResolved += resolvedInFile
    if (unsupported.length) skipped.push({ file, findingCount: unsupported.length, reason: unsupported[0] })
    generated.push({ file, content: proposed.endsWith('\n') ? proposed : `${proposed}\n`, applied, alreadyResolved: resolvedInFile })
  }

  if (!generated.length) {
    const allResolved = alreadyResolved === findings.length
    const payload: ApprovedRunRemediationResult = {
      ...empty, ok: allResolved, status: allResolved ? 'already_resolved' : 'failed', findingsAlreadyResolved: alreadyResolved, skipped,
    }
    await admin.from('audit_logs').insert({ run_id: runId, user_id: actorUserId, payload })
    return payload
  }

  const branch = `ai/audit-run-${runId.replace(/-/g, '').slice(0, 12)}`
  const committed: GeneratedFile[] = []
  let prNumber = 0
  let prUrl = ''
  let branchName = branch
  for (const file of generated) {
    const commit = await commitFileToBranch({
      branch,
      path: file.file,
      content: file.content,
      message: `AI audit remediation: approved run ${runId.slice(0, 8)}`,
    })
    if (!commit.ok) {
      skipped.push({ file: file.file, findingCount: file.applied, reason: commit.error || 'Commit was refused.' })
      continue
    }
    committed.push(file)
    branchName = commit.branch || branchName
    if (commit.prNumber) prNumber = commit.prNumber
    if (commit.prUrl) prUrl = commit.prUrl
  }

  if (!committed.length || !prNumber || !prUrl) {
    const payload: ApprovedRunRemediationResult = {
      ...empty, branch: branchName, findingsAlreadyResolved: alreadyResolved, skipped,
    }
    await admin.from('audit_logs').insert({ run_id: runId, user_id: actorUserId, payload })
    return payload
  }

  const findingsApplied = committed.reduce((sum, file) => sum + file.applied, 0)
  const changedFiles = committed.map(file => file.file)
  const prBody = [
    '## Owner-approved audit remediation', '',
    `Audit run: \`${runId}\``,
    `Target: \`${REPO}@${BASE_BRANCH}\``, '',
    `- Findings applied: **${findingsApplied}**`,
    `- Findings already resolved: **${alreadyResolved}**`,
    `- Files changed: **${changedFiles.length}**`,
    `- Findings skipped by safety rules: **${skipped.reduce((sum, item) => sum + item.findingCount, 0)}**`, '',
    '### Changed files', ...changedFiles.map(file => `- \`${file}\``), '',
    'The owner already approved this run. Automatic merge is requested only after required repository checks pass.',
  ].join('\n')
  await updatePullRequest(prNumber, `AI audit remediation — run ${runId.slice(0, 8)}`, prBody)
  const autoMerge = { queued: false, error: 'Deferred to the end-to-end remediation controller.' }
  const isPartial = findingsApplied + alreadyResolved < findings.length
  const payload: ApprovedRunRemediationResult = {
    kind: 'audit_batch_remediation', ok: true, approval: 'final', runId,
    status: isPartial ? 'partial' : autoMerge.queued ? 'auto_merge_queued' : 'pr_ready',
    branch: branchName, prUrl, prNumber, autoMergeQueued: autoMerge.queued, autoMergeError: autoMerge.error,
    findingsTotal: findings.length, findingsApplied, findingsAlreadyResolved: alreadyResolved,
    filesChanged: committed.length, skipped, approvedAt: new Date().toISOString(),
  }
  await admin.from('audit_logs').insert({ run_id: runId, user_id: actorUserId, payload })
  return payload
}

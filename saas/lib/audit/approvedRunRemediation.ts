// Apply an already owner-approved audit run through one governed GitHub PR.
// Exact i18n raw-text findings use deterministic remediation. Other code/security
// findings may use the isolated Audit model, but only full-file edits that pass
// repository/import/preservation guardrails are allowed onto the ai/* branch.

import { commitFileToBranch, findBadImports, preservedFraction } from '@/lib/ai/tools/repoWriter'
import { readRepoFile } from '@/lib/ai/tools/repoReader'
import { callAuditModel } from '@/lib/audit/modelRouter'
import { listRepoTree, parseRepoUrl, readRepoFileFrom } from '@/lib/audit/repoTarget'
import { i18nRawStringPhrases } from '@/lib/audit/uxDetector'

const REPO = 'SignalBoost/signalboost-live'
const BASE_BRANCH = 'main'
const MAX_FINDINGS = 300
const MAX_FILES = 60
const MAX_AI_FILE_CHARS = 120_000

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

type AiRepairResult = {
  content: string
  fixedFindingIndexes: number[]
  note?: string
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

function isDeterministicFinding(finding: AuditFinding): boolean {
  return finding.category.toLowerCase() === 'i18n-raw-string' && Boolean(rawTextFromFinding(finding))
}

function rawJsxTextPattern(text: string): RegExp {
  return new RegExp(`>\\s*${escapeRegExp(text)}\\s*<`, 'g')
}

function rawJsxTextPresent(content: string, text: string): boolean {
  return rawJsxTextPattern(text).test(content)
}

function detectorFlagsPhrase(content: string, phrase: string): boolean {
  if (!phrase) return false
  return i18nRawStringPhrases(content).includes(phrase)
}

function ensureLocalizedImport(content: string): string {
  if (/import\s*\{\s*LocalizedText\s*\}\s*from\s*['"]@\/components\/i18n\/LocalizedText['"]/.test(content)) return content
  const importLine = "import { LocalizedText } from '@/components/i18n/LocalizedText'"
  const directive = content.match(/^(['"]use client['"];?\s*\n)/)
  if (directive) {
    const prefix = directive[1]
    const rest = content.slice(prefix.length).replace(/^\n/, '')
    return `${prefix}\n${importLine}\n\n${rest}`
  }
  return `${importLine}\n\n${content}`
}

function applyDeterministicFinding(content: string, finding: AuditFinding): { content: string; applied: boolean; alreadyResolved: boolean; reason: string } {
  if (!isDeterministicFinding(finding)) {
    return { content, applied: false, alreadyResolved: false, reason: 'Finding requires governed AI remediation.' }
  }
  const text = rawTextFromFinding(finding)
  if (!detectorFlagsPhrase(content, text)) {
    return { content, applied: false, alreadyResolved: true, reason: 'The i18n detector no longer flags this text on main.' }
  }
  if (!rawJsxTextPresent(content, text)) {
    return { content, applied: false, alreadyResolved: false, reason: 'Raw text is still flagged but could not be matched for a safe automatic fix.' }
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
    if (payload?.kind === 'audit_batch_remediation' && payload?.approval === 'final' && payload?.ok === true && payload?.status !== 'partial' && payload?.lifecycleStatus !== 'partial') {
      return payload as ApprovedRunRemediationResult
    }
  }
  return null
}

function stripJsonFence(value: string): string {
  const trimmed = String(value || '').trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return (fenced?.[1] || trimmed).trim()
}

async function aiRemediateFile(file: string, content: string, findings: AuditFinding[]): Promise<{ ok: boolean; value?: AiRepairResult; error: string }> {
  if (!findings.length) return { ok: true, value: { content, fixedFindingIndexes: [] }, error: '' }
  if (content.length > MAX_AI_FILE_CHARS) return { ok: false, error: `File exceeds the ${MAX_AI_FILE_CHARS}-character governed AI repair limit.` }

  const compactFindings = findings.map((finding, index) => ({
    index,
    severity: finding.severity,
    category: finding.category,
    title: finding.title,
    detail: finding.detail,
    recommendation: finding.recommendation,
    line: finding.line ?? null,
  }))
  const prompt = [
    `Repository: ${REPO}`,
    `Target branch source: ${BASE_BRANCH}`,
    `File: ${file}`,
    '',
    'The owner has already approved remediation for this audit run.',
    'Repair ONLY the listed findings that can be safely fixed inside this one existing file.',
    'Do not invent files, packages, environment variables, database columns, APIs, or product behavior.',
    'Preserve public behavior unless a finding specifically requires restricting unsafe behavior.',
    'Prefer minimal edits. If a finding cannot be safely repaired using only this file, leave it unchanged and do not list its index as fixed.',
    'Return ONLY valid JSON with exactly this shape:',
    '{"content":"COMPLETE updated file contents","fixedFindingIndexes":[0,1],"note":"short optional note"}',
    'The content field MUST contain the complete file, never a patch, diff, ellipsis, or omitted section.',
    '',
    `Findings:\n${JSON.stringify(compactFindings, null, 2)}`,
    '',
    `Current complete file:\n<<<FILE\n${content}\nFILE`,
  ].join('\n')

  const response = await callAuditModel({
    prompt,
    systemPrompt: 'You are the governed remediation engine for a production SaaS repository. Apply minimal secure fixes only when supported by the provided source. Never claim a finding fixed unless the returned complete file actually implements the repair. Return only strict JSON.',
    maxTokens: 16_000,
  })
  if (!response) return { ok: false, error: 'Audit remediation model returned no response.' }

  try {
    const parsed = JSON.parse(stripJsonFence(response)) as Partial<AiRepairResult>
    const nextContent = typeof parsed.content === 'string' ? parsed.content : ''
    const indexes = Array.isArray(parsed.fixedFindingIndexes)
      ? [...new Set(parsed.fixedFindingIndexes.filter((value): value is number => Number.isInteger(value) && value >= 0 && value < findings.length))]
      : []
    if (!nextContent.trim()) return { ok: false, error: 'Audit remediation model did not return complete file content.' }
    if (!indexes.length && nextContent !== content) return { ok: false, error: 'Audit remediation model changed the file without identifying a repaired finding.' }
    if (indexes.length && nextContent === content) return { ok: false, error: 'Audit remediation model claimed findings fixed without changing the file.' }
    return { ok: true, value: { content: nextContent, fixedFindingIndexes: indexes, note: typeof parsed.note === 'string' ? parsed.note : undefined }, error: '' }
  } catch {
    return { ok: false, error: 'Audit remediation model returned invalid JSON.' }
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
    let deterministicTouched = false
    const aiFindings: AuditFinding[] = []
    const deterministicFailures: string[] = []

    for (const finding of fileFindings) {
      if (!isDeterministicFinding(finding)) {
        aiFindings.push(finding)
        continue
      }
      const result = applyDeterministicFinding(proposed, finding)
      proposed = result.content
      if (result.applied) { applied += 1; deterministicTouched = true }
      else if (result.alreadyResolved) resolvedInFile += 1
      else deterministicFailures.push(result.reason)
    }

    if (deterministicTouched) proposed = ensureLocalizedImport(proposed)

    if (aiFindings.length) {
      const ai = await aiRemediateFile(file, proposed, aiFindings)
      if (!ai.ok || !ai.value) {
        skipped.push({ file, findingCount: aiFindings.length, reason: ai.error || 'Governed AI remediation failed.' })
      } else {
        proposed = ai.value.content
        applied += ai.value.fixedFindingIndexes.length
        const notFixed = aiFindings.length - ai.value.fixedFindingIndexes.length
        if (notFixed > 0) skipped.push({ file, findingCount: notFixed, reason: ai.value.note || 'One or more findings could not be safely repaired in this file.' })
      }
    }

    if (deterministicFailures.length) skipped.push({ file, findingCount: deterministicFailures.length, reason: deterministicFailures[0] })

    if (applied === 0) {
      alreadyResolved += resolvedInFile
      if (resolvedInFile === fileFindings.length) skipped.push({ file, findingCount: 0, reason: 'All findings are already resolved.' })
      continue
    }

    const badImports = findBadImports(proposed, file, paths, file.startsWith('saas/') ? deps.saas : deps.root)
    const kept = preservedFraction(current.content, proposed)
    const unresolvedI18n = fileFindings.filter(isDeterministicFinding).filter(finding => detectorFlagsPhrase(proposed, rawTextFromFinding(finding)))
    if (badImports.length || kept < 0.5 || unresolvedI18n.length) {
      skipped.push({
        file,
        findingCount: fileFindings.length,
        reason: badImports.length ? `Invalid imports: ${badImports.join(', ')}.` : kept < 0.5 ? 'The generated edit changed too much of the file.' : 'One or more raw strings remained after repair.',
      })
      continue
    }

    alreadyResolved += resolvedInFile
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
    const payload: ApprovedRunRemediationResult = { ...empty, branch: branchName, findingsAlreadyResolved: alreadyResolved, skipped }
    await admin.from('audit_logs').insert({ run_id: runId, user_id: actorUserId, payload })
    return payload
  }

  const findingsApplied = committed.reduce((sum, file) => sum + file.applied, 0)
  const changedFiles = committed.map(file => file.file)
  const isPartial = findingsApplied + alreadyResolved < findings.length
  const payload: ApprovedRunRemediationResult = {
    kind: 'audit_batch_remediation', ok: true, approval: 'final', runId,
    status: isPartial ? 'partial' : 'pr_ready',
    branch: branchName, prUrl, prNumber, autoMergeQueued: false, autoMergeError: 'Deferred to the end-to-end remediation controller.',
    findingsTotal: findings.length, findingsApplied, findingsAlreadyResolved: alreadyResolved,
    filesChanged: committed.length, skipped, approvedAt: new Date().toISOString(),
  }
  await admin.from('audit_logs').insert({ run_id: runId, user_id: actorUserId, payload })
  return payload
}

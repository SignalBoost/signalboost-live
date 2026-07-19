// saas/app/api/hub/operator/audit/remediate/route.ts
// One approval for an entire audit run. The approved run is grouped by file,
// patched and validated by AI, committed to one ai/* branch, and represented by
// one pull request. Automatic merge is queued after repository checks when the
// GitHub repository permits auto-merge; otherwise the same single PR is returned.

import { NextRequest, NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'
import { getAdminSupabase } from '@/utils/supabase/server'
import { readAuditTier, patchEnabledForTier } from '@/lib/audit/scanThrottle'
import { readRepoFile } from '@/lib/ai/tools/repoReader'
import {
  commitFileToBranch,
  findBadImports,
  missingUseClient,
  preservedFraction,
} from '@/lib/ai/tools/repoWriter'
import { callAuditModel } from '@/lib/audit/modelRouter'
import { listRepoTree, parseRepoUrl, readRepoFileFrom } from '@/lib/audit/repoTarget'

export const runtime = 'nodejs'
export const maxDuration = 300

const REPO = 'SignalBoost/signalboost-live'
const BRANCH = 'main'
const MAX_ATTEMPTS = 2
const MAX_BATCH_FILES = 60
const MAX_BATCH_FINDINGS = 300
const GENERATION_CONCURRENCY = 4

const PATCH_SYSTEM = [
  'You are SignalBoost AI operating an owner-approved audit remediation batch.',
  'You receive one real source file and every approved finding for that file.',
  'Apply all compatible findings in one minimal edit.',
  'Preserve unrelated imports, formatting, comments, exports, and behavior.',
  'Never invent packages, modules, files, translation libraries, APIs, roles, permissions, or repository conventions.',
  'Do not import react-i18next; this repository does not use it.',
  'Return ONLY the complete corrected file contents with no markdown fences or explanation.',
].join(' ')

type BatchFinding = {
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
  ok: true
  file: string
  content: string
  findingCount: number
}

type SkippedFile = {
  ok: false
  file: string
  findingCount: number
  reason: string
}

type FileResult = GeneratedFile | SkippedFile

type RemediationPayload = {
  kind: 'audit_batch_remediation'
  ok: true
  approval: 'final'
  runId: string
  status: 'auto_merge_queued' | 'pr_ready'
  branch: string
  prUrl: string
  prNumber: number
  autoMergeQueued: boolean
  autoMergeError: string
  filesChanged: number
  findingsApplied: number
  skipped: { file: string; findingCount: number; reason: string }[]
  approvedAt: string
}

function parseDependencies(content: string): Set<string> {
  try {
    const json = JSON.parse(content) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    return new Set([
      ...Object.keys(json.dependencies || {}),
      ...Object.keys(json.devDependencies || {}),
    ])
  } catch {
    return new Set()
  }
}

async function dependencySets(): Promise<{ root: Set<string>; saas: Set<string> }> {
  const [rootFile, saasFile] = await Promise.all([
    readRepoFile('package.json'),
    readRepoFile('saas/package.json'),
  ])
  return {
    root: rootFile.ok ? parseDependencies(rootFile.content) : new Set<string>(),
    saas: saasFile.ok ? parseDependencies(saasFile.content) : new Set<string>(),
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function quotedFindingText(detail: string): string {
  const explicit = detail.match(/User-facing text\s+["“]([\s\S]*?)["”]\s+is hardcoded/i)
  if (explicit?.[1]) return explicit[1].trim()
  const generic = detail.match(/["“]([^"”]{2,400})["”]/)
  return generic?.[1]?.trim() || ''
}

function isI18nFinding(finding: BatchFinding): boolean {
  return `${finding.category} ${finding.title}`.toLowerCase().includes('i18n')
}

function rawJsxTextPresent(content: string, text: string): boolean {
  if (!text) return false
  return new RegExp(`>\\s*${escapeRegExp(text)}\\s*<`, 'm').test(content)
}

function isAlreadyResolved(finding: BatchFinding, currentContent: string): boolean {
  if (!isI18nFinding(finding)) return false
  const text = quotedFindingText(finding.detail)
  return Boolean(text) && !rawJsxTextPresent(currentContent, text)
}

function unresolvedFindingErrors(findings: BatchFinding[], proposedContent: string): string[] {
  const errors: string[] = []
  for (const finding of findings) {
    if (!isI18nFinding(finding)) continue
    const text = quotedFindingText(finding.detail)
    if (text && rawJsxTextPresent(proposedContent, text)) {
      errors.push(`The raw JSX text "${text.slice(0, 120)}" is still present.`)
    }
  }
  return errors
}

function validateProposal(params: {
  currentContent: string
  proposedContent: string
  file: string
  paths: Set<string>
  deps: Set<string>
  findings: BatchFinding[]
}): string[] {
  const errors: string[] = []
  const { currentContent, proposedContent, file, paths, deps, findings } = params

  if (proposedContent.trim() === currentContent.trim()) {
    errors.push('The proposal does not change the file.')
  }
  if (/from\s+['"]react-i18next['"]|import\s+['"]react-i18next['"]/.test(proposedContent)) {
    errors.push('react-i18next is not installed; use the repository localization helpers.')
  }

  const badImports = findBadImports(proposedContent, file, paths, deps)
  if (badImports.length) errors.push(`These imports do not exist: ${badImports.join(', ')}.`)
  if (missingUseClient(file, proposedContent)) {
    errors.push("The proposal uses React hooks without a top-level 'use client' directive.")
  }

  const kept = preservedFraction(currentContent, proposedContent)
  if (kept < 0.5) {
    errors.push(`Only ${Math.round(kept * 100)}% of the original file remains; make a minimal edit.`)
  }
  errors.push(...unresolvedFindingErrors(findings, proposedContent))
  return errors
}

function repositoryGrounding(file: string, currentContent: string, paths: Set<string>): string {
  const existingImports = currentContent
    .split('\n')
    .filter(line => /^\s*import\s/.test(line))
    .join('\n') || '(none)'
  const localizedTextPath = file.startsWith('saas/')
    ? 'saas/components/i18n/LocalizedText.tsx'
    : 'components/i18n/LocalizedText.tsx'
  const translationHookPath = file.startsWith('saas/')
    ? 'saas/components/i18n/useTranslation.ts'
    : 'components/i18n/useTranslation.ts'

  return [
    'REPOSITORY GROUNDING (binding):',
    `- Target repository: ${REPO}@${BRANCH}.`,
    '- Do not add dependencies, create files, or invent authorization concepts.',
    '- react-i18next is not installed and is forbidden.',
    paths.has(localizedTextPath)
      ? "- For static JSX copy in a server component, the verified helper is: import { LocalizedText } from '@/components/i18n/LocalizedText'."
      : '',
    paths.has(translationHookPath)
      ? "- For an existing client component, the verified hook is: import { useTranslation } from '@/components/i18n/useTranslation'."
      : '',
    "- If you introduce a React hook into a TSX/JSX file, 'use client' must be the first directive.",
    '- Keep all existing imports unless an approved finding requires one verified repository import.',
    'CURRENT IMPORTS:',
    existingImports,
  ].filter(Boolean).join('\n')
}

function stripFences(value: string): string {
  const trimmed = value.trim()
  const match = trimmed.match(/```[a-zA-Z]*\n([\s\S]*?)```/)
  const body = match ? match[1] : trimmed
  return body.endsWith('\n') ? body : `${body}\n`
}

function findingBlock(findings: BatchFinding[]): string {
  return findings.map((finding, index) => [
    `${index + 1}. [${String(finding.severity || 'info').toUpperCase()}] ${finding.title}`,
    `   Category: ${finding.category || 'standards'}`,
    typeof finding.line === 'number' ? `   Near line: ${finding.line}` : '',
    finding.detail ? `   Detail: ${finding.detail.slice(0, 1400)}` : '',
    `   Required fix: ${finding.recommendation.slice(0, 1800)}`,
  ].filter(Boolean).join('\n')).join('\n\n')
}

async function generateFilePatch(params: {
  file: string
  findings: BatchFinding[]
  paths: Set<string>
  deps: Set<string>
  branch: string
}): Promise<FileResult> {
  const current = await readRepoFileFrom(REPO, params.branch, params.file)
  if (!current.ok || !current.content) {
    return { ok: false, file: params.file, findingCount: params.findings.length, reason: 'Current file could not be read.' }
  }
  if (current.truncated) {
    return { ok: false, file: params.file, findingCount: params.findings.length, reason: 'File is too large to patch safely.' }
  }

  const activeFindings = params.findings.filter(finding => !isAlreadyResolved(finding, current.content))
  if (activeFindings.length === 0) {
    return { ok: false, file: params.file, findingCount: params.findings.length, reason: 'All findings are already resolved in the current file.' }
  }

  const basePrompt = [
    `FILE: ${params.file}`,
    '',
    `APPROVED FINDINGS FOR THIS FILE (${activeFindings.length}):`,
    findingBlock(activeFindings),
    '',
    repositoryGrounding(params.file, current.content, params.paths),
    '',
    'Apply every compatible approved finding in one minimal edit.',
    'Return the COMPLETE corrected file (no fences, no prose):',
    '',
    '--- CURRENT FILE START ---',
    current.content,
    '--- CURRENT FILE END ---',
  ].join('\n')

  let proposed = ''
  let errors: string[] = []
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const prompt = attempt === 0
      ? basePrompt
      : [
          basePrompt,
          '',
          'THE PREVIOUS PROPOSAL WAS REJECTED BY REPOSITORY VALIDATION:',
          ...errors.map(error => `- ${error}`),
          'Correct every validation failure without changing unrelated code.',
        ].join('\n')

    const raw = await callAuditModel({
      modelPreference: 'openai',
      systemPrompt: PATCH_SYSTEM,
      prompt,
      maxTokens: 16000,
    })
    if (!raw || !raw.trim()) {
      errors = ['The model did not return a patch.']
      continue
    }

    proposed = stripFences(raw)
    errors = validateProposal({
      currentContent: current.content,
      proposedContent: proposed,
      file: params.file,
      paths: params.paths,
      deps: params.deps,
      findings: activeFindings,
    })
    if (errors.length === 0) break
  }

  if (!proposed || errors.length > 0) {
    return {
      ok: false,
      file: params.file,
      findingCount: activeFindings.length,
      reason: `Generated patch did not pass validation: ${errors.join(' ')}`.slice(0, 1200),
    }
  }

  return { ok: true, file: params.file, content: proposed, findingCount: activeFindings.length }
}

function groupFindingsByFile(rows: any[]): Map<string, BatchFinding[]> {
  const grouped = new Map<string, BatchFinding[]>()
  for (const row of rows.slice(0, MAX_BATCH_FINDINGS)) {
    const file = typeof row?.file === 'string' ? row.file.trim().replace(/^\/+/, '') : ''
    const recommendation = typeof row?.recommendation === 'string' ? row.recommendation.trim() : ''
    if (!file || file.includes('..') || !recommendation) continue
    const list = grouped.get(file) || []
    list.push({
      id: typeof row?.id === 'string' ? row.id : undefined,
      file,
      severity: String(row?.severity || 'info'),
      category: String(row?.category || 'standards'),
      title: String(row?.title || 'Audit finding'),
      detail: String(row?.detail || ''),
      recommendation,
      line: typeof row?.line === 'number' ? row.line : null,
    })
    grouped.set(file, list)
    if (grouped.size >= MAX_BATCH_FILES) break
  }
  return grouped
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  async function worker() {
    while (true) {
      const index = next++
      if (index >= items.length) return
      results[index] = await fn(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()))
  return results
}

function writeToken(): string | null {
  return process.env.GITHUB_WRITE_TOKEN || null
}

async function github(path: string, init?: RequestInit): Promise<{ ok: boolean; data: any; error: string }> {
  const token = writeToken()
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

async function updatePullRequest(prNumber: number, body: Record<string, unknown>) {
  return github(`/repos/${REPO}/pulls/${prNumber}`, { method: 'PATCH', body: JSON.stringify(body) })
}

async function queueAutoMerge(prNumber: number): Promise<{ queued: boolean; error: string }> {
  const token = writeToken()
  if (!token) return { queued: false, error: 'GITHUB_WRITE_TOKEN is not configured.' }
  const pr = await github(`/repos/${REPO}/pulls/${prNumber}`)
  const nodeId = pr.ok ? String(pr.data?.node_id || '') : ''
  if (!nodeId) return { queued: false, error: pr.error || 'Could not resolve the pull request node id.' }

  try {
    const response = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
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
      const message = Array.isArray(data?.errors)
        ? data.errors.map((entry: any) => String(entry?.message || '')).filter(Boolean).join(' | ')
        : `GitHub GraphQL HTTP ${response.status}`
      return { queued: false, error: message || 'Automatic merge could not be enabled.' }
    }
    return { queued: true, error: '' }
  } catch (error) {
    return { queued: false, error: error instanceof Error ? error.message : 'Automatic merge could not be enabled.' }
  }
}

async function authorizeRemediation() {
  const ctx = await getAccess()
  if (!ctx.userId) {
    return { response: NextResponse.json({ ok: false, error: 'Not signed in.' }, { status: 401 }), ctx: null }
  }

  const customerScansEnabled = process.env.AUDIT_CUSTOMER_SCANS_ENABLED === 'true'
  if (!ctx.isOwner && !customerScansEnabled) {
    return { response: NextResponse.json({ ok: false, error: 'Owner access required.' }, { status: 403 }), ctx: null }
  }

  if (!ctx.isOwner) {
    const tier = await readAuditTier(getAdminSupabase(), ctx.userId)
    if (!patchEnabledForTier(tier)) {
      return {
        response: NextResponse.json({
          ok: false,
          code: 'patch_not_in_plan',
          upgrade: true,
          tier,
          error: 'One-click AI remediation is available on the Pro plan and above.',
        }, { status: 402 }),
        ctx: null,
      }
    }
  }

  return { response: null, ctx }
}

function existingRemediation(rows: any[]): RemediationPayload | null {
  for (const row of rows || []) {
    const payload = row?.payload
    if (payload?.kind === 'audit_batch_remediation' && payload?.ok === true && payload?.approval === 'final') {
      return payload as RemediationPayload
    }
  }
  return null
}

export async function POST(req: NextRequest) {
  const auth = await authorizeRemediation()
  if (auth.response || !auth.ctx) return auth.response

  let body: { runId?: string } = {}
  try { body = await req.json() } catch { /* validated below */ }
  const runId = typeof body.runId === 'string' ? body.runId.trim() : ''
  if (!/^[0-9a-f-]{20,}$/i.test(runId)) {
    return NextResponse.json({ ok: false, error: 'A valid audit run id is required.' }, { status: 400 })
  }

  const admin = getAdminSupabase()
  const previousLogs = await admin
    .from('audit_logs')
    .select('payload')
    .eq('run_id', runId)
    .order('created_at', { ascending: false })
    .limit(30)
  const previous = existingRemediation(previousLogs.data || [])
  if (previous) return NextResponse.json(previous)

  const run = await admin.from('audit_runs').select('*').eq('id', runId).single()
  if (run.error || !run.data) {
    return NextResponse.json({ ok: false, error: 'Audit run not found.' }, { status: 404 })
  }
  if (!auth.ctx.isOwner && run.data.created_by !== auth.ctx.userId) {
    return NextResponse.json({ ok: false, error: 'This audit run belongs to another workspace.' }, { status: 403 })
  }
  if (run.data.status !== 'complete') {
    return NextResponse.json({ ok: false, error: 'Only a completed audit can be approved for remediation.' }, { status: 409 })
  }

  const parsedTarget = parseRepoUrl(String(run.data.prefix || ''))
  if (parsedTarget && parsedTarget.repo.toLowerCase() !== REPO.toLowerCase()) {
    return NextResponse.json({
      ok: false,
      error: `Automatic writes are connected only to ${REPO}. This run scanned ${parsedTarget.repo}.`,
    }, { status: 400 })
  }

  const findingsQuery = await admin
    .from('audit_findings')
    .select('id,file,severity,category,title,detail,recommendation,line')
    .eq('run_id', runId)
  if (findingsQuery.error) {
    return NextResponse.json({ ok: false, error: findingsQuery.error.message }, { status: 500 })
  }

  const grouped = groupFindingsByFile(findingsQuery.data || [])
  if (grouped.size === 0) {
    return NextResponse.json({ ok: false, error: 'This audit has no actionable code findings.' }, { status: 409 })
  }

  const tree = await listRepoTree(REPO, BRANCH)
  if (!tree.ok) {
    return NextResponse.json({ ok: false, error: tree.error || 'Could not read the repository tree.' }, { status: 502 })
  }
  const paths = new Set<string>(tree.files)
  const deps = await dependencySets()
  const entries = Array.from(grouped.entries()).filter(([file]) => paths.has(file)).slice(0, MAX_BATCH_FILES)

  const generated = await mapPool(entries, GENERATION_CONCURRENCY, async ([file, fileFindings]) => {
    try {
      return await generateFilePatch({
        file,
        findings: fileFindings,
        paths,
        deps: file.startsWith('saas/') ? deps.saas : deps.root,
        branch: tree.branch,
      })
    } catch (error) {
      return {
        ok: false,
        file,
        findingCount: fileFindings.length,
        reason: error instanceof Error ? error.message : 'Patch generation failed.',
      } as SkippedFile
    }
  })

  const branch = `ai/audit-run-${runId.replace(/-/g, '').slice(0, 12)}`
  const committed: GeneratedFile[] = []
  const skipped: SkippedFile[] = generated.filter((result): result is SkippedFile => !result.ok)
  let prNumber = 0
  let prUrl = ''
  let branchName = branch

  for (const result of generated) {
    if (!result.ok) continue
    const commit = await commitFileToBranch({
      branch,
      path: result.file,
      content: result.content,
      message: `AI audit remediation: approved run ${runId.slice(0, 8)}`,
    })
    if (!commit.ok) {
      skipped.push({ ok: false, file: result.file, findingCount: result.findingCount, reason: commit.error || 'Commit was refused.' })
      continue
    }
    committed.push(result)
    branchName = commit.branch || branchName
    if (commit.prNumber) prNumber = commit.prNumber
    if (commit.prUrl) prUrl = commit.prUrl
  }

  if (committed.length === 0) {
    return NextResponse.json({
      ok: false,
      code: 'batch_remediation_failed',
      error: 'No generated file passed validation and commit preflight.',
      skipped: skipped.map(item => ({ file: item.file, findingCount: item.findingCount, reason: item.reason })),
    }, { status: 422 })
  }
  if (!prNumber || !prUrl) {
    return NextResponse.json({
      ok: false,
      code: 'batch_pr_failed',
      error: 'The approved changes were committed to a branch, but the single pull request could not be opened.',
      branch: branchName,
    }, { status: 502 })
  }

  const findingsApplied = committed.reduce((sum, item) => sum + item.findingCount, 0)
  const changedFiles = committed.map(item => item.file)
  const prBody = [
    '## Final audit approval',
    '',
    `The user gave one final approval for audit run \`${runId}\`.`,
    'SignalBoost AI grouped findings by file, generated minimal edits, validated imports and repository paths, and committed all accepted changes to this single PR.',
    '',
    `- Approved findings applied: **${findingsApplied}**`,
    `- Files changed: **${changedFiles.length}**`,
    `- Findings/files skipped by safety validation: **${skipped.length}**`,
    '',
    '### Changed files',
    ...changedFiles.map(file => `- \`${file}\``),
    '',
    'This approval authorizes automatic merge after required repository checks pass. No per-finding approval is required.',
  ].join('\n')
  await updatePullRequest(prNumber, {
    title: `AI audit remediation — run ${runId.slice(0, 8)}`,
    body: prBody,
  })

  const autoMerge = await queueAutoMerge(prNumber)
  const payload: RemediationPayload = {
    kind: 'audit_batch_remediation',
    ok: true,
    approval: 'final',
    runId,
    status: autoMerge.queued ? 'auto_merge_queued' : 'pr_ready',
    branch: branchName,
    prUrl,
    prNumber,
    autoMergeQueued: autoMerge.queued,
    autoMergeError: autoMerge.error,
    filesChanged: committed.length,
    findingsApplied,
    skipped: skipped.map(item => ({ file: item.file, findingCount: item.findingCount, reason: item.reason })),
    approvedAt: new Date().toISOString(),
  }

  await admin.from('audit_logs').insert({
    run_id: runId,
    user_id: auth.ctx.userId,
    payload,
  })

  return NextResponse.json(payload)
}

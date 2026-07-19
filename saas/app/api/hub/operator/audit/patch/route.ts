// saas/app/api/hub/operator/audit/patch/route.ts
// Audit auto-patch. Generates a grounded preview first, validates it against the
// real repository, then requires a second explicit request before anything is
// committed to an ai/* branch. Production and main remain untouched.

import { createHash } from 'node:crypto'
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
import { listRepoTree, readRepoFileFrom } from '@/lib/audit/repoTarget'

export const runtime = 'nodejs'
export const maxDuration = 300

const REPO = 'SignalBoost/signalboost-live'
const BRANCH = 'main'
const MAX_ATTEMPTS = 2

const PATCH_SYSTEM = [
  'You are a precise code-fixing engine.',
  'You receive one real source file and ONE finding.',
  'Apply the smallest change that resolves only that finding.',
  'Preserve unrelated imports, formatting, comments, exports, and behavior.',
  'Never invent packages, modules, files, translation libraries, APIs, or repository conventions.',
  'Do not import react-i18next; this repository does not use it.',
  'Return ONLY the complete corrected file contents with no markdown fences or explanation.',
].join(' ')

type PatchBody = {
  mode?: string
  file?: string
  path?: string
  line?: number
  category?: string
  title?: string
  detail?: string
  recommendation?: string
  content?: string
  baseHash?: string
  auditRunId?: string
}

type AuditFixLog = {
  file: string
  line: number | null
  action: 'Applied approved audit fix'
  timestamp: string
}

function auditTimestamp(date = new Date()): string {
  return date.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '')
}

function stripFences(value: string): string {
  const trimmed = value.trim()
  const match = trimmed.match(/```[a-zA-Z]*\n([\s\S]*?)```/)
  const body = match ? match[1] : trimmed
  return body.endsWith('\n') ? body : `${body}\n`
}

function slug(value: string): string {
  return String(value || 'fix')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || 'fix'
}

function contentHash(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
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

async function readDependencies(file: string): Promise<Set<string>> {
  const candidates = file.startsWith('saas/')
    ? ['saas/package.json', 'package.json']
    : ['package.json', 'saas/package.json']
  const deps = new Set<string>()
  for (const path of candidates) {
    const result = await readRepoFile(path)
    if (!result.ok || !result.content) continue
    for (const dep of parseDependencies(result.content)) deps.add(dep)
  }
  return deps
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function quotedRawText(detail: string): string {
  const match = detail.match(/User-facing text\s+["“]([\s\S]*?)["”]\s+is hardcoded/i)
  return match?.[1]?.trim() || ''
}

function isAlreadyResolved(category: string, detail: string, currentContent: string): boolean {
  if (category !== 'i18n-raw-string') return false
  const text = quotedRawText(detail)
  if (!text) return false
  const rawNode = new RegExp(`>\\s*${escapeRegExp(text)}\\s*<`, 'm')
  return !rawNode.test(currentContent)
}

function validateProposal(params: {
  currentContent: string
  proposedContent: string
  file: string
  paths: Set<string>
  deps: Set<string>
}): string[] {
  const errors: string[] = []
  const { currentContent, proposedContent, file, paths, deps } = params

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
    '- Do not add dependencies or create files.',
    '- react-i18next is not installed and is forbidden.',
    paths.has(localizedTextPath)
      ? "- For static JSX copy in a server component, prefer: import { LocalizedText } from '@/components/i18n/LocalizedText' and render <LocalizedText fallback={\"English copy\"} />."
      : '',
    paths.has(translationHookPath)
      ? "- For an existing client component, the valid hook is: import { useTranslation } from '@/components/i18n/useTranslation'."
      : '',
    "- If you introduce a React hook into a TSX/JSX file, 'use client' must be the first directive.",
    '- Keep all existing imports unless the exact fix requires one verified repository import.',
    'CURRENT IMPORTS:',
    existingImports,
  ].filter(Boolean).join('\n')
}

async function authorizePatch() {
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
        response: NextResponse.json(
          {
            ok: false,
            code: 'patch_not_in_plan',
            upgrade: true,
            tier,
            error: 'AI patch generation is available on the Pro plan and above. Upgrade to enable it.',
          },
          { status: 402 },
        ),
        ctx: null,
      }
    }
  }

  return { response: null, ctx }
}

export async function POST(req: NextRequest) {
  const auth = await authorizePatch()
  if (auth.response) return auth.response

  let body: PatchBody = {}
  try { body = await req.json() } catch { /* validated below */ }

  const mode = body.mode === 'commit' ? 'commit' : 'preview'
  const file = typeof (body.file ?? body.path) === 'string' ? String(body.file ?? body.path).trim() : ''
  const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : 'audit finding'

  if (mode === 'commit') {
    const content = typeof body.content === 'string' ? body.content : ''
    if (!file || !content.trim()) {
      return NextResponse.json({ ok: false, error: 'A file and previewed content are required to push.' }, { status: 400 })
    }

    if (body.baseHash) {
      const current = await readRepoFile(file)
      if (!current.ok || !current.content) {
        return NextResponse.json({ ok: false, error: current.error || 'Could not re-read the file.' }, { status: 404 })
      }
      if (contentHash(current.content) !== body.baseHash) {
        return NextResponse.json(
          {
            ok: false,
            code: 'patch_preview_stale',
            error: 'The file changed after this preview was generated. Generate a fresh preview before pushing.',
          },
          { status: 409 },
        )
      }
    }

    const branch = `ai/audit-fix-${slug(title)}-${Date.now().toString(36)}`
    const commit = await commitFileToBranch({
      branch,
      path: file,
      content: content.endsWith('\n') ? content : `${content}\n`,
      message: `AI audit fix: ${title}`.slice(0, 200),
    })
    if (!commit.ok) {
      return NextResponse.json({ ok: false, error: commit.error || 'Commit refused.' }, { status: 422 })
    }

    // A single run-level approval authorizes its approved fixes. This write is
    // observability only: it never blocks a committed rollback-safe branch.
    const fixLog: AuditFixLog = {
      file,
      line: typeof body.line === 'number' ? body.line : null,
      action: 'Applied approved audit fix',
      timestamp: auditTimestamp(),
    }
    try {
      await getAdminSupabase().from('audit_logs').insert({
        run_id: typeof body.auditRunId === 'string' ? body.auditRunId : null,
        user_id: auth.ctx?.userId || null,
        payload: { event: 'audit_fix_applied', fix: fixLog, branch: commit.branch, commitSha: commit.commitSha },
      })
    } catch {
      // GitHub has already created a reviewable ai/* branch. Keep the fix
      // available for Supervisor rollback even if observability is unavailable.
    }

    return NextResponse.json({
      ok: true,
      mode: 'commit',
      branch: commit.branch,
      compareUrl: commit.compareUrl,
      commitSha: commit.commitSha,
      fixLog,
    })
  }

  const recommendation = typeof body.recommendation === 'string' ? body.recommendation.trim() : ''
  const detail = typeof body.detail === 'string' ? body.detail.trim() : ''
  const category = typeof body.category === 'string' ? body.category.trim() : ''
  const line = typeof body.line === 'number' ? body.line : null

  if (!file || !recommendation) {
    return NextResponse.json({ ok: false, error: 'A file and a recommendation are required.' }, { status: 400 })
  }

  const tree = await listRepoTree(REPO, BRANCH)
  if (!tree.ok) {
    return NextResponse.json({ ok: false, error: tree.error || 'Could not read the repository tree.' }, { status: 502 })
  }

  const current = await readRepoFileFrom(REPO, tree.branch, file)
  if (!current.ok || !current.content) {
    return NextResponse.json({ ok: false, error: `Could not read the current file: ${file}.` }, { status: 404 })
  }
  if (current.truncated) {
    return NextResponse.json({ ok: false, error: 'File is too large to auto-patch safely — remediate this one by hand.' }, { status: 413 })
  }

  if (isAlreadyResolved(category, detail, current.content)) {
    return NextResponse.json(
      {
        ok: false,
        code: 'finding_already_resolved',
        error: 'This finding is already fixed in the current code. Run a new audit to refresh the findings.',
      },
      { status: 409 },
    )
  }

  const paths = new Set<string>(tree.files)
  const deps = await readDependencies(file)
  const grounding = repositoryGrounding(file, current.content, paths)
  const basePrompt = [
    `FILE: ${file}`,
    line ? `Finding near line ${line}: ${title}` : `Finding: ${title}`,
    category ? `Category: ${category}` : '',
    detail ? `Detail: ${detail}` : '',
    `Required fix: ${recommendation}`,
    '',
    grounding,
    '',
    'Return the COMPLETE corrected file (no fences, no prose):',
    '',
    '--- CURRENT FILE START ---',
    current.content,
    '--- CURRENT FILE END ---',
  ].filter(Boolean).join('\n')

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
          'Correct those validation failures. Do not repeat the rejected imports or rewrite unrelated code.',
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
      file,
      paths,
      deps,
    })
    if (errors.length === 0) break
  }

  if (!proposed || errors.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        code: 'patch_validation_failed',
        error: `The generated fix could not pass repository validation. ${errors.join(' ')}`.trim(),
      },
      { status: 422 },
    )
  }

  return NextResponse.json({
    ok: true,
    mode: 'preview',
    path: file,
    title,
    oldContent: current.content,
    newContent: proposed,
    before: (detail || title).slice(0, 400),
    after: recommendation.slice(0, 400),
    baseHash: contentHash(current.content),
  })
}

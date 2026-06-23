// saas/app/api/hub/operator/audit/patch/route.ts
// Audit auto-patch (Step 4). Turns a finding's recommendation into a proposed
// fix committed to an ai/* branch via the existing repoWriter — NEVER main.
// repoWriter's preflights (fragment, size, path-exists, <50%-rewrite, bad-imports)
// reject hallucinated/truncated rewrites, so we pass no allowRewrite override:
// a patch that mangles the file is refused, not committed. Owner reviews the
// returned compare URL and merges by hand. Requires GITHUB_WRITE_TOKEN.

import { NextRequest, NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'
import { getAdminSupabase } from '@/utils/supabase/server'
import { readAuditTier, patchEnabledForTier } from '@/lib/audit/scanThrottle'
import { readRepoFile } from '@/lib/ai/tools/repoReader'
import { commitFileToBranch } from '@/lib/ai/tools/repoWriter'
import { callAuditModel } from '@/lib/audit/modelRouter'

export const runtime = 'nodejs'
export const maxDuration = 300

const PATCH_SYSTEM =
  'You are a precise code-fixing engine. You are given one source file and ONE ' +
  'finding to fix. Apply the MINIMAL change that resolves only that finding. ' +
  'Preserve everything else exactly: imports, formatting, unrelated code, and ' +
  'comments. Return ONLY the complete corrected file contents — no markdown ' +
  'fences, no explanation, no commentary.'

function stripFences(s: string): string {
  const t = s.trim()
  const m = t.match(/```[a-zA-Z]*\n([\s\S]*?)```/)
  const body = m ? m[1] : t
  return body.endsWith('\n') ? body : body + '\n'
}

function slug(s: string): string {
  return String(s || 'fix').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'fix'
}

export async function POST(req: NextRequest) {
  const ctx = await getAccess()
  if (!ctx.userId) {
    return NextResponse.json({ ok: false, error: 'Not signed in.' }, { status: 401 })
  }

  // Owner-only by default; flip AUDIT_CUSTOMER_SCANS_ENABLED to open to customers.
  const customerScansEnabled = process.env.AUDIT_CUSTOMER_SCANS_ENABLED === 'true'
  if (!ctx.isOwner && !customerScansEnabled) {
    return NextResponse.json({ ok: false, error: 'Owner access required.' }, { status: 403 })
  }

  // AI patch generation is a Pro+ entitlement. Owner is exempt; everyone else is
  // resolved from their live audit tier.
  if (!ctx.isOwner) {
    const tier = await readAuditTier(getAdminSupabase(), ctx.userId)
    if (!patchEnabledForTier(tier)) {
      return NextResponse.json(
        {
          ok: false,
          code: 'patch_not_in_plan',
          upgrade: true,
          tier,
          error: 'AI patch generation is available on the Pro plan and above. Upgrade to enable it.',
        },
        { status: 402 },
      )
    }
  }

  let body: { mode?: string; file?: string; path?: string; line?: number; title?: string; detail?: string; recommendation?: string; content?: string } = {}
  try { body = await req.json() } catch { /* validated below */ }

  const mode = body.mode === 'commit' ? 'commit' : 'preview'
  const file = typeof (body.file ?? body.path) === 'string' ? String(body.file ?? body.path).trim() : ''
  const title = typeof body.title === 'string' && body.title.trim() ? body.title : 'audit finding'

  // ── COMMIT: push the already-previewed content to an ai/* branch (the human
  //    handshake). Writes exactly what the preview showed; preflights still guard. ──
  if (mode === 'commit') {
    const content = typeof body.content === 'string' ? body.content : ''
    if (!file || !content.trim()) {
      return NextResponse.json({ ok: false, error: 'A file and previewed content are required to push.' }, { status: 400 })
    }
    const branch = `ai/audit-fix-${slug(title)}-${Date.now().toString(36)}`
    const commit = await commitFileToBranch({
      branch,
      path: file,
      content: content.endsWith('\n') ? content : content + '\n',
      message: `AI audit fix: ${title}`.slice(0, 200),
    })
    if (!commit.ok) {
      // Surface the preflight refusal verbatim — it's the safety net, not a glitch.
      return NextResponse.json({ ok: false, error: commit.error || 'Commit refused.' }, { status: 422 })
    }
    return NextResponse.json({ ok: true, mode: 'commit', branch: commit.branch, compareUrl: commit.compareUrl, commitSha: commit.commitSha })
  }

  // ── PREVIEW: generate the corrected file and return a diff. NO write. ──────────
  const recommendation = typeof body.recommendation === 'string' ? body.recommendation : ''
  const detail = typeof body.detail === 'string' ? body.detail : ''
  const line = typeof body.line === 'number' ? body.line : null

  if (!file || !recommendation) {
    return NextResponse.json({ ok: false, error: 'A file and a recommendation are required.' }, { status: 400 })
  }

  // Read the current file. Refuse to patch a truncated read — we'd preview a partial file.
  const f = await readRepoFile(file)
  if (!f.ok || !f.content) {
    return NextResponse.json({ ok: false, error: f.error || 'Could not read the file.' }, { status: 404 })
  }
  if (f.truncated) {
    return NextResponse.json({ ok: false, error: 'File is too large to auto-patch safely — remediate this one by hand.' }, { status: 413 })
  }

  // Generate the corrected full file with the flagship.
  const prompt = [
    `FILE: ${file}`,
    line ? `Finding near line ${line}: ${title}` : `Finding: ${title}`,
    detail ? `Detail: ${detail}` : '',
    `Required fix: ${recommendation}`,
    '',
    'Return the COMPLETE corrected file (no fences, no prose):',
    '',
    '--- CURRENT FILE START ---',
    f.content,
    '--- CURRENT FILE END ---',
  ].filter(Boolean).join('\n')

  const raw = await callAuditModel({ modelPreference: 'openai', systemPrompt: PATCH_SYSTEM, prompt, maxTokens: 16000 })
  if (!raw || !raw.trim()) {
    return NextResponse.json({ ok: false, error: 'The model did not return a patch.' }, { status: 502 })
  }
  const newContent = stripFences(raw)

  // Plain-English impact — derived from the finding (already AI-authored at scan time).
  const before = (detail || title).slice(0, 400)
  const after = (recommendation || '').slice(0, 400)

  return NextResponse.json({
    ok: true,
    mode: 'preview',
    path: file,
    title,
    oldContent: f.content,
    newContent,
    before,
    after,
  })
}

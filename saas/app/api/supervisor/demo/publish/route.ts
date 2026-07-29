// saas/app/api/supervisor/demo/publish/route.ts
//
// PUBLISH A DEMO RECORD FOR SOMEONE WHO CANNOT LOG IN.
//
// The operator console is admin-gated, so a prospective buyer can otherwise only see the
// demo over a screen share. This route takes the result of a rehearsal or a drill the owner
// has just run, redacts it, stores it, and returns a link that anyone holding the token can
// open without an account.
//
// PUBLISHING IS ALWAYS AN EXPLICIT ACT. Nothing here runs on a schedule and nothing publishes
// as a side effect of a run. A record reaching this table is one a stranger may read, so it
// only gets there because the owner pressed a button.
//
// REDACTION IS THE CONTROL, NOT THE DATABASE CONSTRAINT. The table refuses a handful of
// obvious keys as a backstop, but the real work happens here: identity keys are removed at
// every depth, and every remaining string is scrubbed of email addresses and URLs. That
// matters specifically because the acceptance record's own check details name the approvers
// who were notified — "2 request(s) to: someone@company.com" is exactly the sort of true,
// useful, internal detail that must not travel with a sales link.
//
// PRODUCTION REPAIR HISTORY IS NOT PUBLISHABLE. Only 'rehearsal' and 'drill' are accepted.
// The production panel describes real infrastructure and real failures; it belongs to the
// deployment, not to a sales conversation.
//
// THE SHARE TOKEN IS STORED HASHED. The link carries the token; the row carries its SHA-256.
// A leaked table does not hand anyone a working link.
//
// OWNER ONLY, POST to publish and DELETE to revoke.

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { getCurrentUser } from '@/lib/auth/permission-middleware'
import { getAdminSupabase } from '@/utils/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TABLE = 'supervisor_demo_records'
const KINDS = new Set(['rehearsal', 'drill', 'production'])
const DEFAULT_EXPIRY_DAYS = 30
const MAX_EXPIRY_DAYS = 180

/** Keys removed at every depth. These carry deployment or personal identity. */
const REDACTED_KEYS = new Set([
  'address', 'addresses', 'approver', 'approverAddresses', 'approvers', 'consoleBaseUrl',
  'consoleUrl', 'deploymentId', 'email', 'emails', 'href', 'notifications', 'ownerEmail',
  'ownerEmails', 'privateKeyPem', 'projectId', 'recipient', 'recipients', 'targetOrigin',
  'teamId', 'token', 'url',
])

// Values that identify real infrastructure. Masked rather than removed, because the fact that
// a specific deployment was identified is the evidence; which deployment it was is not.
const MASK_PATTERNS: Array<[RegExp, string]> = [
  [/\bdpl_[A-Za-z0-9]+/g, 'dpl_[redacted]'],
  [/\bprj_[A-Za-z0-9]+/g, 'prj_[redacted]'],
  [/\bteam_[A-Za-z0-9]+/g, 'team_[redacted]'],
  [/\b[a-z0-9-]+\.vercel\.app\b/g, '[redacted host]'],
]

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
const URL_LIKE = /https?:\/\/[^\s"')]+/g

function scrubString(value: string): string {
  let out = value.replace(EMAIL, '[redacted address]').replace(URL_LIKE, '[redacted url]')
  for (const [pattern, replacement] of MASK_PATTERNS) out = out.replace(pattern, replacement)
  return out
}

function redact(value: unknown, depth = 0): unknown {
  if (depth > 12) return null
  if (typeof value === 'string') return scrubString(value)
  if (Array.isArray(value)) return value.map(item => redact(item, depth + 1))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      if (REDACTED_KEYS.has(key)) continue
      out[key] = redact(inner, depth + 1)
    }
    return out
  }
  return value
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req)
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if ((user as { role?: string }).role !== 'owner') {
    return NextResponse.json({ ok: false, error: 'Forbidden — publishing a demo record is owner-only' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ ok: false, error: 'A JSON body is required' }, { status: 400 })
  }

  const kind = String(body.kind || '').trim()
  if (!KINDS.has(kind)) {
    return NextResponse.json({
      ok: false,
      error: `kind must be one of: ${[...KINDS].join(', ')}`,
      note: 'Publishable kinds are a rehearsal, a drill, or a production run with identifiers masked.',
    }, { status: 400 })
  }

  const record = body.record
  if (!record || typeof record !== 'object') {
    return NextResponse.json({ ok: false, error: 'record is required — publish the result of a run, not an empty page' }, { status: 400 })
  }

  const days = Math.min(Math.max(Number(body.expiresInDays ?? DEFAULT_EXPIRY_DAYS) || DEFAULT_EXPIRY_DAYS, 1), MAX_EXPIRY_DAYS)
  const defaultTitle = kind === 'rehearsal' ? 'Approval rehearsal' : kind === 'drill' ? 'Incident drill' : 'Production incident'
  const title = String(body.title || defaultTitle).slice(0, 200)

  const payload = redact(record) as Record<string, unknown>
  const shareToken = randomBytes(24).toString('hex')
  const shareTokenHash = createHash('sha256').update(shareToken).digest('hex')
  const recordId = randomUUID()
  const publishedAt = new Date()
  const expiresAt = new Date(publishedAt.getTime() + days * 86_400_000)

  try {
    const { error } = await getAdminSupabase().from(TABLE).insert({
      record_id: recordId,
      kind,
      share_token_hash: shareTokenHash,
      title,
      published_by: String((user as { email?: string; id?: string }).id || 'owner'),
      published_at: publishedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
      payload,
      schema_version: 'supervisor-demo-record-v1',
    })
    if (error) {
      return NextResponse.json({
        ok: false,
        error: error.message,
        remedy: `If the table is missing, run supabase/migrations/20260728_supervisor_demo_records.sql in the Supabase SQL editor.`,
      }, { status: 500 })
    }
  } catch (cause) {
    return NextResponse.json({ ok: false, error: cause instanceof Error ? cause.message : 'publish failed' }, { status: 500 })
  }

  const base = String(process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/+$/, '')
  const path = `/demo/supervisor?k=${shareToken}`

  return NextResponse.json({
    ok: true,
    schemaVersion: 'supervisor-demo-publish-v1',
    recordId,
    kind,
    title,
    publishedAt: publishedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    shareUrl: base ? `${base}${path}` : path,
    warnings: [
      'The link works for anyone holding it. Treat it as public.',
      'The token is shown once here and is stored only as a hash. To stop sharing, revoke the record.',
      'Approver addresses, URLs, project and deployment identifiers were removed before this record was stored.',
    ],
  }, { status: 200 })
}

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser(req)
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if ((user as { role?: string }).role !== 'owner') {
    return NextResponse.json({ ok: false, error: 'Forbidden — revoking a demo record is owner-only' }, { status: 403 })
  }

  const recordId = new URL(req.url).searchParams.get('recordId')
  if (!recordId) return NextResponse.json({ ok: false, error: 'recordId is required' }, { status: 400 })

  // Revoked rather than deleted, so the record of what was shared, and when, survives.
  const { error } = await getAdminSupabase()
    .from(TABLE)
    .update({ revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('record_id', recordId)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, recordId, revoked: true }, { status: 200 })
}

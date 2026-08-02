// saas/app/api/outreach/social/platforms/route.ts
//
// Declare a social platform without a code change.
//
// This is what makes the connector plug-and-play rather than a fixed list: a buyer who
// uses a platform we ship no adapter for declares it here — where to authorize, what the
// publish request looks like, where the post id appears — and it publishes through the
// identical path as a built-in one.
//
// Owner-gated. Declaring a platform means naming an endpoint the system will POST to on
// the company's behalf, which is an administrative act, not a user preference.

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import {
  listStoredCustomPlatforms,
  upsertCustomPlatform,
  deleteCustomPlatform,
  loadCustomPlatforms,
} from '@/lib/outreach/platform-declarations'
import { socialCredentialNames } from '@/lib/outreach/social-secrets'
import type { CustomPlatformConfig } from '@/lib/outreach/social-custom-platform'

export const dynamic = 'force-dynamic'

export async function GET() {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  await loadCustomPlatforms(ctx.admin)
  const rows = await listStoredCustomPlatforms(ctx.admin)

  return NextResponse.json({
    platforms: rows.map(row => ({
      id: row.platform_id,
      label: row.label,
      content: row.content,
      needsAccountRef: row.needs_account_ref,
      publishUrl: row.publish_url,
      // Surfaced so the operator knows exactly which two environment variables to set.
      // Credentials are never stored in the row itself.
      credentials: socialCredentialNames(row.platform_id),
    })),
  })
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  let body: any
  try { body = await req.json() } catch { body = {} }

  const bodyKind = body?.bodyKind === 'form' ? 'form' : body?.bodyKind === 'text' ? 'text' : 'json'
  let template: unknown = body?.bodyTemplate
  if (bodyKind !== 'text' && typeof template === 'string') {
    // The UI sends the template as text so an operator can paste real JSON. Parsing here
    // rather than storing a string means a malformed template is rejected at declaration
    // time with a clear message, not at publish time with a confusing one.
    try { template = JSON.parse(template) } catch {
      return NextResponse.json({ error: 'bodyTemplate is not valid JSON' }, { status: 400 })
    }
  }

  const config: CustomPlatformConfig = {
    id: String(body?.id || '').trim().toLowerCase(),
    label: String(body?.label || '').trim(),
    authUrl: String(body?.authUrl || '').trim(),
    tokenUrl: body?.tokenUrl ? String(body.tokenUrl).trim() : undefined,
    scopes: Array.isArray(body?.scopes)
      ? body.scopes.map((scope: unknown) => String(scope))
      : String(body?.scopes || '').split(/[\s,]+/).filter(Boolean),
    publishUrl: String(body?.publishUrl || '').trim(),
    method: ['POST', 'PUT', 'PATCH'].includes(body?.method) ? body.method : 'POST',
    headers: body?.headers && typeof body.headers === 'object' ? body.headers : {},
    body: bodyKind === 'form'
      ? { kind: 'form', template: (template || {}) as Record<string, string> }
      : bodyKind === 'text'
        ? { kind: 'text', template: String(template ?? '') }
        : { kind: 'json', template: template ?? {} },
    idPath: body?.idPath ? String(body.idPath).trim() : undefined,
    idHeader: body?.idHeader ? String(body.idHeader).trim() : undefined,
    urlPath: body?.urlPath ? String(body.urlPath).trim() : undefined,
    permalinkTemplate: body?.permalinkTemplate ? String(body.permalinkTemplate).trim() : undefined,
    content: ['text', 'video', 'media'].includes(body?.content) ? body.content : 'text',
    needsAccountRef: body?.needsAccountRef === true,
  }

  const result = await upsertCustomPlatform(ctx.admin, config, (ctx.user as any)?.id ?? null)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })

  return NextResponse.json({
    ok: true,
    platform: config.id,
    // The operator's next step, stated rather than left to be discovered.
    credentials: socialCredentialNames(config.id),
    next: `Set ${socialCredentialNames(config.id).clientId} and ${socialCredentialNames(config.id).clientSecret}, then connect the platform from the social cockpit.`,
  })
}

export async function DELETE(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  const id = String(req.nextUrl.searchParams.get('id') || '').trim()
  const result = await deleteCustomPlatform(ctx.admin, id)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ ok: true, deleted: id })
}

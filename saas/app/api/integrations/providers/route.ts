// saas/app/api/integrations/providers/route.ts
//
// Declare an integration provider without a code change.
//
// The catalog names the tools most buyers already own. This is how a buyer connects the
// one it does not name — their CRM, their email platform, their internal service. Same
// shape as declaring a social platform: configuration, stored, loaded into the registry
// before the catalog is read.
//
// Owner-gated, because a declaration decides what the system will authenticate against.

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import {
  listDeclaredProviders,
  upsertDeclaredProvider,
  deleteDeclaredProvider,
  loadDeclaredProviders,
  type DeclaredProviderInput,
} from '@/lib/integrations/declared-providers'
import '@/lib/integrations/catalog' // side-effect: registers the shipped providers

export const dynamic = 'force-dynamic'

export async function GET() {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  await loadDeclaredProviders(ctx.admin)
  const rows = await listDeclaredProviders(ctx.admin)

  return NextResponse.json({
    ok: true,
    providers: rows.map(row => ({
      id: row.provider_id,
      label: row.label,
      category: row.category,
      auth: row.auth,
      docsUrl: row.docs_url || null,
      capabilities: row.capabilities || [],
    })),
  })
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  let body: any
  try { body = await req.json() } catch { body = {} }

  const input: DeclaredProviderInput = {
    id: String(body?.id || '').trim().toLowerCase(),
    label: String(body?.label || '').trim(),
    category: body?.category,
    auth: body?.auth === 'oauth2' ? 'oauth2' : 'api_key',
    authUrl: body?.authUrl ? String(body.authUrl).trim() : null,
    tokenUrl: body?.tokenUrl ? String(body.tokenUrl).trim() : null,
    scopes: Array.isArray(body?.scopes)
      ? body.scopes.map((s: unknown) => String(s))
      : String(body?.scopes || '').split(/[\s,]+/).filter(Boolean),
    docsUrl: body?.docsUrl ? String(body.docsUrl).trim() : null,
    capabilities: Array.isArray(body?.capabilities)
      ? body.capabilities.map((c: unknown) => String(c))
      : String(body?.capabilities || '').split(/[\s,]+/).filter(Boolean),
  }

  const result = await upsertDeclaredProvider(ctx.admin, input, (ctx.user as any)?.id ?? null)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })

  return NextResponse.json({
    ok: true,
    provider: input.id,
    // Said plainly, because it is the difference between a provider that appears in the
    // catalog and one that can actually do something.
    note: 'Declared. It appears in the catalog and can be connected. Its capabilities are declared, not implemented — an implementation is written when the capability is first used.',
  })
}

export async function DELETE(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  const id = String(req.nextUrl.searchParams.get('id') || '').trim()
  const result = await deleteDeclaredProvider(ctx.admin, id)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ ok: true, deleted: id })
}

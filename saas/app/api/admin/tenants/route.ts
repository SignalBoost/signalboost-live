// saas/app/api/admin/tenants/route.ts
// Owner-gated tenant organization registry. Credentials are stored only as
// vault_items UUID references; plaintext secrets never transit this route.

import { NextResponse } from 'next/server'
import { getAdminSupabase } from '@/utils/supabase/server'
import { requireOwner } from '@/lib/auth/access'

export const dynamic = 'force-dynamic'
export const maxDuration = 15

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$/

export async function GET() {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ ok: false, code: 'unauthorized' }, { status: guard.status })

  const admin = getAdminSupabase()
  const { data, error } = await admin
    .from('tenant_organizations')
    .select('id, name, slug, created_at')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ ok: false, code: 'load_failed' }, { status: 500 })
  return NextResponse.json({ ok: true, organizations: data || [] })
}

export async function POST(req: Request) {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ ok: false, code: 'unauthorized' }, { status: guard.status })

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, code: 'invalid_json' }, { status: 400 })
  }

  const name = String(body?.name || '').trim().slice(0, 140)
  const slug = String(body?.slug || '').trim().toLowerCase().slice(0, 80)
  const clientIdVaultKey = String(body?.clientIdVaultKey || '').trim()
  const clientSecretVaultKey = String(body?.clientSecretVaultKey || '').trim()
  const gcpApiVaultKey = String(body?.gcpApiVaultKey || '').trim()

  if (!name || !slug || !clientIdVaultKey || !clientSecretVaultKey || !gcpApiVaultKey) {
    return NextResponse.json({ ok: false, code: 'required' }, { status: 400 })
  }
  if (!SLUG_RE.test(slug)) {
    return NextResponse.json({ ok: false, code: 'invalid_slug' }, { status: 400 })
  }

  const admin = getAdminSupabase()
  const vaultIds = Array.from(new Set([clientIdVaultKey, clientSecretVaultKey, gcpApiVaultKey]))
  const { data: vaultRows, error: vaultErr } = await admin
    .from('vault_items')
    .select('id')
    .in('id', vaultIds)

  if (vaultErr) return NextResponse.json({ ok: false, code: 'vault_lookup_failed' }, { status: 500 })
  const found = new Set((vaultRows || []).map((row: any) => row.id))
  if (vaultIds.some((id) => !found.has(id))) {
    return NextResponse.json({ ok: false, code: 'missing_vault_reference' }, { status: 400 })
  }

  const { data, error } = await admin
    .from('tenant_organizations')
    .insert({
      name,
      slug,
      client_id_vault_key: clientIdVaultKey,
      client_secret_vault_key: clientSecretVaultKey,
      gcp_api_vault_key: gcpApiVaultKey,
      created_by: guard.ctx.userId || null,
    })
    .select('id, name, slug, created_at')
    .single()

  if (error) {
    const code = /duplicate|unique/i.test(error.message) ? 'duplicate_slug' : 'save_failed'
    return NextResponse.json({ ok: false, code }, { status: 400 })
  }

  return NextResponse.json({ ok: true, organization: data })
}

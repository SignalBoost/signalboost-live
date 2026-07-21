// saas/app/api/agency/press-providers/connect/route.ts
// MANUAL connect path (ONBOARD §12C path 2) for paid press providers — owner-only, no AI.
// POST   -> connect a wire brand: author its provider_registry row(s) + vault-store the key.
// GET    -> which paid providers are connected (+ price). Never returns a key.
// DELETE -> disconnect a provider (deactivate its rows + remove the key).
import { NextRequest, NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'
import { ownerOverrideIsValid } from '@/lib/agency/pressOutreach'
import { connectPressProvider, disconnectPressProvider, pressProviderStatus } from '@/lib/agency/pressProviderConnect'

export const dynamic = 'force-dynamic'
function str(v: unknown): string { return String(v ?? '').trim() }

export async function GET() {
  const access = await getAccess().catch(() => null)
  if (!access?.isOwner) return NextResponse.json({ ok: false, error: 'owner_approval_required' }, { status: 403 })
  const connected = await pressProviderStatus()
  return NextResponse.json({ ok: true, connected })
}

export async function POST(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 }) }

  const access = await getAccess().catch(() => null)
  // Connecting stores an encrypted key under the owner's user id, so a real owner session is required.
  if (!access?.isOwner || !access?.userId) return NextResponse.json({ ok: false, error: 'owner_session_required' }, { status: 403 })

  let payloadTemplate: Record<string, unknown> | undefined
  const rawTemplate = body?.payload_template
  if (rawTemplate) {
    try { payloadTemplate = typeof rawTemplate === 'string' ? JSON.parse(rawTemplate) : rawTemplate } catch {
      return NextResponse.json({ ok: false, error: 'payload_template_invalid_json' }, { status: 400 })
    }
  }

  const priceRaw = body?.price_cents ?? body?.priceCents
  const result = await connectPressProvider({
    ownerUserId: access.userId,
    providerId: str(body?.provider_id || body?.providerId) || 'pr_wire',
    apiKey: str(body?.api_key || body?.apiKey),
    brand: str(body?.brand) || undefined,
    endpoint: str(body?.endpoint || body?.submit_url),
    reportEndpoint: str(body?.report_endpoint || body?.report_url) || undefined,
    payloadTemplate,
    refPath: str(body?.ref_path) || undefined,
    priceCents: priceRaw != null && priceRaw !== '' ? Number(priceRaw) : undefined,
    currency: str(body?.currency) || undefined,
  })
  return NextResponse.json(result, { status: result.ok ? 200 : 400 })
}

export async function DELETE(req: NextRequest) {
  let body: any = {}
  try { body = await req.json() } catch { /* allow query-only */ }
  const url = new URL(req.url)

  const access = await getAccess().catch(() => null)
  const owner = Boolean(access?.isOwner) || ownerOverrideIsValid(str(body?.owner_override_token))
  if (!owner) return NextResponse.json({ ok: false, error: 'owner_approval_required' }, { status: 403 })

  const providerId = str(body?.provider_id || body?.providerId || url.searchParams.get('provider_id'))
  if (!providerId) return NextResponse.json({ ok: false, error: 'provider_id_required' }, { status: 400 })

  const result = await disconnectPressProvider(providerId)
  return NextResponse.json(result, { status: result.ok ? 200 : 400 })
}

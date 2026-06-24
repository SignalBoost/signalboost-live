// saas/app/api/hub/providers/status/route.ts
//
// Live connection status for every Hub Console provider. Admin-gated. Reports,
// per provider, whether its required credentials are present in the running
// deployment's environment — so provider cards can show real "Live" vs
// "Connect keys" state instead of a hardcoded flag. Presence-only: no external
// API calls, so it is fast and cannot time out or leak provider error payloads.
// Credential VALUES are never returned — only booleans and the NAMES of any
// missing vars (names are not secrets).

import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/access'
import {
  PROVIDER_REQUIRED_ENV,
  PROVIDER_HAS_BACKEND,
  type ProviderLiveStatus,
} from '@/lib/hub/provider-credentials'

export const dynamic = 'force-dynamic'

const present = (v: string | undefined | null): boolean => !!(v && String(v).trim())

export async function GET() {
  const guard = await requireAdmin()
  if (!guard.ok) {
    return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })
  }

  const statuses: Record<string, ProviderLiveStatus> = {}
  for (const [id, vars] of Object.entries(PROVIDER_REQUIRED_ENV)) {
    const missing = vars.filter((name) => !present(process.env[name]))
    statuses[id] = {
      hasBackend: PROVIDER_HAS_BACKEND.has(id),
      configured: missing.length === 0,
      missing,
    }
  }

  return NextResponse.json(
    { ok: true, checkedAt: new Date().toISOString(), statuses },
    { headers: { 'Cache-Control': 'no-store, private' } },
  )
}

// saas/app/api/hub/domains/list/route.ts
// Hub Console — list Vercel project domains (read-only, gated: domains:read).
//
// Read-only domain metadata, no secrets. The read gate was previously removed
// because the Supabase auth layer 401'd the panel whenever SUPABASE_SERVICE_ROLE_KEY
// was absent at runtime; that env fragility is resolved (env is read lazily), so the
// gate is safe to enforce. Unauthenticated callers no longer see domain data.
// Project id + creds resolve via the shared resolver (handles the empty
// VERCEL_HUB_PROJECT case). teamId is optional.

import { NextRequest, NextResponse } from 'next/server'
import { listVercelDomains } from '@/lib/hub/vercel-domains'
import { resolveVercelProject } from '@/lib/hub/vercel-project'
import { requirePermission } from '@/lib/auth/permission-middleware'

export async function GET(req: NextRequest) {
  const perm = await requirePermission(req, 'domains:read')
  if (!perm.ok) {
    return NextResponse.json({ ok: false, error: (perm as any).error }, { status: (perm as any).status })
  }
  const creds = await resolveVercelProject()
  if (!creds.ok || !creds.token || !creds.projectId) {
    return NextResponse.json({ ok: false, error: creds.error || 'Vercel not configured' }, { status: 500 })
  }

  try {
    const result = await listVercelDomains(creds.teamId, creds.projectId, creds.token)
    return NextResponse.json(result, { status: result.ok ? 200 : 502 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

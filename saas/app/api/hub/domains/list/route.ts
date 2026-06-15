// saas/app/api/hub/domains/list/route.ts
// Hub Console — list Vercel project domains (read-only, NOT auth-gated).
//
// Read-only domain metadata, no secrets. Decoupled from the Supabase auth layer
// for the same reason as the env + deployments lists: getCurrentUser() returns
// null when SUPABASE_SERVICE_ROLE_KEY is absent, which used to 401 the panel into
// an empty placeholder on a green build. Project id + creds resolve via the shared
// resolver (handles the empty VERCEL_HUB_PROJECT case). teamId is optional.

import { NextRequest, NextResponse } from 'next/server'
import { listVercelDomains } from '@/lib/hub/vercel-domains'
import { resolveVercelProject } from '@/lib/hub/vercel-project'

export async function GET(_req: NextRequest) {
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

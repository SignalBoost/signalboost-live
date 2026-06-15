// saas/app/api/hub/domains/add/route.ts
// Hub Console — add a domain to the Vercel project (gated: domains:manage).
// Project id + creds resolve via the shared resolver. teamId is optional.

import { NextRequest, NextResponse } from 'next/server'
import { addVercelDomain } from '@/lib/hub/vercel-domains'
import { requirePermission } from '@/lib/auth/permission-middleware'
import { resolveVercelProject } from '@/lib/hub/vercel-project'

type AddRequest = {
  domain: string
}

export async function POST(req: NextRequest) {
  const perm = await requirePermission(req, 'domains:manage')
  if (!perm.ok) {
    return NextResponse.json(
      { ok: false, error: (perm as any).error },
      { status: (perm as any).status }
    )
  }

  try {
    const body: AddRequest = await req.json()
    const { domain } = body

    if (!domain) {
      return NextResponse.json({ ok: false, error: 'Domain name required' }, { status: 400 })
    }

    const creds = await resolveVercelProject()
    if (!creds.ok || !creds.token || !creds.projectId) {
      return NextResponse.json({ ok: false, error: creds.error || 'Vercel not configured' }, { status: 500 })
    }

    const result = await addVercelDomain(creds.teamId, creds.projectId, domain, creds.token)
    return NextResponse.json(result, { status: result.ok ? 200 : 502 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

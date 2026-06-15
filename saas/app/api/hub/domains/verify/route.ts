// saas/app/api/hub/domains/verify/route.ts
// Hub Console — verify domain ownership / DNS (gated: domains:manage).
// Project id + creds resolve via the shared resolver. teamId is optional.

import { NextRequest, NextResponse } from 'next/server'
import { verifyVercelDomain } from '@/lib/hub/vercel-domains'
import { createClient } from '@supabase/supabase-js'
import { requirePermission } from '@/lib/auth/permission-middleware'
import { resolveVercelProject } from '@/lib/hub/vercel-project'

type VerifyRequest = {
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
    const body: VerifyRequest = await req.json()
    const { domain } = body

    if (!domain) {
      return NextResponse.json({ ok: false, error: 'Domain name required' }, { status: 400 })
    }

    const creds = await resolveVercelProject()
    if (!creds.ok || !creds.token || !creds.projectId) {
      return NextResponse.json({ ok: false, error: creds.error || 'Vercel not configured' }, { status: 500 })
    }

    const result = await verifyVercelDomain(creds.teamId, creds.projectId, domain, creds.token)

    // Log verification attempt to audit table (non-fatal)
    if (process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL) {
      try {
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL,
          process.env.SUPABASE_SERVICE_ROLE_KEY
        )

        await supabase.from('hub_vault_audit_log').insert([
          {
            secret_id: `domain:${domain}`,
            action: 'verified',
            user_email: (perm as any).user?.email || 'system',
            timestamp: new Date().toISOString(),
            status: result.verified ? 'success' : 'pending',
            message: result.verified ? 'Domain verified successfully' : 'Verification pending - DNS not yet propagated',
          },
        ])
      } catch (err) {
        // Non-fatal if logging fails
      }
    }

    return NextResponse.json(result, { status: result.ok ? 200 : 502 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

// saas/app/api/hub/domains/verify/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { verifyVercelDomain } from '@/lib/hub/vercel-domains'
import { createClient } from '@supabase/supabase-js'
import { requirePermission } from '@/lib/auth/permission-middleware'

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
      return NextResponse.json(
        { ok: false, error: 'Domain name required' },
        { status: 400 }
      )
    }

    const vercelToken = process.env.VERCEL_TOKEN
    const vercelTeamId = process.env.VERCEL_TEAM_ID
    const vercelProjectId = process.env.VERCEL_HUB_PROJECT

    if (!vercelToken || !vercelTeamId || !vercelProjectId) {
      return NextResponse.json(
        { ok: false, error: 'Vercel credentials not configured' },
        { status: 500 }
      )
    }

    const result = await verifyVercelDomain(vercelTeamId, vercelProjectId, domain, vercelToken)

    // Log verification attempt to audit table
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
            user_email: perm.user.email,
            timestamp: new Date().toISOString(),
            status: result.verified ? 'success' : 'pending',
            message: result.verified ? 'Domain verified successfully' : 'Verification pending - DNS not yet propagated',
          },
        ])
      } catch (err) {
        // Non-fatal if logging fails
      }
    }

    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

// saas/app/api/hub/domains/add/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { addVercelDomain } from '@/lib/hub/vercel-domains'

type AddRequest = {
  domain: string
}

export async function POST(req: NextRequest) {
  try {
    const body: AddRequest = await req.json()
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

    const result = await addVercelDomain(vercelTeamId, vercelProjectId, domain, vercelToken)
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

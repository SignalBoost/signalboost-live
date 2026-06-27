import { NextResponse } from 'next/server'
import { salesOutreachManager } from '@/lib/cos-marketing-sales'
import type { LeadCapture, OutreachDispatchRecord } from '@/lib/cos-marketing-sales'

export const dynamic = 'force-dynamic'

type Body = {
  lead?: Partial<LeadCapture> & { email?: string }
  history?: OutreachDispatchRecord[]
}

async function readBody(req: Request): Promise<Body> {
  try {
    const body = await req.json()
    return body && typeof body === 'object' ? body : {}
  } catch {
    return {}
  }
}

export async function POST(req: Request) {
  const body = await readBody(req)
  const lead = body.lead

  if (!lead?.email) {
    return NextResponse.json({ ok: false, error: 'Lead email is required.' }, { status: 400 })
  }

  const plan = salesOutreachManager.createValueDropCadence({
    lead: { ...lead, email: lead.email },
    history: Array.isArray(body.history) ? body.history : [],
  })

  return NextResponse.json({
    ok: true,
    module: 'cos_marketing_sales',
    route: 'outreach',
    mode: 'planning_only_owner_approval_required',
    plan,
  })
}

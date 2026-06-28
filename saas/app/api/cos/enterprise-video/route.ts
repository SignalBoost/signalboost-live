import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import { buildEnterpriseVideoStrategy } from '@/lib/cos/enterprise-video'
import type { EnterpriseVideoStrategyInput } from '@/lib/cos/enterprise-video'

export const dynamic = 'force-dynamic'

export async function GET() {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  const strategy = buildEnterpriseVideoStrategy()
  return NextResponse.json({ ok: true, strategy })
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  let body: EnterpriseVideoStrategyInput
  try { body = await req.json() } catch { body = {} }

  const strategy = buildEnterpriseVideoStrategy(body || {})
  return NextResponse.json({ ok: true, strategy })
}

import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import { SOCIAL_OUTREACH_SCHEMA_SQL } from '@/lib/outreach/social-schema'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET() {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  const setup = await ctx.admin.rpc('hub_exec_sql', { query: SOCIAL_OUTREACH_SCHEMA_SQL })
  if (setup.error) return NextResponse.json({ ok: false, error: setup.error.message }, { status: 500 })

  const checks = await Promise.all([
    ctx.admin.from('outreach_social_tokens').select('id').limit(1),
    ctx.admin.from('outreach_social_campaigns').select('id').limit(1),
    ctx.admin.from('outreach_social_campaign_posts').select('id').limit(1),
  ])
  const failed = checks.map((res, index) => ({ index, error: res.error?.message || null })).filter(item => item.error)
  if (failed.length) return NextResponse.json({ ok: false, error: 'Social outreach schema setup incomplete.', failed, setupResult: setup.data }, { status: 500 })

  return NextResponse.json({ ok: true, message: 'Social outreach backend schema is ready.', setupResult: setup.data })
}

export async function POST() { return GET() }

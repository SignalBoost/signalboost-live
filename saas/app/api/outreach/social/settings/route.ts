// saas/app/api/outreach/social/settings/route.ts
// Per-buyer, per-platform publish-mode preference for the Social Outreach Connector.
// GET  -> every platform with its availableModes + the buyer's current mode.
// POST -> { platform, publish_mode } upsert (validated against the platform's modes).
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import { ADAPTERS, platformAvailableModes, platformDefaultMode, type SocialPlatform, type PublishMode } from '@/lib/outreach/social-connectors'

export const dynamic = 'force-dynamic'

const PLATFORMS = Object.keys(ADAPTERS) as SocialPlatform[]

export async function GET() {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  const { data } = await ctx.admin
    .from('outreach_social_settings')
    .select('platform, publish_mode')
    .eq('user_id', ctx.user.id)

  const saved = new Map<string, string>((data || []).map((r: any) => [String(r.platform), String(r.publish_mode)]))

  const platforms = PLATFORMS.map((platform) => {
    const availableModes = platformAvailableModes(platform)
    const stored = saved.get(platform)
    const publishMode: PublishMode = stored && availableModes.includes(stored as PublishMode)
      ? (stored as PublishMode)
      : platformDefaultMode(platform)
    return { platform, label: ADAPTERS[platform].label, availableModes, publishMode, canChoose: availableModes.length > 1 }
  })

  return NextResponse.json({ ok: true, platforms })
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  let body: any = {}
  try { body = await req.json() } catch {}
  const platform = String(body?.platform || '') as SocialPlatform
  const mode = String(body?.publish_mode || '') as PublishMode

  if (!PLATFORMS.includes(platform)) return NextResponse.json({ ok: false, error: 'Unsupported platform' }, { status: 400 })
  if (!platformAvailableModes(platform).includes(mode)) {
    return NextResponse.json({ ok: false, error: `${platform} does not support '${mode}' mode` }, { status: 400 })
  }

  const { error } = await ctx.admin.from('outreach_social_settings').upsert(
    { user_id: ctx.user.id, platform, publish_mode: mode, updated_at: new Date().toISOString() },
    { onConflict: 'user_id,platform' },
  )
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, platform, publish_mode: mode })
}

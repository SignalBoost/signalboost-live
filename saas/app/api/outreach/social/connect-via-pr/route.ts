// saas/app/api/outreach/social/connect-via-pr/route.ts
// COS + PR connection path for a social platform: stages the platform's provider-app
// Client ID + Secret as an infrastructure PR (two independent vercel.add_env_var steps),
// which the owner/admin reviews and merges on /dashboard/infrastructure. This is the
// AI/PR path from the plug-and-play onboarding doctrine (ONBOARD 12C) — the API path
// (direct OAuth) stays the default, and the Browser Agent is the optional premium path.
// Env names are the connector's own uniform convention: SOCIAL_<PLATFORM>_CLIENT_ID/SECRET.
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/permission-middleware'
import { stageInfrastructurePR } from '@/lib/hub/pr-engine'
import { SOCIAL_CONNECTORS, type SocialPlatform } from '@/lib/outreach/social-connectors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TARGETS = ['production', 'preview', 'development', 'all']

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req as any)
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  const role = (user as any).role as string
  if (role !== 'owner' && role !== 'admin' && role !== 'operator') {
    return NextResponse.json({ ok: false, error: 'Forbidden — staging a PR requires owner, admin, or operator' }, { status: 403 })
  }

  let body: any = {}
  try { body = await req.json() } catch {}
  const platform = String(body?.platform || '') as SocialPlatform
  const clientId = String(body?.clientId || '').trim()
  const clientSecret = String(body?.clientSecret || '').trim()
  const target = TARGETS.includes(String(body?.target)) ? String(body.target) : 'production'

  if (!platform || !SOCIAL_CONNECTORS[platform]) return NextResponse.json({ ok: false, error: 'Unsupported platform' }, { status: 400 })
  if (!clientId || !clientSecret) return NextResponse.json({ ok: false, error: 'Client ID and Client Secret are both required' }, { status: 400 })

  const P = platform.toUpperCase()
  const keyId = `SOCIAL_${P}_CLIENT_ID`
  const keySecret = `SOCIAL_${P}_CLIENT_SECRET`
  const label = SOCIAL_CONNECTORS[platform]?.label || platform

  const staged = await stageInfrastructurePR({
    title: `Connect ${label}: set provider-app keys`,
    summary: `Sets ${keyId} and ${keySecret} on Vercel (${target}) so ${label} OAuth can connect. Review the values, then merge; nothing changes until you do.`,
    risk: 'medium',
    steps: [
      { provider: 'vercel', templateId: 'vercel.add_env_var', label: `Set ${keyId}`, payload: { key: keyId, value: clientId, target } },
      { provider: 'vercel', templateId: 'vercel.add_env_var', label: `Set ${keySecret}`, payload: { key: keySecret, value: clientSecret, target } },
    ],
    createdBy: (user as any).id ?? null,
    createdByEmail: (user as any).email ?? null,
  })

  if (!staged.ok) return NextResponse.json({ ok: false, error: staged.error || 'Could not stage the PR' }, { status: 500 })
  return NextResponse.json({ ok: true, prId: (staged as any).pr?.id ?? null, url: '/dashboard/infrastructure' })
}

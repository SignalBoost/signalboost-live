// saas/app/api/outreach/social/onboarding/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import { allSocialOnboardingGuides, getSocialOnboardingGuide } from '@/lib/outreach/social-onboarding-guide'

export const dynamic = 'force-dynamic'

type CapabilityPlatform = {
  providerId: string
  platform: string
  configured: boolean
  connected: boolean
  publishReady: boolean
  missing: string[]
  token?: any
  destinations?: any[]
}

const PLATFORM_TO_PROVIDER: Record<string, string> = {
  youtube_channels: 'youtube',
  linkedin_company: 'linkedin',
  linkedin_member: 'linkedin',
  tiktok: 'tiktok',
  reddit: 'reddit',
  instagram_business: 'instagram',
  facebook_pages: 'facebook',
  twitter_x: 'twitter_x',
}

function envPrefix(platform: string) { return `SOCIAL_${platform.toUpperCase()}` }
function envStatus(platform: string) {
  const prefix = envPrefix(platform)
  return { clientId: Boolean(process.env[`${prefix}_CLIENT_ID`]), clientSecret: Boolean(process.env[`${prefix}_CLIENT_SECRET`]) }
}
function tokenStatus(row: any) {
  if (!row) return null
  const expiresAt = row.expires_at ? String(row.expires_at) : null
  const expired = expiresAt ? new Date(expiresAt).getTime() <= Date.now() + 60_000 : false
  return { connected: true, accountRef: row.account_ref || null, accountName: row.account_name || null, expiresAt, expired }
}
function needsAccountRef(platform: string) {
  return ['linkedin_company', 'linkedin_member', 'facebook_pages', 'instagram_business', 'reddit'].includes(platform)
}
function nextHumanAction(guide: any, cap?: CapabilityPlatform | null) {
  if (!cap) return 'Start by creating the business account/page and developer app, then add credentials to Vercel.'
  if (!cap.configured) return `Add missing Vercel environment variables: ${cap.missing.filter(m => m.startsWith('SOCIAL_')).join(', ') || guide.envVars.join(', ')}. Then redeploy.`
  if (!cap.connected) return 'Credentials are present. Next, connect OAuth from the Hub/social connector screen.'
  if (cap.missing.includes('select_destination_account_ref') || cap.missing.includes('discover_or_enter_account_ref_destination')) return 'OAuth is connected. Next, run auto-discover destinations or manually save the destination/account reference.'
  if (!cap.publishReady) return 'Review the remaining missing items, then confirm approval gates and content requirements before publishing.'
  return 'Provider is publish-ready. You can create an approved campaign and publish through the social outreach workflow.'
}

async function loadCapabilities(admin: any, userId: string): Promise<Record<string, CapabilityPlatform>> {
  const tokenRes = await admin.from('outreach_social_tokens').select('platform, account_ref, account_name, scopes, expires_at').eq('user_id', userId)
  const destinationRes = await admin.from('outreach_social_destinations').select('platform, account_ref, account_name, kind, discovered_at').eq('user_id', userId)
  const tokens = new Map<string, any>((tokenRes.data || []).map((row: any) => [String(row.platform), row]))
  const destinationMap = new Map<string, any[]>()
  for (const row of destinationRes.data || []) {
    const key = String(row.platform)
    destinationMap.set(key, [...(destinationMap.get(key) || []), row])
  }

  const out: Record<string, CapabilityPlatform> = {}
  for (const [platform, providerId] of Object.entries(PLATFORM_TO_PROVIDER)) {
    const env = envStatus(platform)
    const token = tokenStatus(tokens.get(platform))
    const destinations = destinationMap.get(platform) || []
    const missing: string[] = []
    if (!env.clientId) missing.push(`${envPrefix(platform)}_CLIENT_ID`)
    if (!env.clientSecret) missing.push(`${envPrefix(platform)}_CLIENT_SECRET`)
    if (!token) missing.push('connected_oauth_token')
    if (token?.expired) missing.push('fresh_oauth_token')
    if (needsAccountRef(platform) && !token?.accountRef) missing.push(destinations.length ? 'select_destination_account_ref' : 'discover_or_enter_account_ref_destination')
    const configured = env.clientId && env.clientSecret
    const connected = Boolean(token && !token.expired)
    const publishReady = configured && connected && (!needsAccountRef(platform) || Boolean(token?.accountRef))
    out[providerId] = { providerId, platform, configured, connected, publishReady, missing, token, destinations }
  }
  return out
}

function buildAssistantCard(guide: any, capability?: CapabilityPlatform) {
  const total = guide.steps.length
  const automated = guide.steps.filter((s: any) => s.automatedBySignalBoost).length
  return {
    ...guide,
    capability: capability || null,
    assistant: {
      mode: 'guided_provider_onboarding',
      nextAction: nextHumanAction(guide, capability),
      humanSteps: guide.steps.filter((s: any) => !s.automatedBySignalBoost),
      automatedSteps: guide.steps.filter((s: any) => s.automatedBySignalBoost),
      automationCoverage: { automatedSteps: automated, totalSteps: total, percent: Math.round((automated / total) * 100) },
      safeToDelegateToAI: [
        'Explain the steps in plain language.',
        'Check which credentials are missing.',
        'Generate a provider-specific checklist for the buyer.',
        'Guide the buyer to paste credentials into Vercel.',
        'Guide OAuth connection and destination discovery.',
      ],
      mustBeDoneByHuman: [
        'Create/own the social media business account.',
        'Accept provider terms and app review requirements.',
        'Copy secrets from provider portal into Vercel.',
        'Approve OAuth permissions as the account owner/admin.',
      ],
    },
  }
}

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  const capabilities = await loadCapabilities(ctx.admin, ctx.user.id)
  const provider = req.nextUrl.searchParams.get('provider') || ''
  if (provider) {
    const guide = getSocialOnboardingGuide(provider)
    if (!guide) return NextResponse.json({ ok: false, error: 'Unsupported social onboarding provider.' }, { status: 400 })
    return NextResponse.json({ ok: true, callbackUrl: guide.callbackUrl, guide: buildAssistantCard(guide, capabilities[provider]) })
  }

  const guides = allSocialOnboardingGuides().map(guide => buildAssistantCard(guide, capabilities[guide.providerId]))
  return NextResponse.json({ ok: true, mode: 'social_provider_onboarding_assistant', callbackUrl: 'https://saas.signalboostapp.com/api/outreach/social/oauth/callback', guides })
}

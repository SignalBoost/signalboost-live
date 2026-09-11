import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabase } from '@/utils/supabase/server'
import { SupabaseRepositoryWebhookEvidenceStore } from '@/lib/security/github-repository-webhook-store'
import { ingestAuthenticatedGitHubRepositoryWebhook } from '@/security-host/github-webhook-ingestion'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function jsonEnvironment(name: string): unknown {
  const value = process.env[name]
  if (!value) throw new Error(`${name}_missing`)
  return JSON.parse(value)
}

function trustedKeysEnvironment(): Readonly<Record<string, string>> {
  const value = jsonEnvironment('SECURITY_TRUSTED_ENGAGEMENT_KEYS_JSON')
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('trusted_keys_invalid')
  const entries = Object.entries(value)
  if (entries.length === 0 || entries.some(([key, publicKey]) => !key || typeof publicKey !== 'string' || !publicKey)) {
    throw new Error('trusted_keys_invalid')
  }
  return Object.freeze(Object.fromEntries(entries) as Record<string, string>)
}

function killSwitchEnvironment(): boolean {
  const value = process.env.SECURITY_PATROL_KILL_SWITCH
  if (value === undefined || value === 'false') return false
  if (value === 'true') return true
  throw new Error('kill_switch_invalid')
}

export async function POST(request: NextRequest) {
  let config
  try {
    const secret = process.env.SECURITY_GITHUB_WEBHOOK_SECRET || ''
    if (secret.length < 16) throw new Error('webhook_secret_missing')
    config = {
      secret,
      engagement: jsonEnvironment('SECURITY_GUARDIAN_ENGAGEMENT_JSON'),
      trustedKeys: trustedKeysEnvironment(),
      killSwitchActive: killSwitchEnvironment(),
    }
  } catch {
    return NextResponse.json({ ok: false, outcome: 'security_webhook_not_configured' }, { status: 503 })
  }

  const rawBody = await request.text()
  const result = await ingestAuthenticatedGitHubRepositoryWebhook({
    rawBody,
    receivedAt: new Date().toISOString(),
    headers: {
      signature256: request.headers.get('x-hub-signature-256') || '',
      deliveryId: request.headers.get('x-github-delivery') || '',
      eventName: request.headers.get('x-github-event') || '',
      userAgent: request.headers.get('user-agent') || '',
      hookId: request.headers.get('x-github-hook-id') || undefined,
      installationTargetType: request.headers.get('x-github-hook-installation-target-type') || undefined,
      installationTargetId: request.headers.get('x-github-hook-installation-target-id') || undefined,
    },
    config,
    store: new SupabaseRepositoryWebhookEvidenceStore(getAdminSupabase()),
  })
  return NextResponse.json({
    ok: result.ok,
    schema: 'itmounts-security-repository-webhook-result-v1',
    outcome: result.outcome,
    eventId: result.eventId,
    repository: result.repository,
    evidenceHash: result.evidenceHash,
    indicators: result.indicators,
    passive: true,
    providerMutation: false,
  }, { status: result.status })
}

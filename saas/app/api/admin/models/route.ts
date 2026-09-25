// saas/app/api/admin/models/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { allPlatformModelProfiles } from '@/lib/ai/modelCapabilityRegistry'
import { configuredModelTransportBindings } from '@/lib/ai/modelTransportConfig'
import { createBuiltinModelTransportAdapters } from '@/lib/ai/modelTransportAdapters'
import { runPlatformModelCertification } from '@/lib/ai/modelCertification'
import { cosServiceDb } from '@/lib/cos-core/storage/service-db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

function noStore(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init)
  response.headers.set('Cache-Control', 'no-store')
  return response
}

function safePayload(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

async function recentCertifications() {
  const db = cosServiceDb()
  if (!db) return []
  const { data, error } = await db
    .from('supervisor_audit_events')
    .select('event_id,occurred_at,payload,schema_version')
    .eq('event_type', 'platform_model_certification_completed')
    .order('occurred_at', { ascending: false })
    .limit(100)
  if (error) return []
  return (data || []).map(row => ({
    certificationId: row.event_id,
    occurredAt: row.occurred_at,
    schemaVersion: row.schema_version,
    ...safePayload(row.payload),
  }))
}

export async function GET() {
  const guard = await requireOwner()
  if (!guard.ok) return noStore({ error: guard.error }, { status: guard.status })

  const profiles = allPlatformModelProfiles()
  const bindings = configuredModelTransportBindings()
  const adapters = createBuiltinModelTransportAdapters({ profiles, bindings })
  const certifications = await recentCertifications()
  const latestByProfile = new Map<string, any>()
  for (const receipt of certifications) {
    const key = String(receipt.profileKey || '')
    if (key && !latestByProfile.has(key)) latestByProfile.set(key, receipt)
  }

  const inventory = profiles.map(profile => {
    const binding = bindings.find(item => item.profileKey === profile.key) || null
    const adapter = binding
      ? adapters.find(item => item.protocol === binding.protocol && item.supports(profile)) || null
      : null
    return {
      key: profile.key,
      family: profile.family,
      modelId: profile.modelId,
      providerModelId: profile.providerModelId,
      revision: profile.revision,
      revisionPolicy: profile.revisionPolicy,
      tokenizerModelId: profile.tokenizerModelId,
      uses: profile.uses,
      transportProtocols: profile.transportProtocols,
      inference: profile.inference,
      training: profile.training,
      governance: profile.governance,
      binding: binding ? {
        provider: binding.provider,
        protocol: binding.protocol,
        endpoint: binding.endpoint,
        credentialEnv: binding.credentialEnv,
        credentialConfigured: binding.credentialEnv ? Boolean(process.env[binding.credentialEnv]) : true,
        apiVersion: binding.apiVersion,
        timeoutMs: binding.timeoutMs,
      } : null,
      builtInAdapterAvailable: Boolean(adapter),
      certifiable: Boolean(adapter),
      latestCertification: latestByProfile.get(profile.key) || null,
    }
  })

  return noStore({
    ok: true,
    registryStrictMode: process.env.ITMOUNTS_MODEL_REGISTRY_REQUIRE_REGISTERED === 'true',
    profiles: inventory,
    certificationReceipts: certifications,
    config: {
      modelRegistryConfigured: Boolean(process.env.ITMOUNTS_MODEL_REGISTRY_JSON?.trim()),
      transportRegistryConfigured: Boolean(process.env.ITMOUNTS_MODEL_TRANSPORTS_JSON?.trim()),
      registrationSource: 'server_configuration',
      secretsReturned: false,
    },
  })
}

export async function POST(request: NextRequest) {
  const guard = await requireOwner()
  if (!guard.ok) return noStore({ error: guard.error }, { status: guard.status })

  const body = await request.json().catch(() => null) as { profileKey?: unknown; confirmSpend?: unknown } | null
  const profileKey = String(body?.profileKey || '').trim()
  if (!profileKey) return noStore({ error: 'platform_model_certification_profile_required' }, { status: 400 })
  if (body?.confirmSpend !== true) {
    return noStore({
      error: 'platform_model_certification_explicit_spend_confirmation_required',
      note: 'Certification can make bounded provider calls. Resubmit with confirmSpend=true.',
    }, { status: 409 })
  }

  const db = cosServiceDb()
  if (!db) return noStore({ error: 'platform_model_certification_database_unavailable' }, { status: 503 })

  try {
    const receipt = await runPlatformModelCertification({ profileKey, db })
    return noStore({ ok: receipt.status !== 'failed', receipt }, { status: receipt.status === 'failed' ? 422 : 200 })
  } catch (error) {
    const code = (error instanceof Error ? error.message : String(error || 'platform_model_certification_failed'))
      .match(/^[a-z0-9_.:-]{1,180}/i)?.[0] || 'platform_model_certification_failed'
    const status = code === 'platform_model_certification_profile_not_found' ? 404
      : code.startsWith('platform_model_transport_unavailable') ? 409
        : 500
    return noStore({ error: code }, { status })
  }
}

// saas/app/api/admin/models/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { allPlatformModelProfiles, parseBuyerModelProfiles, type PlatformModelProfile } from '@/lib/ai/modelCapabilityRegistry'
import { configuredModelTransportBindings, parseModelTransportBindings, type PlatformModelTransportBinding } from '@/lib/ai/modelTransportConfig'
import { createBuiltinModelTransportAdapters } from '@/lib/ai/modelTransportAdapters'
import { runPlatformModelCertification, type ModelCertificationReceipt } from '@/lib/ai/modelCertification'
import { assertModelAssignmentCertification } from '@/lib/ai/modelGovernance'
import { createSignalBoostModelConfigurationPort } from '@/lib/ai/modelConfigurationSignalBoost'
import type { AssignableModelUse, ModelRegistrationRecord } from '@/lib/ai/modelConfigurationPort'
import { cosServiceDb } from '@/lib/cos-core/storage/service-db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const ASSIGNABLE_USES = new Set<AssignableModelUse>(['cos_reasoner','builder','specialist'])

function noStore(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init)
  response.headers.set('Cache-Control', 'no-store')
  return response
}

function safePayload(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

type StoredCertificationReceipt = Readonly<{
  certificationId: string
  occurredAt: string
  schemaVersion: string
  profileKey: string
  status: ModelCertificationReceipt['status']
  checks: ModelCertificationReceipt['checks']
  [key: string]: unknown
}>

function certificationAuditDb(db: NonNullable<ReturnType<typeof cosServiceDb>>) {
  return {
    from(table: string) {
      if (table !== 'supervisor_audit_events') throw new Error('platform_model_certification_audit_table_rejected')
      return {
        async insert(value: unknown) {
          const { error } = await db.from('supervisor_audit_events').insert(value as never)
          return { error: error ? { message: error.message } : null }
        },
      }
    },
  }
}

async function appendGovernanceAudit(
  db: NonNullable<ReturnType<typeof cosServiceDb>>,
  actorId: string,
  eventType: string,
  payload: Record<string, unknown>,
) {
  const eventId = `platform-model-${eventType}-${crypto.randomUUID()}`
  const { error } = await db.from('supervisor_audit_events').insert({
    event_id: eventId,
    execution_id: eventId,
    incident_id: `platform-model:${String(payload.profileKey || payload.use || 'governance')}`,
    event_type: `platform_model_${eventType}`,
    occurred_at: new Date().toISOString(),
    payload: { ...payload, actorId, authorityExpanded: false, secretsPersistedInAudit: false },
    schema_version: 'platform-model-governance-v1',
  } as never)
  if (error) throw new Error('platform_model_governance_audit_failed')
}

async function recentCertifications(db: NonNullable<ReturnType<typeof cosServiceDb>>): Promise<StoredCertificationReceipt[]> {
  const { data, error } = await db
    .from('supervisor_audit_events')
    .select('event_id,occurred_at,payload,schema_version')
    .eq('event_type', 'platform_model_certification_completed')
    .order('occurred_at', { ascending: false })
    .limit(200)
  if (error) return []
  return (data || []).flatMap(row => {
    const payload = safePayload(row.payload)
    const profileKey = String(payload.profileKey || '')
    const status = String(payload.status || '') as ModelCertificationReceipt['status']
    const checks = Array.isArray(payload.checks) ? payload.checks as unknown as ModelCertificationReceipt['checks'] : []
    if (!profileKey || !['passed','partial','failed'].includes(status)) return []
    return [{
      ...payload,
      certificationId: String(row.event_id),
      occurredAt: String(row.occurred_at),
      schemaVersion: String(row.schema_version),
      profileKey,
      status,
      checks,
    }]
  })
}

function mergedProfiles(durable: readonly ModelRegistrationRecord[]): readonly PlatformModelProfile[] {
  const map = new Map<string, PlatformModelProfile>()
  for (const profile of allPlatformModelProfiles()) map.set(profile.key, profile)
  for (const record of durable) if (record.enabled) map.set(record.profile.key, record.profile)
  return Object.freeze([...map.values()])
}

function mergedBindings(durable: readonly ModelRegistrationRecord[]): readonly PlatformModelTransportBinding[] {
  const map = new Map<string, PlatformModelTransportBinding>()
  for (const binding of configuredModelTransportBindings()) map.set(`${binding.profileKey}:${binding.protocol}`, binding)
  for (const record of durable) if (record.enabled) map.set(`${record.binding.profileKey}:${record.binding.protocol}`, record.binding)
  return Object.freeze([...map.values()])
}

function assignableUse(value: unknown): AssignableModelUse {
  const use = String(value || '') as AssignableModelUse
  if (!ASSIGNABLE_USES.has(use)) throw new Error('platform_model_assignment_use_invalid')
  return use
}

function latestCertification(receipts: readonly StoredCertificationReceipt[], profileKey: string): StoredCertificationReceipt | null {
  return receipts.find(item => item.profileKey === profileKey) || null
}

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error || 'platform_model_governance_failed'))
    .match(/^[a-z0-9_.:-]{1,220}/i)?.[0] || 'platform_model_governance_failed'
}

function errorStatus(code: string): number {
  if (/not_found|unavailable/.test(code)) return 404
  if (/required|invalid|mismatch|capability/.test(code)) return 400
  if (/conflict|already_active|no_rollback|certification_failed|transport_unavailable/.test(code)) return 409
  return 500
}

export async function GET() {
  const guard = await requireOwner()
  if (!guard.ok) return noStore({ error: guard.error }, { status: guard.status })
  const db = cosServiceDb()
  if (!db) return noStore({ error: 'platform_model_configuration_database_unavailable' }, { status: 503 })

  try {
    const store = createSignalBoostModelConfigurationPort(db)
    const durable = await store.listRegistrations()
    const profiles = mergedProfiles(durable)
    const bindings = mergedBindings(durable)
    const adapters = createBuiltinModelTransportAdapters({
      profiles,
      bindings,
      resolveCredential: ref => store.vault.resolve(ref),
    })
    const certifications = await recentCertifications(db)
    const latestByProfile = new Map<string, StoredCertificationReceipt>()
    for (const receipt of certifications) if (!latestByProfile.has(receipt.profileKey)) latestByProfile.set(receipt.profileKey, receipt)
    const durableByKey = new Map(durable.map(record => [record.profile.key, record]))
    const assignments = await Promise.all([...ASSIGNABLE_USES].map(async use => ({
      use,
      current: await store.currentAssignment(use),
      history: await store.assignmentHistory(use, 12),
    })))

    const inventory = profiles.map(profile => {
      const durableRecord = durableByKey.get(profile.key) || null
      const binding = bindings.find(item => item.profileKey === profile.key) || null
      const adapter = binding ? adapters.find(item => item.protocol === binding.protocol && item.supports(profile)) || null : null
      const credentialConfigured = durableRecord
        ? durableRecord.credentialConfigured
        : binding?.credentialEnv ? Boolean(process.env[binding.credentialEnv]) : !binding?.credentialRef
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
        durableRegistration: Boolean(durableRecord),
        binding: binding ? {
          provider: binding.provider,
          protocol: binding.protocol,
          credentialConfigured,
          apiVersion: binding.apiVersion,
          timeoutMs: binding.timeoutMs,
          maxCallCostUsd: binding.maxCallCostUsd,
        } : null,
        builtInAdapterAvailable: Boolean(adapter),
        certifiable: Boolean(adapter && credentialConfigured),
        latestCertification: latestByProfile.get(profile.key) || null,
      }
    })

    return noStore({
      ok: true,
      registryStrictMode: process.env.ITMOUNTS_MODEL_REGISTRY_REQUIRE_REGISTERED === 'true',
      profiles: inventory,
      assignments,
      certificationReceipts: certifications,
      config: {
        durableRegistry: true,
        serverBootstrapRegistryConfigured: Boolean(process.env.ITMOUNTS_MODEL_REGISTRY_JSON?.trim()),
        serverBootstrapTransportConfigured: Boolean(process.env.ITMOUNTS_MODEL_TRANSPORTS_JSON?.trim()),
        registrationSource: 'durable_host_neutral_registry_plus_server_bootstrap',
        secretsReturned: false,
      },
    })
  } catch (error) {
    return noStore({ error: safeError(error) }, { status: 503 })
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireOwner()
  if (!guard.ok) return noStore({ error: guard.error }, { status: guard.status })
  const actorId = String(guard.ctx.userId || '').trim()
  if (!actorId) return noStore({ error: 'platform_model_actor_required' }, { status: 401 })
  const db = cosServiceDb()
  if (!db) return noStore({ error: 'platform_model_configuration_database_unavailable' }, { status: 503 })
  const store = createSignalBoostModelConfigurationPort(db)
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const action = String(body?.action || 'certify').trim().toLowerCase()

  try {
    if (action === 'register') {
      if (body?.confirmMutation !== true) throw new Error('platform_model_registration_explicit_confirmation_required')
      const [profile] = parseBuyerModelProfiles(JSON.stringify([body?.profile]))
      if (!profile) throw new Error('platform_model_profile_invalid')
      if (allPlatformModelProfiles().some(item => item.key === profile.key)) throw new Error('platform_model_profile_static_conflict')
      const transportInput = safePayload(body?.transport)
      const [binding] = parseModelTransportBindings(JSON.stringify([{
        ...transportInput,
        profileKey: profile.key,
        credentialEnv: null,
        credentialRef: null,
      }]))
      if (!binding || !profile.transportProtocols.includes(binding.protocol)) throw new Error('platform_model_transport_profile_mismatch')
      const existing = await store.getRegistration(profile.key)
      const secretValue = typeof body?.credential === 'string' ? body.credential.trim() : ''
      const willHaveCredential = Boolean(secretValue || existing?.credentialConfigured)
      if ((binding.protocol === 'anthropic_messages' || binding.protocol === 'google_generate_content') && !willHaveCredential) {
        throw new Error('platform_model_transport_credential_required')
      }
      if (willHaveCredential && binding.maxCallCostUsd <= 0) throw new Error('platform_model_transport_cost_ceiling_required')
      const saved = await store.register({
        profile,
        binding,
        secretValue: secretValue || null,
        secretName: String(body?.credentialName || 'apiKey'),
        actorId,
      })
      await appendGovernanceAudit(db, actorId, 'registration_saved', {
        profileKey: saved.profile.key,
        protocol: saved.binding.protocol,
        provider: saved.binding.provider,
        credentialConfigured: saved.credentialConfigured,
        maxCallCostUsd: saved.binding.maxCallCostUsd,
      })
      return noStore({ ok: true, registration: { ...saved, credentialConfigured: saved.credentialConfigured } })
    }

    if (action === 'certify') {
      const profileKey = String(body?.profileKey || '').trim()
      if (!profileKey) throw new Error('platform_model_certification_profile_required')
      if (body?.confirmSpend !== true) throw new Error('platform_model_certification_explicit_spend_confirmation_required')
      const durable = await store.listRegistrations()
      const profiles = mergedProfiles(durable)
      const bindings = mergedBindings(durable)
      const adapters = createBuiltinModelTransportAdapters({
        profiles,
        bindings,
        resolveCredential: ref => store.vault.resolve(ref),
      })
      const receipt = await runPlatformModelCertification({
        profileKey,
        profiles,
        adapters,
        db: certificationAuditDb(db),
      })
      return noStore({ ok: receipt.status !== 'failed', receipt }, { status: receipt.status === 'failed' ? 422 : 200 })
    }

    if (action === 'assign') {
      if (body?.confirmActivation !== true) throw new Error('platform_model_assignment_explicit_confirmation_required')
      const use = assignableUse(body?.use)
      const profileKey = String(body?.profileKey || '').trim()
      const registration = await store.getRegistration(profileKey)
      if (!registration || !registration.enabled) throw new Error('platform_model_assignment_profile_unavailable')
      const receipts = await recentCertifications(db)
      const receipt = latestCertification(receipts, profileKey)
      if (!receipt) throw new Error('platform_model_assignment_certification_required')
      assertModelAssignmentCertification({
        use,
        profile: registration.profile,
        receipt: receipt as unknown as Pick<ModelCertificationReceipt,'profileKey'|'status'|'checks'>,
      })
      const current = await store.currentAssignment(use)
      const expected = body?.expectedCurrentAssignmentId == null ? null : String(body.expectedCurrentAssignmentId)
      if ((current?.assignmentId || null) !== expected) throw new Error('platform_model_assignment_conflict')
      const next = await store.assign({
        use,
        profileKey,
        certificationEventId: receipt.certificationId,
        actorId,
        expectedCurrentAssignmentId: expected,
      })
      await appendGovernanceAudit(db, actorId, 'assignment_changed', {
        use, profileKey, assignmentId: next.assignmentId,
        previousAssignmentId: next.previousAssignmentId,
        certificationEventId: receipt.certificationId,
        crossModelFallbackAllowed: false,
      })
      return noStore({ ok: true, assignment: next })
    }

    if (action === 'rollback') {
      if (body?.confirmRollback !== true) throw new Error('platform_model_rollback_explicit_confirmation_required')
      const use = assignableUse(body?.use)
      const expected = String(body?.expectedCurrentAssignmentId || '').trim()
      if (!expected) throw new Error('platform_model_assignment_current_id_required')
      const next = await store.rollback({ use, actorId, expectedCurrentAssignmentId: expected })
      await appendGovernanceAudit(db, actorId, 'assignment_rolled_back', {
        use, profileKey: next.profileKey, assignmentId: next.assignmentId,
        previousAssignmentId: next.previousAssignmentId,
        crossModelFallbackAllowed: false,
      })
      return noStore({ ok: true, assignment: next })
    }

    if (action === 'disable') {
      if (body?.confirmMutation !== true) throw new Error('platform_model_disable_explicit_confirmation_required')
      const profileKey = String(body?.profileKey || '').trim()
      if (!profileKey) throw new Error('platform_model_profile_required')
      await store.disable(profileKey, actorId)
      await appendGovernanceAudit(db, actorId, 'registration_disabled', { profileKey })
      return noStore({ ok: true, profileKey, disabled: true })
    }

    throw new Error('platform_model_action_invalid')
  } catch (error) {
    const code = safeError(error)
    return noStore({ error: code }, { status: errorStatus(code) })
  }
}

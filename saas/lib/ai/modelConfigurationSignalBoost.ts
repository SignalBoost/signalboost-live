// saas/lib/ai/modelConfigurationSignalBoost.ts
import { randomUUID } from 'node:crypto'
import { cosServiceDb } from '@/lib/cos-core/storage/service-db'
import { vaultDecrypt, vaultEncrypt } from '@/lib/vault/crypto'
import { parseBuyerModelProfiles, type PlatformModelProfile } from './modelCapabilityRegistry.ts'
import { parseModelTransportBindings, type PlatformModelTransportBinding } from './modelTransportConfig.ts'
import type {
  AssignableModelUse,
  ModelAssignmentRecord,
  ModelConfigurationPort,
  ModelCredentialVaultPort,
  ModelRegistrationRecord,
} from './modelConfigurationPort.ts'

type Db = NonNullable<ReturnType<typeof cosServiceDb>>

function requireDb(input?: Db | null): Db {
  const db = input ?? cosServiceDb()
  if (!db) throw new Error('platform_model_configuration_database_unavailable')
  return db
}

function assignment(row: any): ModelAssignmentRecord {
  return Object.freeze({
    assignmentId: String(row.assignment_id || ''),
    use: String(row.use || '') as AssignableModelUse,
    profileKey: String(row.profile_key || ''),
    previousAssignmentId: row.previous_assignment_id ? String(row.previous_assignment_id) : null,
    certificationEventId: String(row.certification_event_id || ''),
    status: String(row.status || '') as ModelAssignmentRecord['status'],
    createdBy: String(row.created_by || ''),
    createdAt: new Date(row.created_at).toISOString(),
  })
}

function profileFromRow(row: any): PlatformModelProfile {
  const [profile] = parseBuyerModelProfiles(JSON.stringify([row.profile]))
  if (!profile || profile.key !== String(row.profile_key || '')) throw new Error('platform_model_persisted_profile_invalid')
  return profile
}

function bindingFromRow(row: any): PlatformModelTransportBinding {
  const [binding] = parseModelTransportBindings(JSON.stringify([{
    profileKey: row.profile_key,
    protocol: row.protocol,
    provider: row.provider,
    endpoint: row.endpoint,
    credentialRef: row.credential_ref,
    apiVersion: row.api_version,
    timeoutMs: row.timeout_ms,
    maxCallCostUsd: row.max_call_cost_usd,
  }]))
  if (!binding) throw new Error('platform_model_persisted_transport_invalid')
  return binding
}

function secretName(value: string | null | undefined): string {
  const normalized = String(value || 'apiKey').trim().replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 80)
  if (!normalized) throw new Error('platform_model_secret_name_invalid')
  return normalized
}

function encryptSecret(value: string) {
  const normalized = String(value || '').trim()
  if (!normalized) throw new Error('platform_model_secret_required')
  if (normalized.length > 32_768) throw new Error('platform_model_secret_too_large')
  const result = vaultEncrypt(normalized)
  if (!result.ok || !result.valueEncrypted || !result.iv || !result.tag) {
    throw new Error(result.error || 'platform_model_secret_encrypt_failed')
  }
  return Object.freeze({
    valueEncrypted: result.valueEncrypted,
    iv: result.iv,
    tag: result.tag,
    last4: normalized.slice(-4),
  })
}

async function registrations(db: Db): Promise<readonly ModelRegistrationRecord[]> {
  const [{ data: profiles, error: profilesError }, { data: transports, error: transportsError }] = await Promise.all([
    db.from('platform_model_profiles').select('profile_key,profile,enabled,created_at,updated_at').order('profile_key'),
    db.from('platform_model_transports').select('profile_key,protocol,provider,endpoint,credential_ref,api_version,timeout_ms,max_call_cost_usd,enabled').eq('enabled', true),
  ])
  if (profilesError) throw new Error(profilesError.message)
  if (transportsError) throw new Error(transportsError.message)
  const byProfile = new Map<string, any>()
  for (const row of transports || []) if (!byProfile.has(String(row.profile_key))) byProfile.set(String(row.profile_key), row)
  return Object.freeze((profiles || []).flatMap((row: any) => {
    const transport = byProfile.get(String(row.profile_key))
    if (!transport) return []
    const profile = profileFromRow(row)
    const binding = bindingFromRow(transport)
    return [Object.freeze({
      profile,
      binding,
      credentialConfigured: Boolean(transport.credential_ref),
      enabled: Boolean(row.enabled && transport.enabled),
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    })]
  }))
}

export function createSignalBoostModelConfigurationPort(dbInput?: Db | null): ModelConfigurationPort {
  const db = requireDb(dbInput)

  const vault: ModelCredentialVaultPort = Object.freeze({
    async store(input) {
      const encrypted = encryptSecret(input.secretValue)
      const credentialRef = `model-vault:${randomUUID()}`
      const { error } = await db.from('platform_model_credentials').insert({
        credential_ref: credentialRef,
        profile_key: input.profileKey,
        secret_name: secretName(input.secretName),
        value_encrypted: encrypted.valueEncrypted,
        iv: encrypted.iv,
        tag: encrypted.tag,
        last4: encrypted.last4,
        created_by: input.actorId,
        updated_at: new Date().toISOString(),
      })
      if (error) throw new Error(error.message)
      return Object.freeze({ credentialRef, last4: encrypted.last4 })
    },
    async resolve(credentialRef) {
      const { data, error } = await db.from('platform_model_credentials')
        .select('value_encrypted,iv,tag')
        .eq('credential_ref', credentialRef)
        .maybeSingle()
      if (error) throw new Error(error.message)
      if (!data) return null
      const result = vaultDecrypt(String(data.value_encrypted), String(data.iv), String(data.tag))
      if (!result.ok || typeof result.value !== 'string') throw new Error(result.error || 'platform_model_secret_decrypt_failed')
      return result.value
    },
    async remove(credentialRef) {
      const { error } = await db.from('platform_model_credentials').delete().eq('credential_ref', credentialRef)
      if (error) throw new Error(error.message)
    },
  })

  return Object.freeze({
    vault,
    async listRegistrations() {
      return registrations(db)
    },
    async getRegistration(profileKey) {
      return (await registrations(db)).find(item => item.profile.key === profileKey) || null
    },
    async register(input) {
      const secret = input.secretValue ? encryptSecret(input.secretValue) : null
      const credentialRef = secret ? `model-vault:${randomUUID()}` : null
      const binding = {
        ...input.binding,
        credentialEnv: null,
        credentialRef,
      }
      const { data, error } = await db.rpc('platform_register_model', {
        p_profile: input.profile as any,
        p_binding: binding as any,
        p_actor: input.actorId,
        p_credential_ref: credentialRef,
        p_secret_name: secret ? secretName(input.secretName) : null,
        p_value_encrypted: secret?.valueEncrypted ?? null,
        p_iv: secret?.iv ?? null,
        p_tag: secret?.tag ?? null,
        p_last4: secret?.last4 ?? null,
      })
      if (error) throw new Error(error.message)
      if (String(data || '') !== input.profile.key) throw new Error('platform_model_registration_identity_mismatch')
      const saved = (await registrations(db)).find(item => item.profile.key === input.profile.key) || null
      if (!saved) throw new Error('platform_model_registration_not_observable')
      return saved
    },
    async disable(profileKey, actorId) {
      const { error } = await db.rpc('platform_disable_model', { p_profile_key: profileKey, p_actor: actorId })
      if (error) throw new Error(error.message)
    },
    async currentAssignment(use) {
      const { data, error } = await db.from('platform_model_assignments')
        .select('*').eq('use', use).eq('status', 'active').maybeSingle()
      if (error) throw new Error(error.message)
      return data ? assignment(data) : null
    },
    async assignmentHistory(use, limit = 20) {
      const { data, error } = await db.from('platform_model_assignments')
        .select('*').eq('use', use).order('created_at', { ascending: false }).limit(Math.max(1, Math.min(100, limit)))
      if (error) throw new Error(error.message)
      return Object.freeze((data || []).map(assignment))
    },
    async assign(input) {
      const { data, error } = await db.rpc('platform_set_model_assignment', {
        p_use: input.use,
        p_profile_key: input.profileKey,
        p_certification_event_id: input.certificationEventId,
        p_actor: input.actorId,
        p_expected_current_assignment_id: input.expectedCurrentAssignmentId || null,
      })
      if (error) throw new Error(error.message)
      return assignment(data)
    },
    async rollback(input) {
      const { data, error } = await db.rpc('platform_rollback_model_assignment', {
        p_use: input.use,
        p_actor: input.actorId,
        p_expected_current_assignment_id: input.expectedCurrentAssignmentId,
      })
      if (error) throw new Error(error.message)
      return assignment(data)
    },
  })
}

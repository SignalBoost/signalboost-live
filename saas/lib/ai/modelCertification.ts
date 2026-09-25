// saas/lib/ai/modelCertification.ts
import { randomUUID } from 'node:crypto'
import { allPlatformModelProfiles, type PlatformModelProfile } from './modelCapabilityRegistry.ts'
import { requireTransportForProfile, type ModelTransportAdapter, type PlatformModelResponse } from './modelTransportAdapter.ts'
import { createBuiltinModelTransportAdapters } from './modelTransportAdapters.ts'

export const PLATFORM_MODEL_CERTIFICATION_VERSION = 'platform-model-certification-v1' as const

export type ModelCertificationCheckId = 'health' | 'chat_completion' | 'structured_json' | 'tool_calling'
export type ModelCertificationCheck = Readonly<{
  id: ModelCertificationCheckId
  status: 'passed' | 'failed' | 'not_applicable'
  latencyMs: number
  requestId: string | null
  errorCode: string | null
}>
export type ModelCertificationReceipt = Readonly<{
  schemaVersion: typeof PLATFORM_MODEL_CERTIFICATION_VERSION
  certificationId: string
  profileKey: string
  family: string
  modelId: string
  providerModelId: string
  revision: string | null
  adapterId: string
  transportProtocol: string
  startedAt: string
  completedAt: string
  status: 'passed' | 'partial' | 'failed'
  checks: readonly ModelCertificationCheck[]
  unverifiedDeclaredCapabilities: readonly string[]
  outputsPersisted: false
  credentialsPersisted: false
  authorityExpanded: false
}>

type AuditDb = {
  from(table: string): {
    insert(value: unknown): Promise<{ error?: { message?: string } | null }>
  }
}

function safeErrorCode(value: unknown): string {
  const raw = value instanceof Error ? value.message : String(value || 'model_certification_failed')
  return raw.match(/^[a-z0-9_.:-]{1,180}/i)?.[0] ?? 'model_certification_failed'
}

function elapsed(started: number): number {
  return Math.max(0, Date.now() - started)
}

function check(
  id: ModelCertificationCheckId,
  status: ModelCertificationCheck['status'],
  latencyMs: number,
  response?: PlatformModelResponse | null,
  error?: unknown,
): ModelCertificationCheck {
  return Object.freeze({
    id,
    status,
    latencyMs,
    requestId: response?.requestId ?? null,
    errorCode: error ? safeErrorCode(error) : null,
  })
}

function validateChat(response: PlatformModelResponse): void {
  if (!String(response.text || '').toUpperCase().includes('ITMOUNTS_MODEL_CERT_OK')) {
    throw new Error('model_certification_chat_marker_missing')
  }
}

function validateStructuredJson(response: PlatformModelResponse): void {
  const raw = String(response.text || '').trim()
  let parsed: any
  try { parsed = JSON.parse(raw) } catch { throw new Error('model_certification_json_invalid') }
  if (parsed?.ok !== true || parsed?.marker !== 'ITMOUNTS_MODEL_CERT_JSON') {
    throw new Error('model_certification_json_marker_missing')
  }
}

function validateToolCall(response: PlatformModelResponse): void {
  const call = response.toolCalls.find(item => item.name === 'certify_echo')
  if (!call) throw new Error('model_certification_tool_call_missing')
  let args: any
  try { args = JSON.parse(call.arguments || '{}') } catch { throw new Error('model_certification_tool_arguments_invalid') }
  if (args?.token !== 'ITMOUNTS_MODEL_CERT_TOOL') throw new Error('model_certification_tool_marker_missing')
}

async function runCheck(
  id: ModelCertificationCheckId,
  run: () => Promise<PlatformModelResponse>,
  validate: (response: PlatformModelResponse) => void,
): Promise<ModelCertificationCheck> {
  const started = Date.now()
  try {
    const response = await run()
    validate(response)
    return check(id, 'passed', elapsed(started), response)
  } catch (error) {
    return check(id, 'failed', elapsed(started), null, error)
  }
}

function unverifiedDeclaredCapabilities(profile: PlatformModelProfile): readonly string[] {
  const covered = new Set(['chatCompletion', 'structuredJson', 'toolCalling'])
  return Object.freeze(
    Object.entries(profile.inference)
      .filter(([name, state]) => state === 'validated' && !covered.has(name))
      .map(([name]) => name),
  )
}

async function persistReceipt(db: AuditDb | null, receipt: ModelCertificationReceipt): Promise<void> {
  if (!db) return
  const { error } = await db.from('supervisor_audit_events').insert({
    event_id: receipt.certificationId,
    execution_id: receipt.certificationId,
    incident_id: `model-cert:${receipt.profileKey}`,
    event_type: 'platform_model_certification_completed',
    occurred_at: receipt.completedAt,
    payload: {
      profileKey: receipt.profileKey,
      family: receipt.family,
      modelId: receipt.modelId,
      providerModelId: receipt.providerModelId,
      revision: receipt.revision,
      adapterId: receipt.adapterId,
      transportProtocol: receipt.transportProtocol,
      status: receipt.status,
      checks: receipt.checks,
      unverifiedDeclaredCapabilities: receipt.unverifiedDeclaredCapabilities,
      outputsPersisted: false,
      credentialsPersisted: false,
      authorityExpanded: false,
    },
    schema_version: PLATFORM_MODEL_CERTIFICATION_VERSION,
  })
  if (error) throw new Error('platform_model_certification_receipt_persist_failed')
}

export async function runPlatformModelCertification(input: {
  profileKey: string
  profiles?: readonly PlatformModelProfile[]
  adapters?: readonly ModelTransportAdapter[]
  db?: AuditDb | null
  now?: () => Date
  id?: () => string
}): Promise<ModelCertificationReceipt> {
  const now = input.now || (() => new Date())
  const profiles = input.profiles || allPlatformModelProfiles()
  const profile = profiles.find(item => item.key === String(input.profileKey || '').trim())
  if (!profile) throw new Error('platform_model_certification_profile_not_found')
  const adapters = input.adapters || createBuiltinModelTransportAdapters({ profiles })
  const adapter = requireTransportForProfile(profile, adapters)
  const certificationId = `model-cert-${(input.id || randomUUID)()}`
  const startedAt = now().toISOString()
  const checks: ModelCertificationCheck[] = []

  const healthStarted = Date.now()
  try {
    const health = await adapter.health(profile)
    if (!health.ok) throw new Error(health.error || 'model_certification_health_failed')
    checks.push(check('health', 'passed', elapsed(healthStarted)))
  } catch (error) {
    checks.push(check('health', 'failed', elapsed(healthStarted), null, error))
  }

  if (checks[0]?.status === 'passed') {
    checks.push(await runCheck(
      'chat_completion',
      () => adapter.chat({
        profile,
        messages: [
          { role: 'system', content: 'This is a bounded transport certification check. Follow the requested marker exactly.' },
          { role: 'user', content: 'Reply with exactly ITMOUNTS_MODEL_CERT_OK.' },
        ],
        maxOutputTokens: 32,
        temperature: 0,
        timeoutMs: 30_000,
      }),
      validateChat,
    ))

    if (profile.inference.structuredJson === 'validated') {
      checks.push(await runCheck(
        'structured_json',
        () => adapter.chat({
          profile,
          messages: [{ role: 'user', content: 'Return the required JSON object with ok=true and marker=ITMOUNTS_MODEL_CERT_JSON.' }],
          jsonObject: true,
          jsonSchema: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              marker: { type: 'string' },
            },
            required: ['ok', 'marker'],
            additionalProperties: false,
          },
          maxOutputTokens: 96,
          temperature: 0,
          timeoutMs: 30_000,
        }),
        validateStructuredJson,
      ))
    } else checks.push(check('structured_json', 'not_applicable', 0))

    if (profile.inference.toolCalling === 'validated') {
      checks.push(await runCheck(
        'tool_calling',
        () => adapter.chat({
          profile,
          messages: [{ role: 'user', content: 'Call certify_echo exactly once with token ITMOUNTS_MODEL_CERT_TOOL. Do not answer in prose.' }],
          tools: [{
            name: 'certify_echo',
            description: 'Certification-only echo tool.',
            parameters: {
              type: 'object',
              properties: { token: { type: 'string' } },
              required: ['token'],
              additionalProperties: false,
            },
          }],
          toolChoice: { name: 'certify_echo' },
          maxOutputTokens: 96,
          temperature: 0,
          timeoutMs: 30_000,
        }),
        validateToolCall,
      ))
    } else checks.push(check('tool_calling', 'not_applicable', 0))
  } else {
    checks.push(check('chat_completion', 'failed', 0, null, 'model_certification_health_failed'))
    checks.push(check('structured_json', 'not_applicable', 0))
    checks.push(check('tool_calling', 'not_applicable', 0))
  }

  const unverified = unverifiedDeclaredCapabilities(profile)
  const failed = checks.some(item => item.status === 'failed')
  const status: ModelCertificationReceipt['status'] = failed ? 'failed' : unverified.length ? 'partial' : 'passed'
  const receipt: ModelCertificationReceipt = Object.freeze({
    schemaVersion: PLATFORM_MODEL_CERTIFICATION_VERSION,
    certificationId,
    profileKey: profile.key,
    family: profile.family,
    modelId: profile.modelId,
    providerModelId: profile.providerModelId,
    revision: profile.revision,
    adapterId: adapter.id,
    transportProtocol: adapter.protocol,
    startedAt,
    completedAt: now().toISOString(),
    status,
    checks: Object.freeze(checks),
    unverifiedDeclaredCapabilities: unverified,
    outputsPersisted: false,
    credentialsPersisted: false,
    authorityExpanded: false,
  })
  await persistReceipt(input.db ?? null, receipt)
  return receipt
}

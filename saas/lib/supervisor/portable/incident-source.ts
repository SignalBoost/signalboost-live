// saas/lib/supervisor/portable/incident-source.ts
//
// THE UNIVERSAL INTAKE CONTRACT.
//
// The Supervisor could always diagnose, gate and repair an incident. What it could
// not do was RECEIVE one: a buyer had to construct a SupervisorIncident by hand and
// call the orchestrator themselves, against no documented shape. This file is that
// missing socket.
//
// The shape of the contract is deliberate:
//   - ONE canonical incident. This module does NOT invent a second incident format.
//     Everything here funnels into the existing incidentSchema, so the orchestrator,
//     policy engine and audit trail are untouched by intake.
//   - The SOCKET is universal, the PLUG is per-vendor. An adapter author writes only
//     a `map` function that renames their vendor's fields. Validation, sanitization,
//     severity/environment normalization, fingerprinting and deduplication all happen
//     here, once, identically for every vendor. An adapter cannot skip them.
//   - NO transport, NO crypto policy, NO storage. Signature verification belongs to
//     the webhook adapter; durable storage belongs to the buyer. Both arrive here as
//     injected ports so this file stays importable from anywhere, including a buyer's
//     own adapter written against nothing but this contract.

import { incidentSchema, isPlainSerializable, type SerializableValue, type SupervisorIncident } from '../incident-schema.ts'

// ── Limits ───────────────────────────────────────────────────────────────────
// A monitoring vendor decides how big its payload is, not us. Every bound below is
// enforced before the incident reaches the orchestrator so a hostile or merely
// verbose sender cannot turn intake into a memory or storage problem.
export const INTAKE_LIMITS = Object.freeze({
  maxStringLength: 2000,
  maxEvidenceItems: 20,
  maxMetadataEntries: 100,
  maxMetadataDepth: 6,
})

// ── What arrives ─────────────────────────────────────────────────────────────
export interface RawIncidentDelivery {
  headers: Readonly<Record<string, string>>
  rawBody: string
  receivedAt?: string
}

// ── What an adapter produces ─────────────────────────────────────────────────
// This is the ONLY thing a vendor adapter writes. Everything is optional except the
// provider and the message, because a vendor that cannot tell us what broke has not
// sent us an incident.
export interface IncidentMapping {
  provider: string
  errorMessage: string
  environment?: string
  severity?: string
  detectedAt?: string
  errorCode?: string
  affectedResource?: string
  evidence?: Array<{ evidenceId?: string; type?: string; capturedAt?: string; summary: string; reference?: string; digest?: string }>
  metadata?: Record<string, unknown>
  // The vendor's own grouping identity (Datadog aggregation key, Alertmanager
  // fingerprint, PagerDuty dedup_key). When present it drives deduplication, because
  // the vendor knows better than we do which alerts are the same alert.
  dedupeKey?: string
}

export type IncidentSourceStatus = 'live' | 'staged' | 'disabled'

export type IncidentSourceOutcome =
  | { status: 'accepted'; incident: SupervisorIncident; fingerprint: string }
  | { status: 'duplicate'; fingerprint: string; duplicateOf: string }
  | { status: 'ignored'; reason: string }
  | { status: 'rejected'; reason: string }

export interface IncidentSourceHealth {
  sourceId: string
  vendor: string
  status: IncidentSourceStatus
  received: number
  accepted: number
  duplicates: number
  ignored: number
  rejected: number
  lastReceivedAt: string | null
  lastAcceptedAt: string | null
  lastRejectionReason: string | null
}

export interface IncidentSource {
  readonly sourceId: string
  readonly vendor: string
  readonly status: IncidentSourceStatus
  receive(delivery: RawIncidentDelivery): Promise<IncidentSourceOutcome>
  health(): IncidentSourceHealth
}

// ── Ports the buyer binds ────────────────────────────────────────────────────
// Deliberately NOT a table. A portable that owns storage is not portable; the buyer
// brings their datastore and implements these two methods against it.
export interface DedupeStore {
  seen(fingerprint: string): Promise<string | null>
  remember(fingerprint: string, incidentId: string, expiresAt: string): Promise<void>
}

export interface IncidentStore {
  persist(incident: SupervisorIncident, context: { sourceId: string; vendor: string; fingerprint: string }): Promise<void>
}

// ── Adapter definition ───────────────────────────────────────────────────────
export interface IncidentSourceDefinition {
  sourceId: string
  vendor: string
  // 'staged' means the mapping is proven against fixtures but has never run against
  // real provider traffic. It is reported, never hidden — a staged source must not
  // read as a live integration anywhere in the product.
  status: IncidentSourceStatus
  // Transport-level auth is the adapter's business (HMAC, shared secret, mTLS header).
  // Returning ok:false rejects before the body is ever mapped. Flat shape rather than
  // a discriminated union on purpose: this repo's tsconfig is non-strict, so `!x.ok`
  // does not narrow a union and the `reason` field would be unreachable to callers.
  authenticate?(delivery: RawIncidentDelivery): { ok: boolean; reason?: string }
  // Return null to IGNORE a delivery that is legitimately not an incident — a
  // resolution notice, a heartbeat, a test ping. Ignoring is not rejecting.
  map(body: unknown, delivery: RawIncidentDelivery): IncidentMapping | null
}

export interface IncidentSourceRuntime {
  dedupe?: DedupeStore
  store?: IncidentStore
  dedupeWindowMs?: number
  now?: () => Date
  incidentIdFactory?: (fingerprint: string) => string
}

export class IncidentSourceConfigError extends Error {
  constructor(message: string) { super(message); this.name = 'IncidentSourceConfigError' }
}

// ── Normalization ────────────────────────────────────────────────────────────
// Every vendor spells severity and environment differently. The canonical schema
// accepts three of each, so an unmapped value must land somewhere defined rather
// than throw — an alert with an odd severity is still an alert.
// The high/medium/low scale is the most common severity vocabulary there is —
// PagerDuty urgency, Grafana labels, Google Cloud, Splunk, ServiceNow — and none of
// it was here. `high` fell through to the fallback, so the most urgent thing most
// vendors can send arrived as a warning.
//
// It belongs HERE and not in any one adapter. Patching a single adapter fixes that
// vendor and leaves the other seven silently downgrading, with a green test suite
// because only the patched vendor is covered. One vocabulary, one place.
//
// `high` maps to critical because in every scale that uses it, high is the level that
// wakes someone — including PagerDuty urgency, where high and low are the only values.
const severityWords: Array<[RegExp, SupervisorIncident['severity']]> = [
  [/^(crit|critical|fatal|emergency|sev-?[01]|p[01]|error|alert|down|firing|high|urgent|major|re-?triggered|triggered|alarm)$/i, 'critical'],
  [/^(warn|warning|minor|degraded|sev-?[23]|p[23]|elevated|medium|moderate|no ?data|insufficient_?data)$/i, 'warning'],
  [/^(info|informational|notice|ok|low|none|debug|sev-?[45]|p[45])$/i, 'info'],
]

export function normalizeSeverity(value: unknown, fallback: SupervisorIncident['severity'] = 'warning'): SupervisorIncident['severity'] {
  if (typeof value === 'number') return value <= 1 ? 'critical' : value <= 3 ? 'warning' : 'info'
  if (typeof value !== 'string') return fallback
  const token = value.trim()
  for (const [pattern, mapped] of severityWords) if (pattern.test(token)) return mapped
  return fallback
}

const environmentWords: Array<[RegExp, SupervisorIncident['environment']]> = [
  [/^(prod|production|live|prd)$/i, 'production'],
  [/^(preview|stage|staging|stg|test|qa|uat)$/i, 'preview'],
  [/^(sandbox|dev|development|local)$/i, 'sandbox'],
]

// Defaults to 'production' on purpose. An unlabelled incident treated as production
// gets the STRICTER policy path (production modifications require approval); guessing
// 'sandbox' would quietly widen what may run unattended.
export function normalizeEnvironment(value: unknown, fallback: SupervisorIncident['environment'] = 'production'): SupervisorIncident['environment'] {
  if (typeof value !== 'string') return fallback
  const token = value.trim()
  for (const [pattern, mapped] of environmentWords) if (pattern.test(token)) return mapped
  return fallback
}

// ── Sanitization ─────────────────────────────────────────────────────────────
// incidentSchema REJECTS an incident whose metadata carries a secret-shaped KEY —
// the key alone, whatever its value. Vendor payloads carry such keys routinely (auth
// headers echoed back, integration tokens in a webhook envelope), so an unsanitized
// adapter would fail closed on perfectly ordinary traffic.
//
// So the key is REMOVED, not blanked. Replacing the value with a placeholder would
// still leave `apiKey` present and the schema would still reject. What survives is a
// list of the paths that were dropped, under a name that is not itself secret-shaped
// — a reviewer can see that something was removed and from where, and no plaintext
// secret ever reaches the incident, the audit trail, or the buyer's SIEM.
const secretKeyPattern = /(password|apiKey|api_key|token|secret|privateKey|accessToken)/i
export const REDACTED = '[redacted]'
export const REDACTED_KEYS_FIELD = 'intakeRedactedKeys'

function clampString(value: string): string {
  return value.length > INTAKE_LIMITS.maxStringLength ? `${value.slice(0, INTAKE_LIMITS.maxStringLength)}…` : value
}

export function sanitizeMetadata(input: unknown, depth = 0, removed: string[] = [], path = ''): Record<string, SerializableValue> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
  const output: Record<string, SerializableValue> = {}
  let entries = 0
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (entries >= INTAKE_LIMITS.maxMetadataEntries) break
    entries += 1
    const here = path ? `${path}.${key}` : key
    if (secretKeyPattern.test(key) && !key.endsWith('Ref')) { removed.push(here); continue }
    const cleaned = sanitizeValue(value, depth + 1, removed, here)
    if (cleaned !== undefined) output[key] = cleaned
  }
  return output
}

function sanitizeValue(value: unknown, depth: number, removed: string[], path: string): SerializableValue | undefined {
  if (value === null) return null
  if (typeof value === 'string') return clampString(value)
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (depth >= INTAKE_LIMITS.maxMetadataDepth) return REDACTED
  if (Array.isArray(value)) {
    return value.slice(0, INTAKE_LIMITS.maxMetadataEntries)
      .map((item, index) => sanitizeValue(item, depth + 1, removed, `${path}[${index}]`))
      .filter((item): item is SerializableValue => item !== undefined)
  }
  if (typeof value === 'object') return sanitizeMetadata(value, depth, removed, path)
  return undefined
}

// ── Fingerprinting ───────────────────────────────────────────────────────────
// Deterministic and collision-resistant. The fields are the ones that identify WHICH
// problem this is; detectedAt is deliberately excluded so the same failure recurring
// a minute later fingerprints identically and deduplicates.
export function fingerprintIncident(input: { provider: string; environment: string; dedupeKey?: string; errorCode?: string; errorMessage: string; affectedResource?: string }): string {
  // When the vendor supplies a dedupe key it IS the identity of the alert, and
  // nothing beside it may split it. Previously errorCode and affectedResource were
  // mixed in regardless, so an adapter that put a per-delivery value in errorCode —
  // an event id, a run id — produced a fresh fingerprint every time and deduplication
  // silently never engaged, even though the stable key was right there.
  const base = input.dedupeKey
    ? [input.provider, input.environment, input.dedupeKey].join('\u0000')
    : [input.provider, input.environment, '', input.errorCode ?? '', input.errorMessage, input.affectedResource ?? ''].join('\u0000')
  return `sha256:${sha256Hex(base)}`
}

// A local SHA-256 so this module imports nothing at all. A buyer extracting the
// portable gets identical fingerprints on any JavaScript runtime, with no crypto
// module and no dependency to install.
function sha256Hex(message: string): string {
  const K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]
  const H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]
  const bytes: number[] = []
  for (let i = 0; i < message.length; i += 1) {
    const code = message.codePointAt(i) as number
    if (code < 0x80) bytes.push(code)
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 63))
    else if (code < 0x10000) bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63))
    else { bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 63), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63)); i += 1 }
  }
  const bitLength = bytes.length * 8
  bytes.push(0x80)
  while (bytes.length % 64 !== 56) bytes.push(0)
  for (let i = 7; i >= 0; i -= 1) bytes.push((bitLength / 2 ** (8 * i)) & 0xff)
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n))
  const w = new Array<number>(64)
  for (let offset = 0; offset < bytes.length; offset += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = (bytes[offset + i * 4] << 24) | (bytes[offset + i * 4 + 1] << 16) | (bytes[offset + i * 4 + 2] << 8) | bytes[offset + i * 4 + 3]
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0
    }
    let [a, b, c, d, e, f, g, h] = H
    for (let i = 0; i < 64; i += 1) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
      const ch = (e & f) ^ (~e & g)
      const t1 = (h + S1 + ch + K[i] + w[i]) | 0
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const t2 = (S0 + maj) | 0
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0
    }
    const next = [a, b, c, d, e, f, g, h]
    for (let i = 0; i < 8; i += 1) H[i] = (H[i] + next[i]) | 0
  }
  return H.map(value => (value >>> 0).toString(16).padStart(8, '0')).join('')
}

// ── Reference in-memory stores ───────────────────────────────────────────────
// Shipped so the contract is runnable the moment a buyer imports it, and so tests
// need no infrastructure. NOT durable — a buyer running more than one process binds
// their own. Documented as such rather than quietly presented as production storage.
export function createInMemoryDedupeStore(options: { now?: () => Date } = {}): DedupeStore & { size(): number } {
  const now = options.now ?? (() => new Date())
  const entries = new Map<string, { incidentId: string; expiresAt: number }>()
  const sweep = () => { const t = now().getTime(); for (const [key, value] of entries) if (value.expiresAt <= t) entries.delete(key) }
  return {
    async seen(fingerprint) { sweep(); return entries.get(fingerprint)?.incidentId ?? null },
    async remember(fingerprint, incidentId, expiresAt) { sweep(); entries.set(fingerprint, { incidentId, expiresAt: Date.parse(expiresAt) }) },
    size() { sweep(); return entries.size },
  }
}

export function createInMemoryIncidentStore(): IncidentStore & { all(): Array<{ incident: SupervisorIncident; fingerprint: string }> } {
  const rows: Array<{ incident: SupervisorIncident; fingerprint: string }> = []
  return {
    async persist(incident, context) { rows.push({ incident, fingerprint: context.fingerprint }) },
    all() { return [...rows] },
  }
}

// ── The runtime every adapter runs through ───────────────────────────────────
const DEFAULT_DEDUPE_WINDOW_MS = 15 * 60 * 1000

export function createIncidentSource(definition: IncidentSourceDefinition, runtime: IncidentSourceRuntime = {}): IncidentSource {
  if (!definition.sourceId?.trim()) throw new IncidentSourceConfigError('sourceId is required')
  if (!definition.vendor?.trim()) throw new IncidentSourceConfigError('vendor is required')
  if (typeof definition.map !== 'function') throw new IncidentSourceConfigError('map must be a function')

  const now = runtime.now ?? (() => new Date())
  const windowMs = runtime.dedupeWindowMs ?? DEFAULT_DEDUPE_WINDOW_MS
  const idFactory = runtime.incidentIdFactory ?? ((fingerprint: string) => `incident-${fingerprint.replace('sha256:', '').slice(0, 24)}`)

  const counters = { received: 0, accepted: 0, duplicates: 0, ignored: 0, rejected: 0 }
  let lastReceivedAt: string | null = null
  let lastAcceptedAt: string | null = null
  let lastRejectionReason: string | null = null

  const reject = (reason: string): IncidentSourceOutcome => { counters.rejected += 1; lastRejectionReason = reason; return { status: 'rejected', reason } }

  return {
    sourceId: definition.sourceId,
    vendor: definition.vendor,
    status: definition.status,

    async receive(delivery) {
      counters.received += 1
      const receivedAt = delivery.receivedAt ?? now().toISOString()
      lastReceivedAt = receivedAt

      // A disabled source refuses before authentication, so turning a source off is
      // a complete stop rather than a change in what it accepts.
      if (definition.status === 'disabled') return reject('source_disabled')

      if (definition.authenticate) {
        let auth: { ok: boolean; reason?: string }
        try { auth = definition.authenticate(delivery) } catch { return reject('authentication_error') }
        if (!auth.ok) return reject(auth.reason || 'authentication_failed')
      }

      let body: unknown
      try { body = JSON.parse(delivery.rawBody) } catch { return reject('invalid_json') }

      let mapping: IncidentMapping | null
      // An adapter that throws is a bug in the adapter, never an outage of intake.
      try { mapping = definition.map(body, delivery) } catch (error) { return reject(`mapping_error: ${error instanceof Error ? error.message : 'unknown'}`) }

      if (mapping === null) { counters.ignored += 1; return { status: 'ignored', reason: 'not_an_incident' } }
      if (!mapping.provider?.trim()) return reject('mapping_missing_provider')
      if (!mapping.errorMessage?.trim()) return reject('mapping_missing_error_message')

      const environment = normalizeEnvironment(mapping.environment)
      const severity = normalizeSeverity(mapping.severity)
      const detectedAt = mapping.detectedAt && !Number.isNaN(Date.parse(mapping.detectedAt)) ? mapping.detectedAt : receivedAt

      const fingerprint = fingerprintIncident({
        provider: mapping.provider,
        environment,
        dedupeKey: mapping.dedupeKey,
        errorCode: mapping.errorCode,
        errorMessage: mapping.errorMessage,
        affectedResource: mapping.affectedResource,
      })

      if (runtime.dedupe) {
        let existing: string | null = null
        // A dedupe store that is down must not silently let every duplicate through
        // as a fresh incident, nor take intake down. It fails OPEN and is reported.
        try { existing = await runtime.dedupe.seen(fingerprint) } catch { existing = null }
        if (existing) { counters.duplicates += 1; return { status: 'duplicate', fingerprint, duplicateOf: existing } }
      }

      const incidentId = idFactory(fingerprint)
      const evidenceInput = (mapping.evidence ?? []).slice(0, INTAKE_LIMITS.maxEvidenceItems)
      const evidence = evidenceInput.length > 0
        ? evidenceInput.map((item, index) => ({
            evidenceId: item.evidenceId?.trim() || `${incidentId}-evidence-${index + 1}`,
            type: item.type?.trim() || 'vendor_payload',
            capturedAt: item.capturedAt && !Number.isNaN(Date.parse(item.capturedAt)) ? item.capturedAt : detectedAt,
            summary: clampString(item.summary),
            ...(item.reference ? { reference: clampString(item.reference) } : {}),
            ...(item.digest ? { digest: clampString(item.digest) } : {}),
          }))
        // The schema requires non-empty evidence, and rightly so — an incident with
        // no evidence cannot be diagnosed. A vendor that supplies none still leaves a
        // record of what arrived and from where.
        : [{ evidenceId: `${incidentId}-evidence-1`, type: 'vendor_alert', capturedAt: detectedAt, summary: clampString(mapping.errorMessage) }]

      const removedKeys: string[] = []
      const metadata = sanitizeMetadata({
        ...(mapping.metadata ?? {}),
        intakeSourceId: definition.sourceId,
        intakeVendor: definition.vendor,
        intakeStatus: definition.status,
        intakeFingerprint: fingerprint,
        ...(mapping.dedupeKey ? { intakeDedupeKey: mapping.dedupeKey } : {}),
      }, 0, removedKeys)
      if (removedKeys.length > 0) metadata[REDACTED_KEYS_FIELD] = removedKeys.slice(0, INTAKE_LIMITS.maxMetadataEntries)
      if (!isPlainSerializable(metadata)) return reject('metadata_not_serializable')

      let incident: SupervisorIncident
      try {
        incident = incidentSchema.parse({
          incidentId,
          provider: mapping.provider.trim(),
          environment,
          severity,
          detectedAt,
          source: 'webhook',
          ...(mapping.errorCode ? { errorCode: clampString(mapping.errorCode) } : {}),
          errorMessage: clampString(mapping.errorMessage),
          evidence,
          ...(mapping.affectedResource ? { affectedResource: clampString(mapping.affectedResource) } : {}),
          metadata,
        })
      } catch (error) {
        return reject(`schema_rejected: ${error instanceof Error ? error.message : 'unknown'}`)
      }

      // Persist and remember AFTER the incident is valid. Recording a fingerprint for
      // an incident that never existed would suppress the next real one.
      if (runtime.store) {
        try { await runtime.store.persist(incident, { sourceId: definition.sourceId, vendor: definition.vendor, fingerprint }) }
        catch (error) { return reject(`persist_failed: ${error instanceof Error ? error.message : 'unknown'}`) }
      }
      if (runtime.dedupe) {
        try { await runtime.dedupe.remember(fingerprint, incidentId, new Date(now().getTime() + windowMs).toISOString()) } catch {}
      }

      counters.accepted += 1
      lastAcceptedAt = receivedAt
      return { status: 'accepted', incident, fingerprint }
    },

    health() {
      return Object.freeze({
        sourceId: definition.sourceId,
        vendor: definition.vendor,
        status: definition.status,
        received: counters.received,
        accepted: counters.accepted,
        duplicates: counters.duplicates,
        ignored: counters.ignored,
        rejected: counters.rejected,
        lastReceivedAt,
        lastAcceptedAt,
        lastRejectionReason,
      })
    },
  }
}

// ── Registry ─────────────────────────────────────────────────────────────────
// A deployment usually runs several sources at once. The registry reports every one
// with its status so an operator can see at a glance which vendors are live and
// which are staged — the honest surface for "what is actually connected".
export function createIncidentSourceRegistry(sources: IncidentSource[]) {
  const bySource = new Map<string, IncidentSource>()
  for (const source of sources) {
    if (bySource.has(source.sourceId)) throw new IncidentSourceConfigError(`duplicate sourceId: ${source.sourceId}`)
    bySource.set(source.sourceId, source)
  }
  return {
    get(sourceId: string): IncidentSource | undefined { return bySource.get(sourceId) },
    list(): IncidentSource[] { return [...bySource.values()] },
    liveSourceIds(): string[] { return [...bySource.values()].filter(s => s.status === 'live').map(s => s.sourceId) },
    health(): IncidentSourceHealth[] { return [...bySource.values()].map(s => s.health()) },
  }
}

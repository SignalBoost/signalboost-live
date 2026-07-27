// saas/lib/supervisor/portable/webhook-intake.ts
//
// THE GENERIC SIGNED WEBHOOK.
//
// A buyer whose monitoring vendor has no native adapter yet — or who has an internal
// tool, a script, or a platform nobody has heard of — should not have to wait for us.
// This is the one endpoint any system can post to, and it is a first-class intake
// path rather than a fallback: several of the staged vendor adapters will end up
// being thin re-mappings of what this already accepts.
//
// It is deliberately the ONLY place in the intake stack that knows about transport.
// The contract in incident-source.ts stays dependency-free so a buyer can write an
// adapter against it in any runtime; everything about signatures, replay windows and
// payload size lives here, behind the same IncidentSource interface as every vendor.
//
// SECURITY POSTURE, stated plainly because a buyer's reviewer will ask:
//   - HMAC-SHA256 over `${timestamp}.${rawBody}`, compared in constant time.
//   - The timestamp is INSIDE the signed material, so a captured request cannot be
//     replayed with a fresh timestamp — changing it invalidates the signature.
//   - A replay window bounds how long a valid capture stays useful.
//   - Size is checked in BYTES before parsing, so an oversized body is rejected
//     before it costs anything to handle.
//   - Multiple secrets are accepted at once so a key can be rotated without a
//     window where every alert is dropped.

import { createHmac, timingSafeEqual } from 'node:crypto'

import { createIncidentSource, type IncidentMapping, type IncidentSource, type IncidentSourceRuntime, type RawIncidentDelivery } from './incident-source.ts'

export const INTAKE_ENVELOPE_VERSION = 'supervisor-incident-intake-v1'
export const SIGNATURE_HEADER = 'x-supervisor-signature'
export const TIMESTAMP_HEADER = 'x-supervisor-timestamp'

export const WEBHOOK_DEFAULTS = Object.freeze({
  replayWindowSeconds: 300,
  clockSkewSeconds: 60,
  maxBodyBytes: 128 * 1024,
  minSecretLength: 16,
})

// The documented payload. Everything except provider and errorMessage is optional,
// because the point of the generic endpoint is that a shell script with curl can use
// it. `resolved: true` is how a sender says "this cleared" — it is ignored, not
// rejected, so recovery notices do not read as intake failures.
export interface IntakeEnvelope {
  schemaVersion?: string
  provider: string
  errorMessage: string
  environment?: string
  severity?: string
  detectedAt?: string
  errorCode?: string
  affectedResource?: string
  dedupeKey?: string
  resolved?: boolean
  evidence?: Array<{ evidenceId?: string; type?: string; capturedAt?: string; summary: string; reference?: string; digest?: string }>
  metadata?: Record<string, unknown>
}

export class WebhookIntakeConfigError extends Error {
  constructor(message: string) { super(message); this.name = 'WebhookIntakeConfigError' }
}

export interface SignedWebhookOptions {
  sourceId?: string
  vendor?: string
  status?: 'live' | 'staged' | 'disabled'
  // An array so a secret can be rotated: publish the new one, keep the old one here
  // until every sender has moved, then drop it. A single string is accepted too.
  secret: string | string[]
  replayWindowSeconds?: number
  clockSkewSeconds?: number
  maxBodyBytes?: number
  now?: () => Date
}

// Exported so a buyer, an integration test, or a Phase 2 adapter can produce a
// correct signature without reverse-engineering the scheme from this file.
export function signIntakeRequest(secret: string, timestampSeconds: number | string, rawBody: string): string {
  return `v1=${createHmac('sha256', secret).update(`${timestampSeconds}.${rawBody}`).digest('hex')}`
}

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  // timingSafeEqual THROWS on a length mismatch, which would both crash intake and
  // leak length through the error path. Compare lengths first against a fixed-size
  // digest of each side so the comparison itself stays constant time.
  const leftDigest = createHmac('sha256', 'length-guard').update(left).digest()
  const rightDigest = createHmac('sha256', 'length-guard').update(right).digest()
  return timingSafeEqual(leftDigest, rightDigest)
}

function normalizeSignature(value: string): string {
  const trimmed = value.trim()
  return trimmed.startsWith('v1=') ? trimmed : `v1=${trimmed}`
}

function headerOf(delivery: RawIncidentDelivery, name: string): string {
  for (const [key, value] of Object.entries(delivery.headers ?? {})) {
    if (key.toLowerCase() === name) return String(value ?? '')
  }
  return ''
}

export function createSignedWebhookSource(options: SignedWebhookOptions, runtime: IncidentSourceRuntime = {}): IncidentSource {
  const secrets = (Array.isArray(options.secret) ? options.secret : [options.secret]).map(s => String(s ?? '').trim()).filter(Boolean)
  if (secrets.length === 0) throw new WebhookIntakeConfigError('at least one signing secret is required')
  for (const secret of secrets) {
    // Checked when the deployment is wired rather than when an alert arrives. A weak
    // secret that only surfaces during an incident is the worst time to find out.
    if (secret.length < WEBHOOK_DEFAULTS.minSecretLength) {
      throw new WebhookIntakeConfigError(`signing secret must be at least ${WEBHOOK_DEFAULTS.minSecretLength} characters`)
    }
  }

  const replayWindowSeconds = options.replayWindowSeconds ?? WEBHOOK_DEFAULTS.replayWindowSeconds
  const clockSkewSeconds = options.clockSkewSeconds ?? WEBHOOK_DEFAULTS.clockSkewSeconds
  const maxBodyBytes = options.maxBodyBytes ?? WEBHOOK_DEFAULTS.maxBodyBytes
  const now = options.now ?? runtime.now ?? (() => new Date())

  return createIncidentSource({
    sourceId: options.sourceId ?? 'generic-webhook',
    vendor: options.vendor ?? 'generic',
    status: options.status ?? 'live',

    authenticate(delivery) {
      // Size first: rejecting a 50MB body should not require hashing it.
      const bytes = Buffer.byteLength(delivery.rawBody ?? '', 'utf8')
      if (bytes > maxBodyBytes) return { ok: false, reason: 'payload_too_large' }

      const rawTimestamp = headerOf(delivery, TIMESTAMP_HEADER)
      if (!rawTimestamp) return { ok: false, reason: 'missing_timestamp' }
      const timestamp = Number(rawTimestamp)
      if (!Number.isFinite(timestamp)) return { ok: false, reason: 'invalid_timestamp' }

      const nowSeconds = Math.floor(now().getTime() / 1000)
      const age = nowSeconds - timestamp
      if (age > replayWindowSeconds) return { ok: false, reason: 'timestamp_outside_replay_window' }
      if (age < -clockSkewSeconds) return { ok: false, reason: 'timestamp_in_future' }

      const presented = headerOf(delivery, SIGNATURE_HEADER)
      if (!presented) return { ok: false, reason: 'missing_signature' }
      const candidate = normalizeSignature(presented)

      // Every secret is checked even after a match, so acceptance takes the same time
      // whichever key in a rotation set signed the request.
      let matched = false
      for (const secret of secrets) {
        if (constantTimeEquals(candidate, signIntakeRequest(secret, rawTimestamp, delivery.rawBody ?? ''))) matched = true
      }
      return matched ? { ok: true } : { ok: false, reason: 'bad_signature' }
    },

    map(body): IncidentMapping | null {
      if (!body || typeof body !== 'object' || Array.isArray(body)) return null
      const envelope = body as unknown as IntakeEnvelope

      if (envelope.schemaVersion && envelope.schemaVersion !== INTAKE_ENVELOPE_VERSION) {
        // Thrown rather than returned as null: an unknown envelope version is a
        // sender misconfiguration worth reporting, not a non-incident to drop.
        throw new Error(`unsupported schemaVersion: ${String(envelope.schemaVersion).slice(0, 64)}`)
      }
      if (envelope.resolved === true) return null

      return {
        provider: String(envelope.provider ?? ''),
        errorMessage: String(envelope.errorMessage ?? ''),
        environment: envelope.environment,
        severity: envelope.severity,
        detectedAt: envelope.detectedAt,
        errorCode: envelope.errorCode,
        affectedResource: envelope.affectedResource,
        dedupeKey: envelope.dedupeKey,
        evidence: envelope.evidence,
        metadata: envelope.metadata,
      }
    },
  }, { ...runtime, now })
}

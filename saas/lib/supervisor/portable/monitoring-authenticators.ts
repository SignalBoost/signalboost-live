// saas/lib/supervisor/portable/monitoring-authenticators.ts
//
// AUTHENTICATION STRATEGIES FOR VENDOR ADAPTERS.
//
// The adapter catalog advertises shared-secret and webhook-signature authentication,
// and until now no adapter implemented either — the safe constructor existed and the
// unauthenticated one was the default. These are the two strategies that cover every
// vendor in the catalog, written once so no adapter invents its own.
//
// Both are CONSTANT TIME. A comparison that returns early on the first wrong byte
// tells an attacker how much of the secret they guessed correctly, one request at a
// time, and neither of these is worth getting subtly wrong per-vendor.
//
// Neither reads configuration from anywhere. The secret is handed in by whoever wires
// the deployment, so this file stays inside the portable boundary and a buyer binds
// their own vault.

import { createHmac, timingSafeEqual } from 'node:crypto'

import type { RawIncidentDelivery } from './incident-source.ts'

export interface AuthenticationOutcome { ok: boolean; reason?: string }

export type DeliveryAuthenticator = (delivery: RawIncidentDelivery) => AuthenticationOutcome

export class AuthenticatorConfigError extends Error {
  constructor(message: string) { super(message); this.name = 'AuthenticatorConfigError' }
}

export const AUTHENTICATOR_DEFAULTS = Object.freeze({
  minSecretLength: 16,
  replayWindowSeconds: 300,
  clockSkewSeconds: 60,
})

function header(delivery: RawIncidentDelivery, name: string): string {
  const wanted = name.toLowerCase()
  for (const [key, value] of Object.entries(delivery.headers ?? {})) {
    if (key.toLowerCase() === wanted) return String(value ?? '')
  }
  return ''
}

function constantTimeEquals(a: string, b: string): boolean {
  const left = createHmac('sha256', 'compare-guard').update(String(a)).digest()
  const right = createHmac('sha256', 'compare-guard').update(String(b)).digest()
  return timingSafeEqual(left, right)
}

function normalizeSecrets(secret: string | string[], label: string): string[] {
  const list = (Array.isArray(secret) ? secret : [secret]).map(value => String(value ?? '').trim()).filter(Boolean)
  if (list.length === 0) throw new AuthenticatorConfigError(`${label}: at least one secret is required`)
  for (const value of list) {
    if (value.length < AUTHENTICATOR_DEFAULTS.minSecretLength) {
      throw new AuthenticatorConfigError(`${label}: secrets must be at least ${AUTHENTICATOR_DEFAULTS.minSecretLength} characters`)
    }
  }
  return list
}

export function createSharedSecretAuthenticator(options: { secret: string | string[]; headerName: string }): DeliveryAuthenticator {
  const secrets = normalizeSecrets(options.secret, 'shared secret')
  const headerName = String(options.headerName ?? '').trim()
  if (!headerName) throw new AuthenticatorConfigError('shared secret: headerName is required')

  return (delivery) => {
    const presented = header(delivery, headerName)
    if (!presented) return { ok: false, reason: 'missing_shared_secret' }
    let matched = false
    for (const secret of secrets) if (constantTimeEquals(presented, secret)) matched = true
    return matched ? { ok: true } : { ok: false, reason: 'bad_shared_secret' }
  }
}

export interface HmacSignatureOptions {
  secret: string | string[]
  headerName: string
  encoding?: 'hex' | 'base64'
  prefix?: string
  timestampHeader?: string
  replayWindowSeconds?: number
  clockSkewSeconds?: number
  now?: () => Date
}

export function createHmacSignatureAuthenticator(options: HmacSignatureOptions): DeliveryAuthenticator {
  const secrets = normalizeSecrets(options.secret, 'hmac signature')
  const headerName = String(options.headerName ?? '').trim()
  if (!headerName) throw new AuthenticatorConfigError('hmac signature: headerName is required')

  const encoding = options.encoding ?? 'hex'
  const prefix = options.prefix ?? ''
  const timestampHeader = options.timestampHeader?.trim()
  const replayWindowSeconds = options.replayWindowSeconds ?? AUTHENTICATOR_DEFAULTS.replayWindowSeconds
  const clockSkewSeconds = options.clockSkewSeconds ?? AUTHENTICATOR_DEFAULTS.clockSkewSeconds
  const now = options.now ?? (() => new Date())

  return (delivery) => {
    const presented = header(delivery, headerName)
    if (!presented) return { ok: false, reason: 'missing_signature' }

    let signedPayload = delivery.rawBody ?? ''
    if (timestampHeader) {
      const raw = header(delivery, timestampHeader)
      if (!raw) return { ok: false, reason: 'missing_timestamp' }
      const timestamp = Number(raw)
      if (!Number.isFinite(timestamp)) return { ok: false, reason: 'invalid_timestamp' }
      const age = Math.floor(now().getTime() / 1000) - timestamp
      if (age > replayWindowSeconds) return { ok: false, reason: 'timestamp_outside_replay_window' }
      if (age < -clockSkewSeconds) return { ok: false, reason: 'timestamp_in_future' }
      signedPayload = `${raw}.${signedPayload}`
    }

    const candidates = presented.split(',').map(value => value.trim()).filter(Boolean)
    let matched = false
    for (const secret of secrets) {
      const expected = `${prefix}${createHmac('sha256', secret).update(signedPayload).digest(encoding)}`
      for (const candidate of candidates) if (constantTimeEquals(candidate, expected)) matched = true
    }
    return matched ? { ok: true } : { ok: false, reason: 'bad_signature' }
  }
}

export function createTrustedNetworkAuthenticator(reason: string): DeliveryAuthenticator {
  const written = String(reason ?? '').trim()
  if (written.length < 10) throw new AuthenticatorConfigError('trusted network: a written reason is required, since this accepts every delivery')
  return () => ({ ok: true })
}

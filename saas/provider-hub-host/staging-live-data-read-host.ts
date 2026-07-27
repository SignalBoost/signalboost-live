import { createHash } from 'node:crypto'

import {
  executeProviderLiveDataRead,
  type ProviderLiveDataReadExecution,
  type ProviderLiveDataReadRequest,
} from '../provider-hub-core/live-data-read-adapter.ts'
import type { EntitlementGate } from '../portable-license/enforce.ts'

export const SIGNALBOOST_STAGING_LIVE_DATA_READ_HOST_VERSION = 'signalboost-staging-live-data-read-host-v1' as const

export interface SignalBoostStagingLiveDataReadHostOptions {
  readonly executionMode: 'test' | 'staging' | 'production'
  readonly allowedOrigins: readonly string[]
  readonly now?: () => string
  readonly fetchImpl?: typeof fetch
}

export interface LicensedSignalBoostStagingLiveDataReadHostOptions extends SignalBoostStagingLiveDataReadHostOptions {
  readonly entitlementGate: EntitlementGate
}

export interface SignalBoostStagingLiveDataReadHost {
  readonly schemaVersion: typeof SIGNALBOOST_STAGING_LIVE_DATA_READ_HOST_VERSION
  readonly executionMode: 'test' | 'staging'
  readonly allowedOrigins: readonly string[]
  readonly productionEnabled: false
  execute(request: ProviderLiveDataReadRequest): Promise<ProviderLiveDataReadExecution>
}

function normalizeAllowedOrigins(origins: readonly string[]): readonly string[] {
  if (!Array.isArray(origins) || origins.length === 0) throw new Error('allowed-origins-required')
  const normalized = origins.map((raw) => {
    const url = new URL(String(raw).trim())
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      throw new Error('invalid-allowed-origin')
    }
    return url.origin
  })
  if (new Set(normalized).size !== normalized.length) throw new Error('duplicate-allowed-origin')
  return Object.freeze([...normalized].sort())
}

function responseHeaders(headers: Headers): Readonly<Record<string, string | undefined>> {
  return Object.freeze({
    etag: headers.get('etag') ?? undefined,
    'x-result-count': headers.get('x-result-count') ?? undefined,
    'x-ratelimit-limit': headers.get('x-ratelimit-limit') ?? undefined,
    'x-ratelimit-remaining': headers.get('x-ratelimit-remaining') ?? undefined,
    'x-ratelimit-reset-at': headers.get('x-ratelimit-reset-at') ?? undefined,
  })
}

export function createSignalBoostStagingLiveDataReadHost(
  options: SignalBoostStagingLiveDataReadHostOptions,
): SignalBoostStagingLiveDataReadHost {
  if (options.executionMode === 'production') throw new Error('production-live-data-read-host-disabled')
  const allowedOrigins = normalizeAllowedOrigins(options.allowedOrigins)
  const fetchImpl = options.fetchImpl ?? fetch
  if (typeof fetchImpl !== 'function') throw new Error('fetch-implementation-required')
  const now = options.now ?? (() => new Date().toISOString())

  const host: SignalBoostStagingLiveDataReadHost = {
    schemaVersion: SIGNALBOOST_STAGING_LIVE_DATA_READ_HOST_VERSION,
    executionMode: options.executionMode,
    allowedOrigins,
    productionEnabled: false,
    async execute(request) {
      const source = new URL(request.sourceUrl)
      if (!allowedOrigins.includes(source.origin)) throw new Error('source-origin-not-allowed')

      return executeProviderLiveDataRead(request, {
        executionMode: options.executionMode,
        now,
        digest: {
          async sha256(value) {
            return createHash('sha256').update(value, 'utf8').digest('hex')
          },
        },
        transport: {
          async get(input) {
            const controller = new AbortController()
            const timeout = setTimeout(() => controller.abort(), input.timeoutMs)
            try {
              const response = await fetchImpl(input.url, {
                method: 'GET',
                cache: 'no-store',
                redirect: 'error',
                signal: controller.signal,
                headers: { accept: 'application/json' },
              })
              return {
                status: response.status,
                body: await response.text(),
                headers: responseHeaders(response.headers),
              }
            } finally {
              clearTimeout(timeout)
            }
          },
        },
      })
    },
  }

  return Object.freeze(host)
}

/**
 * Creates the buyer-facing staging host with entitlement enforcement at the
 * transport boundary. The requested provider capability must be present in the
 * verified licence before the base host can invoke network transport.
 */
export function createLicensedSignalBoostStagingLiveDataReadHost(
  options: LicensedSignalBoostStagingLiveDataReadHostOptions,
): SignalBoostStagingLiveDataReadHost {
  if (!options.entitlementGate || typeof options.entitlementGate.assertEntitled !== 'function') {
    throw new Error('entitlement-gate-required')
  }

  const baseHost = createSignalBoostStagingLiveDataReadHost(options)
  return Object.freeze({
    ...baseHost,
    async execute(request: ProviderLiveDataReadRequest) {
      await options.entitlementGate.assertEntitled(
        `provider live-data read: ${request.capability}`,
        'execute',
        request.capability,
      )
      return baseHost.execute(request)
    },
  })
}

// saas/lib/browser-runtime/production-launch-profile.ts
//
// The production launch profile for the Browser Tool. It is the second, separately
// gated door beside the sandbox profile — the sandbox wall in launch-profile.ts is
// left exactly as-is. This profile is what allows a real browser session against a
// REAL provider origin (a buyer's live provider dashboard), and it therefore
// carries stricter controls than the sandbox, not looser ones:
//
//   1. Origins must be real HTTPS origins on an explicit per-origin allowlist the
//      operator supplies. Loopback/localhost is REJECTED here (that is sandbox turf).
//   2. execute_change (a session that will change real state) is permitted ONLY when
//      the operator has explicitly enabled production execution for this profile.
//      With it off, this profile behaves like a read-only production inspector:
//      observe / prepare_change are allowed, execute_change is refused.
//   3. The adapter and provider must match what the profile was configured for, so a
//      task cannot borrow a production profile to drive a different provider.
//
// This module remains independent of Next.js, Supabase, and provider SDKs, exactly
// like the sandbox profile, so the portable runtime stays portable.

import type { BrowserSessionLaunchRequest } from './contracts.ts'
import type { BrowserLaunchProfile, BrowserLaunchProfileProvider } from './launch-profile.ts'

export interface ProductionLaunchProfileOptions {
  /** The adapter id this profile serves, e.g. 'signalboost.<provider>.production.v1'. */
  adapterId: string
  /** The provider this profile serves (e.g. the provider id). Matched case-insensitively. */
  provider: string
  /** Real HTTPS origins this profile may drive. Every task origin must be on this list. */
  allowedOrigins: string[]
  /**
   * Master switch for state-changing sessions. Defaults to false: with it off, the
   * profile allows only observe / prepare_change (read + staged), never execute_change.
   * Turning it on is the deliberate, owner-level act of enabling real production
   * mutation for this provider — it should be driven by an explicit env/config value,
   * never hard-coded true.
   */
  allowExecuteChange?: boolean
  headless?: boolean
  launchTimeoutMs?: number
  actionTimeoutMs?: number
  viewport?: { width: number; height: number }
}

function normalizeOrigin(value: string): string {
  return new URL(value).origin
}

function assertHttpsOrigin(origin: string): void {
  const url = new URL(origin)
  if (url.protocol !== 'https:') {
    throw new Error(`Production profile requires https origins; rejected: ${origin}`)
  }
  const host = url.hostname.toLowerCase()
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.local')) {
    throw new Error(`Production profile rejects loopback/local origins (use the sandbox profile): ${origin}`)
  }
}

export class ProductionBrowserLaunchProfileProvider implements BrowserLaunchProfileProvider {
  private readonly adapterId: string
  private readonly provider: string
  private readonly allowedOrigins: Set<string>
  private readonly allowExecuteChange: boolean
  private readonly profile: BrowserLaunchProfile

  constructor(options: ProductionLaunchProfileOptions) {
    if (!options.adapterId || !options.adapterId.trim()) throw new Error('Production profile requires an adapterId')
    if (!options.provider || !options.provider.trim()) throw new Error('Production profile requires a provider')
    if (!options.allowedOrigins || options.allowedOrigins.length === 0) {
      throw new Error('Production profile requires at least one allowed origin')
    }
    this.adapterId = options.adapterId
    this.provider = options.provider.toLowerCase()
    // Every configured origin is validated up front, so a misconfiguration fails at
    // construction rather than at launch time.
    this.allowedOrigins = new Set(
      options.allowedOrigins.map(origin => {
        const normalized = normalizeOrigin(origin)
        assertHttpsOrigin(normalized)
        return normalized
      }),
    )
    this.allowExecuteChange = options.allowExecuteChange === true
    this.profile = {
      id: `production.chromium.${this.provider}.v1`,
      headless: options.headless ?? true,
      launchTimeoutMs: options.launchTimeoutMs ?? 30_000,
      actionTimeoutMs: options.actionTimeoutMs ?? 15_000,
      launchArgs: ['--disable-extensions', '--disable-sync', '--no-first-run', '--disable-background-networking'],
      viewport: options.viewport ?? { width: 1280, height: 800 },
    }
  }

  resolve(request: BrowserSessionLaunchRequest): BrowserLaunchProfile {
    if (request.adapterId !== this.adapterId) {
      throw new Error(`Production profile rejected adapter: ${request.adapterId}`)
    }
    if (request.provider.toLowerCase() !== this.provider) {
      throw new Error(`Production profile rejected provider: ${request.provider}`)
    }
    if (request.mode === 'execute_change' && !this.allowExecuteChange) {
      throw new Error('Production profile is in read-only mode; execute_change is not enabled for this provider.')
    }
    if (request.allowedOrigins.length === 0) {
      throw new Error('Production task requires at least one allowed origin')
    }
    for (const candidate of request.allowedOrigins) {
      const origin = normalizeOrigin(candidate)
      assertHttpsOrigin(origin)
      if (!this.allowedOrigins.has(origin)) {
        throw new Error(`Production profile rejected origin: ${origin}`)
      }
    }
    return {
      ...this.profile,
      launchArgs: [...(this.profile.launchArgs ?? [])],
      viewport: this.profile.viewport ? { ...this.profile.viewport } : undefined,
    }
  }
}

export function createProductionBrowserLaunchProfileProvider(
  options: ProductionLaunchProfileOptions,
): BrowserLaunchProfileProvider {
  return new ProductionBrowserLaunchProfileProvider(options)
}

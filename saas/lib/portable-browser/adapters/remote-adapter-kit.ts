// saas/lib/portable-browser/adapters/remote-adapter-kit.ts
//
// ONE AUDITED PATH FOR EVERY REMOTE BROWSER VENDOR.
//
// Four adapters in this directory are real (browserbase, browserless, steel,
// playwright-local). Fourteen were four-line stubs: an empty configuration interface, a
// `notImplemented: true` status, `requiredPorts: []`, and a `create()` returning `never`.
// A buyer reading the catalog saw eighteen adapters; fourteen of them could not be handed a
// configuration at all.
//
// Writing fourteen bespoke clients would mean inventing fourteen vendor protocols I cannot
// verify. That is not what an adapter does here anyway. Look at what browserbase actually
// is: configuration validation, a credential resolved from the buyer's vault at call time,
// an origin allowlist, a scope check, and a delegation to an injected transport that the
// buyer implements. The vendor-specific part — the HTTP call — is the buyer's, by design,
// because they hold the account.
//
// So this module extracts that shared shape ONCE. Every rule below was lifted from the
// adapters that already shipped, not invented here:
//
//   • SCOPE. A launch request must name this adapter. A request for another vendor is
//     refused rather than quietly serviced.
//   • READ-ONLY. `execute_change` is refused. The shipped adapters all refuse it; a
//     mutation path is a separate, deliberate decision, not a default.
//   • ORIGIN ALLOWLIST. Every origin in the request must appear in the configured allowlist,
//     and the allowlist itself must be non-empty. A session cannot roam.
//   • SANDBOX HOSTS ONLY (see ORIGIN POSTURE below).
//   • CREDENTIALS ARE RESOLVED, NEVER STORED. The broker is called per launch. The resolved
//     value is passed to the transport and then handed to the error sanitizer as a known
//     secret, so it cannot leak through a thrown message.
//   • ERRORS ARE SANITIZED. Every failure inside open() goes through
//     sanitizeBrowserRuntimeError with the live credential registered.
//
// ORIGIN POSTURE — READ BEFORE WIDENING. The shipped adapters restrict approved origins to
// localhost / 127.0.0.1 / [::1]. That is a sandbox posture: it means these adapters cannot
// yet drive a buyer's real application. This kit deliberately keeps the SAME restriction so
// the catalog has ONE security posture rather than two. Widening it to buyer-supplied
// production origins is a real decision with real consequences and should be made once,
// explicitly, across all eighteen adapters — not slipped in per vendor.

import type {
  BrowserSessionFactory,
  BrowserSessionLaunchRequest,
  BrowserSessionPort,
} from '../../browser-runtime/contracts.ts'
import { sanitizeBrowserRuntimeError } from '../../browser-runtime/error-sanitizer.ts'

const SANDBOX_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/** Resolves a secret from the buyer's vault. Called per launch; the value is never retained. */
export interface RemoteAdapterCredentialBroker {
  resolveCredential(scope: Readonly<Record<string, string>>): Promise<string>
}

/**
 * The buyer's implementation of the vendor call. It receives the validated configuration and
 * the freshly resolved credential, and returns a live session.
 */
export interface RemoteAdapterTransport {
  openSession(
    input: Readonly<{ configuration: Readonly<Record<string, string>>; credential: string }>,
  ): Promise<BrowserSessionPort>
}

export interface RemoteAdapterDefinition {
  /** Must match the catalog adapterId and the adapterId on an incoming launch request. */
  adapterId: string
  /** Configuration keys this vendor requires, mirroring its catalog contract. */
  requiredConfigurationKeys: readonly string[]
  /** True when the vendor can be reached without a credential (an internal grid, say). */
  credentialOptional?: boolean
}

export interface RemoteAdapterConfiguration {
  /** Validated against requiredConfigurationKeys. Values must be non-empty strings. */
  configuration: Readonly<Record<string, string>>
  approvedOrigins: readonly string[]
  credentialBroker?: RemoteAdapterCredentialBroker
  transport: RemoteAdapterTransport
}

export function requireNonEmptyString(value: unknown, errorCode: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(errorCode)
  return value
}

/** An origin must be a bare https/http origin on a sandbox host — no path, no credentials. */
export function normalizeSandboxOrigin(value: string, adapterId: string): string {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error(`${adapterId}_invalid_origin`)
  }
  if (parsed.origin !== value || !/^https?:$/.test(parsed.protocol)) {
    throw new Error(`${adapterId}_invalid_origin`)
  }
  if (!SANDBOX_HOSTS.has(parsed.hostname)) throw new Error(`${adapterId}_external_origin_rejected`)
  return parsed.origin
}

function assertApprovedRequest(
  request: BrowserSessionLaunchRequest,
  adapterId: string,
  approvedOrigins: ReadonlySet<string>,
): void {
  if (!request || request.adapterId !== adapterId || String(request.provider).toLowerCase() !== adapterId) {
    throw new Error(`${adapterId}_launch_scope_rejected`)
  }
  if (request.mode === 'execute_change') throw new Error(`${adapterId}_execute_change_rejected`)
  if (!Array.isArray(request.allowedOrigins) || request.allowedOrigins.length === 0) {
    throw new Error(`${adapterId}_origin_required`)
  }
  for (const value of request.allowedOrigins) {
    if (!approvedOrigins.has(normalizeSandboxOrigin(value, adapterId))) {
      throw new Error(`${adapterId}_origin_rejected`)
    }
  }
}

/**
 * Build a session factory for one vendor.
 *
 * Every validation failure throws a stable, vendor-prefixed error code — the codes are the
 * adapter's contract with the buyer's integration team, so they are worth reading as a set.
 */
export function createRemoteBrowserSessionFactory(
  definition: RemoteAdapterDefinition,
  configuration: RemoteAdapterConfiguration,
): BrowserSessionFactory {
  const { adapterId } = definition
  if (!configuration || typeof configuration !== 'object') throw new Error(`${adapterId}_configuration_required`)

  const values = configuration.configuration
  if (!values || typeof values !== 'object') throw new Error(`${adapterId}_configuration_required`)
  const resolved: Record<string, string> = {}
  for (const key of definition.requiredConfigurationKeys) {
    resolved[key] = requireNonEmptyString(values[key], `${adapterId}_${key}_required`)
  }

  if (!Array.isArray(configuration.approvedOrigins)) throw new Error(`${adapterId}_origin_required`)
  const approvedOrigins = new Set(configuration.approvedOrigins.map((o) => normalizeSandboxOrigin(o, adapterId)))
  if (approvedOrigins.size === 0) throw new Error(`${adapterId}_origin_required`)

  const broker = configuration.credentialBroker
  if (!definition.credentialOptional && (!broker || typeof broker.resolveCredential !== 'function')) {
    throw new Error(`${adapterId}_credential_broker_required`)
  }
  if (!configuration.transport || typeof configuration.transport.openSession !== 'function') {
    throw new Error(`${adapterId}_transport_required`)
  }

  const frozenConfiguration = Object.freeze({ ...resolved })
  const transport = configuration.transport

  return {
    async open(request: BrowserSessionLaunchRequest): Promise<BrowserSessionPort> {
      assertApprovedRequest(request, adapterId, approvedOrigins)

      let credential = ''
      try {
        if (broker && typeof broker.resolveCredential === 'function') {
          const value = await broker.resolveCredential(frozenConfiguration)
          credential = definition.credentialOptional
            ? typeof value === 'string' ? value : ''
            : requireNonEmptyString(value, `${adapterId}_credential_unavailable`)
        }
        const session = await transport.openSession({ configuration: frozenConfiguration, credential })
        if (!session || typeof session.close !== 'function' || !session.page) {
          throw new Error(`${adapterId}_session_invalid`)
        }
        return session
      } catch (error) {
        // The live credential is registered so it cannot survive into a thrown message.
        throw new Error(sanitizeBrowserRuntimeError(error, credential ? [credential] : []))
      }
    },
  }
}

/** What a stub reports until a buyer supplies a transport. Replaces `requiredPorts: []`. */
export interface RemoteAdapterStatus {
  readonly adapterId: string
  readonly status: 'buyer_configuration_required'
  readonly requiredConfigurationKeys: readonly string[]
  readonly requiredPorts: readonly string[]
  readonly credentialRequired: boolean
}

export function describeRemoteAdapter(definition: RemoteAdapterDefinition): RemoteAdapterStatus {
  return Object.freeze({
    adapterId: definition.adapterId,
    status: 'buyer_configuration_required' as const,
    requiredConfigurationKeys: Object.freeze([...definition.requiredConfigurationKeys]),
    requiredPorts: Object.freeze(
      definition.credentialOptional ? ['transport'] : ['credentialBroker', 'transport'],
    ),
    credentialRequired: !definition.credentialOptional,
  })
}

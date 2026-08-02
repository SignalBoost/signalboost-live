//
// PROVES THE PORTABLE WORKS AGAINST THE BUYER'S OWN WIRING, NOT OURS.
//
// A packaged archive with a clean boundary proves the code could run anywhere. It does not
// prove it runs HERE, in this buyer's environment, through this buyer's transport and digest.
// That gap is what an acceptance harness closes, and until now Provider Hub had no way to close
// it — the release spec described acceptance in prose and left the buyer to improvise.
//
// WHAT THIS PORTABLE'S REAL FAILURE LOOKS LIKE, because the checks are written against it rather
// than against a generic happy path. Provider Hub's risk is not that a read fails — a failed read
// is visible and recoverable. It is that a credential leaks into something that gets stored,
// logged or shipped to a SIEM, or that a "read-only" boundary quietly performs a write. Both are
// silent, and both are discovered by somebody else. So most of these checks assert a REFUSAL:
// the harness hands the portable material it must reject and fails if the portable accepts it.
//
// TWELVE CHECKS, REPORTED INDEPENDENTLY. A single pass/fail hides which property held.
//
// ONE REAL READ, AGAINST AN ADDRESS THE BUYER CONTROLS. `probeUrl` is required and the harness
// refuses to run without it — exactly as the press harness refuses to run without an address the
// buyer owns. The read is real because a stubbed transport proves nothing about whether the
// buyer's network policy, proxy and TLS actually let the call out. It is a GET against a URL the
// buyer nominates, never a provider endpoint the harness chose.
//
// NEVER THROWS. The result is a frozen, JSON-serialisable record. A harness that throws on the
// first failure tells the buyer about one problem and hides the rest.
//
// PURE OF HOST CONCERNS: no imports beyond this portable's own modules.

import { createProviderConnectionMetadata } from './index.ts'
import { executeProviderLiveDataRead } from './live-data-read-adapter.ts'
import type {
  ProviderLiveDataDigestPort,
  ProviderLiveDataReadTransport,
} from './live-data-read-adapter.ts'

export const PROVIDER_HUB_ACCEPTANCE_SCHEMA = 'provider-hub-acceptance/1' as const

export type ProviderHubCheckId =
  | 'production_read_refused'
  | 'plaintext_source_refused'
  | 'credential_shaped_url_refused'
  | 'embedded_credentials_refused'
  | 'unsafe_timeout_refused'
  | 'buyer_transport_invoked'
  | 'buyer_digest_used'
  | 'transport_failure_recorded_not_thrown'
  | 'evidence_excludes_payload'
  | 'network_access_declared_honestly'
  | 'metadata_rejects_secret_field'
  | 'metadata_rejects_unsafe_mask'

export type ProviderHubCheck = {
  id: ProviderHubCheckId
  passed: boolean
  /** What was asserted, in the words a reviewer would use. */
  statement: string
  /** What actually happened. Present on a pass as well as a failure. */
  detail: string
}

export type ProviderHubAcceptanceResult = {
  schema: typeof PROVIDER_HUB_ACCEPTANCE_SCHEMA
  passed: boolean
  ranAt: string
  probeOrigin: string
  checks: ProviderHubCheck[]
  /** Present only when the harness could not run at all. */
  refusal: string | null
}

export type ProviderHubAcceptanceOptions = {
  /** The buyer's own transport. Not optional — testing ours would prove nothing. */
  transport: ProviderLiveDataReadTransport
  /** The buyer's own digest port. */
  digest: ProviderLiveDataDigestPort
  /**
   * An https URL the BUYER controls and is willing to have fetched once.
   * Required. The harness will not pick a destination on the buyer's behalf.
   */
  probeUrl: string
  /** Defaults to 'staging'. 'production' is rejected by the adapter and by check one. */
  executionMode?: 'test' | 'staging'
  now?: () => string
}

const IDENTITY = {
  tenantId: 'acceptance-tenant',
  environmentId: 'acceptance-environment',
  connectionId: 'acceptance-connection',
  providerId: 'acceptance-provider',
  capability: 'read:acceptance',
}

function check(id: ProviderHubCheckId, passed: boolean, statement: string, detail: string): ProviderHubCheck {
  return Object.freeze({ id, passed, statement, detail })
}

/** Did this call refuse? Returns the refusal reason, or null when it wrongly succeeded. */
async function refusalOf(run: () => Promise<unknown>): Promise<string | null> {
  try {
    await run()
    return null
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

function refused(id: ProviderHubCheckId, statement: string, reason: string | null): ProviderHubCheck {
  return check(
    id,
    reason !== null,
    statement,
    reason !== null ? `Refused: ${reason}` : 'ACCEPTED. The portable did not refuse material it must never accept.',
  )
}

/**
 * Run acceptance against the buyer's ports.
 *
 * Order matters only in one respect: the real read happens once, and three checks are derived
 * from that single execution rather than each making its own call. A harness that hits a buyer's
 * endpoint a dozen times to answer a dozen questions is a harness people stop running.
 */
export async function runProviderHubAcceptance(options: ProviderHubAcceptanceOptions): Promise<ProviderHubAcceptanceResult> {
  const ranAt = new Date().toISOString()
  const mode = options.executionMode === 'test' ? 'test' : 'staging'
  const now = options.now ?? (() => new Date().toISOString())

  // ── Refuse to run rather than run a weaker test ────────────────────────────
  let probeOrigin = ''
  try {
    const parsed = new URL(String(options.probeUrl || ''))
    if (parsed.protocol !== 'https:') throw new Error('probeUrl must be https')
    probeOrigin = parsed.origin
  } catch (error) {
    return Object.freeze({
      schema: PROVIDER_HUB_ACCEPTANCE_SCHEMA,
      passed: false,
      ranAt,
      probeOrigin: '',
      checks: [],
      refusal: `A valid https probeUrl the buyer controls is required. ${error instanceof Error ? error.message : String(error)}`,
    })
  }
  if (!options.transport || !options.digest) {
    return Object.freeze({
      schema: PROVIDER_HUB_ACCEPTANCE_SCHEMA,
      passed: false,
      ranAt,
      probeOrigin,
      checks: [],
      refusal: 'Both a transport and a digest port must be supplied. Substituting our own would test our wiring instead of yours.',
    })
  }

  const checks: ProviderHubCheck[] = []
  const baseRequest = {
    ...IDENTITY,
    sourceUrl: options.probeUrl,
    observedAt: now(),
    timeoutMs: 5_000,
  }
  const baseOptions = { executionMode: mode as 'test' | 'staging', transport: options.transport, digest: options.digest, now }

  // ── 1. Production execution is disabled, and stays disabled ────────────────
  checks.push(refused(
    'production_read_refused',
    'A read requested in production mode is refused.',
    await refusalOf(() => executeProviderLiveDataRead(baseRequest, { ...baseOptions, executionMode: 'production' as never })),
  ))

  // ── 2-4. Source URLs the portable must never fetch ─────────────────────────
  checks.push(refused(
    'plaintext_source_refused',
    'A plaintext http:// source is refused before any transport call.',
    await refusalOf(() => executeProviderLiveDataRead({ ...baseRequest, sourceUrl: probeOrigin.replace('https://', 'http://') }, baseOptions)),
  ))
  checks.push(refused(
    'credential_shaped_url_refused',
    'A URL carrying a credential-shaped query parameter is refused.',
    await refusalOf(() => executeProviderLiveDataRead({ ...baseRequest, sourceUrl: `${probeOrigin}/data?api_key=REDACTED` }, baseOptions)),
  ))
  checks.push(refused(
    'embedded_credentials_refused',
    'A URL with embedded basic-auth credentials is refused.',
    await refusalOf(() => executeProviderLiveDataRead({ ...baseRequest, sourceUrl: probeOrigin.replace('https://', 'https://user:pass@') }, baseOptions)),
  ))

  // ── 5. Unbounded reads ─────────────────────────────────────────────────────
  checks.push(refused(
    'unsafe_timeout_refused',
    'A timeout beyond the permitted ceiling is refused.',
    await refusalOf(() => executeProviderLiveDataRead({ ...baseRequest, timeoutMs: 120_000 }, baseOptions)),
  ))

  // ── 6-9. ONE real read through the buyer's ports ───────────────────────────
  let transportCalls = 0
  let digestCalls = 0
  const digestedBody: { value: string | null } = { value: null }
  const observingTransport: ProviderLiveDataReadTransport = {
    async get(input) {
      transportCalls += 1
      return options.transport.get(input)
    },
  }
  const observingDigest: ProviderLiveDataDigestPort = {
    async sha256(value) {
      digestCalls += 1
      digestedBody.value = value
      return options.digest.sha256(value)
    },
  }

  try {
    const execution = await executeProviderLiveDataRead(baseRequest, {
      ...baseOptions,
      transport: observingTransport,
      digest: observingDigest,
    })
    const evidence = execution.evidence

    checks.push(check(
      'buyer_transport_invoked',
      transportCalls === 1,
      'The read goes through the transport the buyer supplied, exactly once.',
      `Transport invoked ${transportCalls} time(s); HTTP ${evidence.httpStatus} from ${evidence.sourceOrigin}.`,
    ))
    checks.push(check(
      'buyer_digest_used',
      digestCalls >= 1 && /^[a-f0-9]{64}$/.test(evidence.dataSha256),
      'The response digest comes from the buyer digest port, not from anything we compute.',
      `Digest port invoked ${digestCalls} time(s); recorded digest ${evidence.dataSha256 || '(none)'}.`,
    ))

    // The payload must not survive into the record. Checked by looking for the body we just
    // watched go into the digest, rather than by trusting the type.
    const serialised = JSON.stringify(evidence)
    // Held in a box rather than a bare local: the assignment happens inside the digest closure,
    // which control-flow analysis cannot see, so a plain `let` would be narrowed to null here.
    const bodySeen = digestedBody.value
    const bodyLeaked = Boolean(bodySeen && bodySeen.length >= 12 && serialised.includes(bodySeen.slice(0, 12)))
    checks.push(check(
      'evidence_excludes_payload',
      !bodyLeaked && evidence.rawPayloadStored === false && evidence.credentialsExposed === false,
      'The evidence record carries an origin and a digest, never the response body.',
      bodyLeaked ? 'The response body appears in the serialised evidence.' : 'No fragment of the response body appears in the record.',
    ))

    checks.push(check(
      'network_access_declared_honestly',
      evidence.networkAccessPerformed === true,
      'Evidence for a completed read declares that network access occurred.',
      evidence.networkAccessPerformed
        ? 'Declared true after the transport was invoked.'
        : 'Declared false despite the transport having been invoked. The record is asserting something untrue.',
    ))
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    for (const id of ['buyer_transport_invoked', 'buyer_digest_used', 'evidence_excludes_payload', 'network_access_declared_honestly'] as ProviderHubCheckId[]) {
      checks.push(check(id, false, 'Depends on one real read through the buyer ports.', `The read threw: ${detail}`))
    }
  }

  // ── 10. A transport that fails must be recorded, not thrown ────────────────
  try {
    const failing: ProviderLiveDataReadTransport = { async get() { throw new Error('simulated transport failure') } }
    const execution = await executeProviderLiveDataRead(baseRequest, { ...baseOptions, transport: failing })
    checks.push(check(
      'transport_failure_recorded_not_thrown',
      execution.evidence.failureCode === 'transport_failure' && execution.evidence.networkAccessPerformed === true,
      'A failing transport produces evidence describing the failure instead of an exception.',
      `failureCode=${execution.evidence.failureCode ?? '(none)'}, networkAccessPerformed=${execution.evidence.networkAccessPerformed}.`,
    ))
  } catch (error) {
    checks.push(check(
      'transport_failure_recorded_not_thrown',
      false,
      'A failing transport produces evidence describing the failure instead of an exception.',
      `It threw instead: ${error instanceof Error ? error.message : String(error)}`,
    ))
  }

  // ── 11-12. Connection metadata must never carry a secret ───────────────────
  checks.push(refused(
    'metadata_rejects_secret_field',
    'A secret-shaped public field name is refused in connection metadata.',
    await refusalOf(async () => createProviderConnectionMetadata({
      ...IDENTITY,
      state: 'configured',
      authentication: { method: 'api_key', configured: true, maskedFields: { api_key: 'saved' } },
      updatedAt: now(),
    })),
  ))
  checks.push(refused(
    'metadata_rejects_unsafe_mask',
    'A masked value that is not a recognised safe placeholder is refused.',
    await refusalOf(async () => createProviderConnectionMetadata({
      ...IDENTITY,
      state: 'configured',
      authentication: { method: 'api_key', configured: true, maskedFields: { account: 'sk-live-01234567890' } },
      updatedAt: now(),
    })),
  ))

  return Object.freeze({
    schema: PROVIDER_HUB_ACCEPTANCE_SCHEMA,
    passed: checks.every(item => item.passed),
    ranAt,
    probeOrigin,
    checks: Object.freeze(checks) as ProviderHubCheck[],
    refusal: null,
  })
}

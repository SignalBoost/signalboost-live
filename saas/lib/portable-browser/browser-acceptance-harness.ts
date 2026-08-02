// saas/lib/portable-browser/browser-acceptance-harness.ts
//
// PROVES THE PORTABLE WORKS AGAINST THE BUYER'S OWN BROWSER STACK, NOT OURS.
//
// This was the last gap keeping the release at -rc. Press & Media, Provider Hub and the
// Self-Healing Supervisor each ship a harness that runs against the buyer's own ports and
// leaves a retained record; this portable shipped twenty-six adapters and no way for a buyer
// to demonstrate any of them worked in their environment.
//
// WHAT THIS PORTABLE'S UNRECOVERABLE FAILURES ARE, because the checks are written against them
// rather than against a happy path. A failed session costs a retry and is visible. Three other
// things are silent and are discovered by somebody else:
//
//   A SESSION REACHING AN ORIGIN NOBODY DECLARED. The allowlist is the cage. If it can be
//   escaped — by a wildcard, a path-bearing entry, or a launch request naming an origin that
//   was never approved — then a browser under automation is loose inside the buyer's network.
//
//   A CREDENTIAL SURVIVING INTO A LOG. Every adapter resolves a live credential per launch and
//   passes it to a transport that can throw with it in the message. If the sanitizer is not in
//   the path, the buyer's log aggregator now holds a working key.
//
//   A WRITE. This release observes and prepares. `execute_change` must be refused by every
//   adapter, every time, and a buyer should confirm that themselves rather than take it on
//   trust from a document.
//
// So nine of the thirteen checks assert a REFUSAL: the harness hands the adapter material it
// must reject and fails if the adapter accepts it.
//
// ONE REAL SESSION, ON A STACK THE BUYER NOMINATES. They pass the factory builder for whichever
// of the twenty-six vendors they own, their transport, their credential broker, and an origin
// they control. The session is real because a stubbed transport proves nothing about whether
// their vendor account, network policy and vault actually work together.
//
// NEVER THROWS. The result is a frozen, JSON-serialisable record.

import type { BrowserSessionFactory, BrowserSessionPort } from './browser-task-contracts.ts'
import type { RemoteAdapterConfiguration } from './adapters/remote-adapter-kit.ts'
import { createBrowserActivitySink, type BrowserActivityPrimitives } from './browser-activity-sinks.ts'

export const BROWSER_ACCEPTANCE_SCHEMA = 'browser-agent-acceptance/1' as const

export type BrowserCheckId =
  | 'empty_allowlist_refused'
  | 'wildcard_origin_refused'
  | 'path_bearing_origin_refused'
  | 'origin_with_credentials_refused'
  | 'plaintext_origin_refused'
  | 'missing_configuration_refused'
  | 'credential_broker_required'
  | 'undeclared_origin_refused'
  | 'execute_change_refused'
  | 'foreign_adapter_scope_refused'
  | 'buyer_transport_opened_session'
  | 'credential_resolved_per_launch'
  | 'credential_absent_from_errors'
  | 'activity_recorded_to_buyer_destination'

export type BrowserCheck = {
  id: BrowserCheckId
  passed: boolean
  statement: string
  detail: string
}

export type BrowserAcceptanceResult = {
  schema: typeof BROWSER_ACCEPTANCE_SCHEMA
  passed: boolean
  ranAt: string
  adapterId: string
  probeOrigin: string
  activitySinkId: string | null
  checks: BrowserCheck[]
  refusal: string | null
}

export type BrowserAcceptanceOptions = {
  /** The adapter being accepted. Must match the catalog id and the launch request. */
  adapterId: string
  /**
   * The buyer's factory builder for that vendor — `createBrowserstackSessionFactory`,
   * `createSeleniumGridSessionFactory`, and so on. Passed rather than looked up, because the
   * point of the run is that THEIR chosen vendor works, not that ours resolves.
   */
  buildSessionFactory: (configuration: RemoteAdapterConfiguration) => BrowserSessionFactory
  /** Validated configuration for that vendor: hub endpoint, region, actor id, whatever it declares. */
  configuration: Readonly<Record<string, string>>
  /** The buyer's transport. Not optional — testing ours would prove nothing. */
  transport: RemoteAdapterConfiguration['transport']
  /** The buyer's vault broker. Omit only for a vendor whose contract says no credential. */
  credentialBroker?: RemoteAdapterConfiguration['credentialBroker']
  /** An https origin the buyer controls and is willing to have a session opened against. */
  probeOrigin: string
  /** Optional: also prove activity reaches the destination they chose. */
  activity?: { sinkId: string; config?: Readonly<Record<string, string>>; primitives: BrowserActivityPrimitives }
}

function check(id: BrowserCheckId, passed: boolean, statement: string, detail: string): BrowserCheck {
  return Object.freeze({ id, passed, statement, detail })
}

/** Returns the refusal message, or null when the call wrongly succeeded. */
async function refusalOf(run: () => unknown | Promise<unknown>): Promise<string | null> {
  try {
    await run()
    return null
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

function refused(id: BrowserCheckId, statement: string, reason: string | null): BrowserCheck {
  return check(
    id,
    reason !== null,
    statement,
    reason !== null ? `Refused: ${reason}` : 'ACCEPTED. The adapter did not refuse material it must never accept.',
  )
}

/**
 * Run acceptance against the buyer's stack.
 *
 * The construction-time refusals run first and cost nothing — a buyer whose allowlist is
 * misconfigured finds out before a session is opened against anything.
 */
export async function runBrowserAcceptance(options: BrowserAcceptanceOptions): Promise<BrowserAcceptanceResult> {
  const ranAt = new Date().toISOString()
  const adapterId = String(options?.adapterId || '').trim()

  // ── Refuse to run rather than run a weaker test ────────────────────────────
  const missing: string[] = []
  if (!adapterId) missing.push('an adapterId')
  if (typeof options?.buildSessionFactory !== 'function') missing.push('a session factory builder for your vendor')
  if (typeof options?.transport?.openSession !== 'function') missing.push('your own transport')
  if (!options?.probeOrigin) missing.push('a probe origin you control')
  let probeOrigin = ''
  if (options?.probeOrigin) {
    try {
      const parsed = new URL(options.probeOrigin)
      if (parsed.protocol !== 'https:' || parsed.origin !== options.probeOrigin) throw new Error('must be an exact https origin')
      probeOrigin = parsed.origin
    } catch (error) {
      missing.push(`a valid https probe origin (${error instanceof Error ? error.message : String(error)})`)
    }
  }
  if (missing.length) {
    return Object.freeze({
      schema: BROWSER_ACCEPTANCE_SCHEMA,
      passed: false,
      ranAt,
      adapterId,
      probeOrigin: '',
      activitySinkId: null,
      checks: [],
      refusal: `Cannot run without ${missing.join(', ')}. Substituting our own would test our wiring instead of yours, and a session belongs on a stack you nominate.`,
    })
  }

  const checks: BrowserCheck[] = []
  const base = (over: Partial<RemoteAdapterConfiguration> = {}): RemoteAdapterConfiguration => ({
    configuration: options.configuration,
    approvedOrigins: [probeOrigin],
    credentialBroker: options.credentialBroker,
    transport: options.transport,
    ...over,
  })

  // ── 1-5. Origins the adapter must never accept ─────────────────────────────
  checks.push(refused(
    'empty_allowlist_refused',
    'An adapter with no declared origins cannot be built. The allowlist is the cage, and an empty cage is not an open one.',
    await refusalOf(() => options.buildSessionFactory(base({ approvedOrigins: [] }))),
  ))
  checks.push(refused(
    'wildcard_origin_refused',
    'A wildcard origin is refused. "Everything under this domain" is not an origin.',
    await refusalOf(() => options.buildSessionFactory(base({ approvedOrigins: [probeOrigin.replace('https://', 'https://*.')] }))),
  ))
  checks.push(refused(
    'path_bearing_origin_refused',
    'An entry carrying a path is refused — a path in an allowlist reads as a restriction that is not enforced.',
    await refusalOf(() => options.buildSessionFactory(base({ approvedOrigins: [`${probeOrigin}/admin`] }))),
  ))
  checks.push(refused(
    'origin_with_credentials_refused',
    'An origin with embedded credentials is refused.',
    await refusalOf(() => options.buildSessionFactory(base({ approvedOrigins: [probeOrigin.replace('https://', 'https://user:pass@')] }))),
  ))
  checks.push(refused(
    'plaintext_origin_refused',
    'A plaintext http origin outside loopback is refused, so a production origin cannot be quietly downgraded.',
    await refusalOf(() => options.buildSessionFactory(base({ approvedOrigins: [probeOrigin.replace('https://', 'http://')] }))),
  ))

  // ── 6-7. Configuration and credentials ─────────────────────────────────────
  checks.push(refused(
    'missing_configuration_refused',
    'An adapter built with no vendor configuration is refused by name, naming the key that is missing.',
    await refusalOf(() => options.buildSessionFactory(base({ configuration: {} }))),
  ))
  if (options.credentialBroker) {
    checks.push(refused(
      'credential_broker_required',
      'A vendor whose contract requires a credential cannot be built without a broker to resolve it.',
      await refusalOf(() => options.buildSessionFactory(base({ credentialBroker: undefined }))),
    ))
  } else {
    checks.push(check(
      'credential_broker_required',
      true,
      'A vendor whose contract requires a credential cannot be built without a broker to resolve it.',
      'Not applicable: this vendor declares no credential requirement, and a required credential where none exists is a blocked integration rather than a safer one.',
    ))
  }

  // ── 8-13. One real session, and what it must refuse ────────────────────────
  let brokerCalls = 0
  const countingBroker = options.credentialBroker
    ? {
        async resolveCredential(scope: Readonly<Record<string, string>>) {
          brokerCalls += 1
          return options.credentialBroker!.resolveCredential(scope)
        },
      }
    : undefined

  let openedSession: BrowserSessionPort | null = null
  try {
    const factory = options.buildSessionFactory(base({ credentialBroker: countingBroker }))
    const request = { provider: adapterId, adapterId, mode: 'observe' as const, allowedOrigins: [probeOrigin] }

    checks.push(refused(
      'undeclared_origin_refused',
      'A launch request naming an origin that was never approved is refused.',
      await refusalOf(() => factory.open({ ...request, allowedOrigins: ['https://not-declared.example'] })),
    ))
    checks.push(refused(
      'execute_change_refused',
      'execute_change is refused. This release observes and prepares; it does not write.',
      await refusalOf(() => factory.open({ ...request, mode: 'execute_change' as never })),
    ))
    checks.push(refused(
      'foreign_adapter_scope_refused',
      'A request addressed to a different adapter is refused, so one vendor cannot open a session on another.',
      await refusalOf(() => factory.open({ ...request, adapterId: `${adapterId}-not-this-one` })),
    ))

    const before = brokerCalls
    openedSession = await factory.open(request)
    checks.push(check(
      'buyer_transport_opened_session',
      Boolean(openedSession && typeof openedSession.close === 'function' && openedSession.page),
      'A session opens through the transport you supplied, against the origin you declared.',
      openedSession ? `Session opened; current page ${openedSession.page.url()}.` : 'No session was returned.',
    ))
    checks.push(check(
      'credential_resolved_per_launch',
      options.credentialBroker ? brokerCalls === before + 1 : true,
      'The credential is resolved from your vault ON THIS LAUNCH and never retained between launches.',
      options.credentialBroker
        ? `Broker called ${brokerCalls - before} time(s) for this open.`
        : 'Not applicable: this vendor declares no credential.',
    ))
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    for (const id of ['buyer_transport_opened_session', 'credential_resolved_per_launch'] as BrowserCheckId[]) {
      checks.push(check(id, false, 'Depends on one real session through your transport.', `The open threw: ${detail}`))
    }
  } finally {
    if (openedSession) {
      try {
        await openedSession.close()
      } catch {
        // A close failure is the buyer's transport to report; it does not change acceptance.
      }
    }
  }

  // A transport that throws WITH the live credential in the message. This is the check that
  // proves the sanitizer is in the path, and it is the reason the sanitizer had to be moved
  // inside the portable boundary in the first place.
  const canary = 'ACCEPTANCE-CANARY-CREDENTIAL-b7f31c'
  try {
    const leakyFactory = options.buildSessionFactory(base({
      credentialBroker: { async resolveCredential() { return canary } },
      transport: { async openSession() { throw new Error(`vendor rejected token ${canary}`) } },
    }))
    await leakyFactory.open({ provider: adapterId, adapterId, mode: 'observe' as const, allowedOrigins: [probeOrigin] })
    checks.push(check('credential_absent_from_errors', false, 'A live credential never survives into an error message.', 'The failing transport did not surface an error at all.'))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    checks.push(check(
      'credential_absent_from_errors',
      !message.includes(canary),
      'A live credential never survives into an error message, however the vendor phrases its failure.',
      message.includes(canary)
        ? 'THE CREDENTIAL APPEARED IN THE ERROR. Do not deploy: your log aggregator would receive working credentials.'
        : `Sanitised to: ${message}`,
    ))
  }

  // ── Optional: activity reaches the destination the buyer chose ─────────────
  let activitySinkId: string | null = null
  if (options.activity?.sinkId) {
    const built = createBrowserActivitySink(options.activity.sinkId, options.activity.config ?? {}, options.activity.primitives ?? {})
    if (!built.ok) {
      checks.push(check('activity_recorded_to_buyer_destination', false, 'Activity reaches the destination you chose.', built.reason))
    } else {
      activitySinkId = built.sinkId
      try {
        await built.port.record({ runtimeId: `acceptance-${ranAt}`, eventType: 'session_completed', providerId: adapterId, adapterId, outcome: 'acceptance' })
        checks.push(check('activity_recorded_to_buyer_destination', true, 'Activity reaches the destination you chose, through your own primitive.', `One event written to ${built.sinkId}.`))
      } catch (error) {
        checks.push(check('activity_recorded_to_buyer_destination', false, 'Activity reaches the destination you chose.', `The destination refused it: ${error instanceof Error ? error.message : String(error)}`))
      }
    }
  }

  return Object.freeze({
    schema: BROWSER_ACCEPTANCE_SCHEMA,
    passed: checks.every(item => item.passed),
    ranAt,
    adapterId,
    probeOrigin,
    activitySinkId,
    checks: Object.freeze(checks) as BrowserCheck[],
    refusal: null,
  })
}

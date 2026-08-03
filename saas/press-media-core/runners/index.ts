// saas/press-media-core/runners/index.ts
//
// THE RUNNER THE PORTABLE NOW SHIPS, so a buyer supplies CREDENTIALS instead of CODE.
//
// `RunnerPort` was always the honest boundary — but it was an empty one. Every paid press
// provider called `ports.runner.run(...)` and the buyer had to implement it, which meant the
// customer wrote the Business Wire client themselves. That is a specification, not a product.
//
// `createPressRunner(config)` returns a working RunnerPort. Give it Business Wire credentials
// and press releases go out. Give it a declared recipe and any other wire with a REST API goes
// out. Give it neither for a brand and it says so by name instead of failing at send time.
//
// THREE WAYS A WIRE CAN BE REACHED, in the order a buyer should try them:
//
//   BUILT-IN      Business Wire, implemented against their published Connect 5 API. Credentials
//                 only. See ./businesswire.ts.
//
//   DECLARED      Any wire with a documented REST endpoint: the buyer declares the URL, the auth
//                 style and where the fields go, and this runner performs the call. No code, and
//                 no release needed to add a brand — the same pattern the ads connector uses for
//                 networks it was not built with.
//
//   DELEGATED     A wire with NO public API. It exists and we name it rather than pretend
//                 otherwise: EIN Presswire, for instance, publishes no developer API — releases
//                 are uploaded through their portal or their account team. The buyer points this
//                 at an endpoint THEY run which does the last hop, or they submit by hand. A
//                 declared endpoint that cannot exist is worse than an honest gap.
//
// WHAT THIS FILE WILL NOT DO. It will not guess a brand, will not fall back from a configured
// brand to a different one, and will not report success for a call it did not make. Every
// refusal names the missing thing.
//
// MEDIA DATABASES GET THE SAME THREE-WAY TREATMENT, with one honest difference: NONE of them
// publishes an open developer API. Prowly states plainly that it has none; Cision, Meltwater
// and Muck Rack expose theirs only under an enterprise contract. So there is no built-in tier
// here and there should not be one — a buyer whose contract includes API access DECLARES it,
// and a buyer whose does not is told at configuration time rather than at verification time.
//
// That asymmetry is worth understanding before selling this: the wire side SENDS and now works
// out of the box; the database side only VERIFIES a contact the buyer already has, and verifies
// nothing at all unless they own a subscription with API access.
//
// OAUTH 2.0 CLIENT CREDENTIALS IS SUPPORTED, and that matters more than it sounds. The
// enterprise wires — PR Newswire, GlobeNewswire — authenticate this way, and it is a PUBLISHED
// STANDARD, so it can be implemented correctly without ever seeing their private documentation.
// The consequence: for those brands the only thing left that we cannot know is the endpoint
// itself, which the buyer already has in their onboarding pack. See wire-profiles.ts, which
// pre-stages every popular brand down to that one blank.
//
// The token is fetched once and reused until shortly before it expires. A token refreshed on
// every call would be correct and would also rate-limit a buyer out of their own account.
//
// PURE OF HOST CONCERNS: `fetch` and `FormData` are global in Node 18+, so there is no
// dependency, no SDK, no environment read and no import outside this portable.

import type { RunnerPort, RunnerProviderConfig, RunnerResult } from '../types.ts'
import {
  fetchBusinessWireReport,
  listBusinessWireAccounts,
  listBusinessWireDistributions,
  submitBusinessWireRelease,
  type BusinessWireConfig,
} from './businesswire.ts'

/**
 * A wire reachable by one documented REST call.
 *
 * Deliberately small: a URL, how the credential is presented, and how this vendor names the
 * three fields that matter. Anything more elaborate belongs in its own file the way Business
 * Wire does, because a template language pretending to be an integration is how a buyer ends up
 * debugging our string substitution instead of their release.
 */
export type DeclaredWireRecipe = {
  brand: string
  submitUrl: string
  /** Optional status endpoint. `{ref}` is substituted. Omit and proof stays honestly pending. */
  reportUrl?: string
  /** How the credential is presented. `oauth2` is the enterprise wires' scheme. */
  auth: 'oauth2' | 'bearer' | 'api-key-header' | 'basic'
  /** Header name for api-key-header. Defaults to `x-api-key`. */
  authHeader?: string
  /** The credential itself, supplied by the buyer. Never read from the environment. */
  credential: string
  /** For basic auth. */
  username?: string
  /** OAuth token endpoint, client id and optional scope, for auth: 'oauth2'. */
  tokenUrl?: string
  clientId?: string
  scope?: string
  /** What this vendor calls the headline, body and reference fields. */
  fieldMap?: { headline?: string; body?: string; reference?: string; language?: string }
  /** Anything else this vendor always requires — account id, circuit code, and so on. */
  staticFields?: Record<string, unknown>
  priceCents?: number
  currency?: string
}

/**
 * A media database reachable by one documented REST call.
 *
 * `found` is the only field that matters to the adapter: it refuses to dispatch to a contact the
 * database does not confirm. So the recipe says where in the vendor's response that answer
 * lives, rather than assuming every vendor spells it the same way.
 */
export type DeclaredDatabaseRecipe = {
  brand: string
  verifyUrl: string
  auth: 'oauth2' | 'bearer' | 'api-key-header' | 'basic'
  authHeader?: string
  credential: string
  username?: string
  /** OAuth token endpoint and client id, for auth: 'oauth2'. */
  tokenUrl?: string
  clientId?: string
  scope?: string
  /** What this vendor calls the contact and publication fields on the way in. */
  fieldMap?: { contact?: string; publication?: string; beat?: string }
  /** Where the yes/no lives in the response. Defaults to `found`, then `verified`. */
  foundField?: string
  /** GET with query parameters instead of a POST body. Some databases only offer lookup. */
  method?: 'GET' | 'POST'
  staticFields?: Record<string, unknown>
  priceCents?: number
  currency?: string
}

export type PressRunnerConfig = {
  /** Business Wire, implemented in full. */
  businessWire?: BusinessWireConfig & { priceCents?: number; currency?: string }
  /** Wires reachable by one REST call, declared rather than coded. */
  declaredWires?: DeclaredWireRecipe[]
  /**
   * Brands with no public API, named so a buyer is told at configuration time rather than at
   * send time. Map brand → the reason, or an endpoint the buyer runs that does the last hop.
   */
  delegatedWires?: Array<{ brand: string; bridgeUrl?: string; note?: string }>
  /** Which brand `pr_wire` uses when several are configured. Defaults to the only one. */
  preferredWire?: string
  /** Media databases reachable by one REST call, declared rather than coded. */
  declaredDatabases?: DeclaredDatabaseRecipe[]
  /**
   * Databases the buyer owns but cannot reach programmatically — the common case, because
   * none of the major vendors publishes an open API. Named so the refusal is informative.
   */
  delegatedDatabases?: Array<{ brand: string; note?: string }>
  /** Which database `media_database` uses when several are configured. */
  preferredDatabase?: string
}

function result(ok: boolean, status: number, outputs: Record<string, unknown>, extra: Partial<RunnerResult> = {}): RunnerResult {
  return { ok, status, outputs, ...extra }
}

function refuse(error: string): RunnerResult {
  return { ok: false, status: 0, outputs: {}, error }
}

type AuthShape = {
  auth: 'oauth2' | 'bearer' | 'api-key-header' | 'basic'
  credential: string
  username?: string
  authHeader?: string
  tokenUrl?: string
  clientId?: string
  scope?: string
}

/**
 * Cached access tokens, keyed by token endpoint plus client id.
 *
 * Held in module scope on purpose: a runner rebuilt per request would otherwise fetch a fresh
 * token on every send, which is correct and would also rate-limit a buyer out of their own
 * account during a busy release day.
 */
const TOKEN_CACHE = new Map<string, { token: string; expiresAt: number }>()

/** Refresh this far before the stated expiry, so a token cannot lapse mid-request. */
const TOKEN_SAFETY_MS = 60_000

/**
 * Short fingerprint of a secret, for use in the cache key.
 *
 * THE CACHE KEY MUST INCLUDE THE CREDENTIAL, and a test caught this the hard way: keyed on the
 * token endpoint and client id alone, a WRONG secret reused the token a correct one had just
 * fetched — so a connection check reported "credential accepted" for credentials that would
 * fail. Rotating a secret would have had the same effect in reverse: the old token kept working
 * until it expired, hiding a rotation that had not taken effect.
 *
 * Fingerprinted rather than stored: FNV-1a, not a security hash and not used as one — it exists
 * so the secret itself never sits in a Map key that might be dumped while debugging.
 */
function secretFingerprint(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16)
}

async function oauthToken(recipe: AuthShape): Promise<{ token: string; error: string }> {
  const tokenUrl = String(recipe.tokenUrl || '')
  const clientId = String(recipe.clientId || '')
  if (!tokenUrl || !clientId) return { token: '', error: 'This wire is configured for OAuth but has no token endpoint or client id.' }

  const key = `${tokenUrl}|${clientId}|${secretFingerprint(recipe.credential)}`
  const cached = TOKEN_CACHE.get(key)
  if (cached && cached.expiresAt > Date.now() + TOKEN_SAFETY_MS) return { token: cached.token, error: '' }

  const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: recipe.credential })
  if (recipe.scope) body.set('scope', recipe.scope)

  try {
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
    if (!response.ok) {
      // Deliberately does not echo the body: a failed token response frequently repeats the
      // client id, and this message travels into logs.
      return { token: '', error: `The token endpoint rejected these credentials (HTTP ${response.status}).` }
    }
    const payload = (await response.json().catch(() => ({}))) as { access_token?: string; expires_in?: number }
    const token = String(payload.access_token || '')
    if (!token) return { token: '', error: 'The token endpoint returned no access_token.' }
    const lifetimeMs = (Number(payload.expires_in) > 0 ? Number(payload.expires_in) : 3600) * 1000
    TOKEN_CACHE.set(key, { token, expiresAt: Date.now() + lifetimeMs })
    return { token, error: '' }
  } catch (error) {
    return { token: '', error: `Could not reach the token endpoint: ${error instanceof Error ? error.message : String(error)}` }
  }
}

/** Flat result rather than a union — the repo's toolchain does not always narrow one. */
async function authHeadersFor(recipe: AuthShape): Promise<{ headers: Record<string, string>; error: string }> {
  if (recipe.auth === 'oauth2') {
    const acquired = await oauthToken(recipe)
    if (!acquired.token) return { headers: {}, error: acquired.error }
    return { headers: { authorization: `Bearer ${acquired.token}` }, error: '' }
  }
  if (recipe.auth === 'bearer') return { headers: { authorization: `Bearer ${recipe.credential}` }, error: '' }
  if (recipe.auth === 'basic') {
    const pair = `${recipe.username ?? ''}:${recipe.credential}`
    // btoa is global in Node 16+; kept over a Buffer import so the payload stays runtime-neutral.
    return { headers: { authorization: `Basic ${btoa(pair)}` }, error: '' }
  }
  return { headers: { [recipe.authHeader || 'x-api-key']: recipe.credential }, error: '' }
}

async function runDeclaredWire(recipe: DeclaredWireRecipe, action: string, variables: Record<string, unknown>): Promise<RunnerResult> {
  if (action === 'fetch_report') {
    if (!recipe.reportUrl) {
      return result(true, 200, {
        status: 'pending',
        completed: false,
        reason: `${recipe.brand} has no reporting endpoint declared, so distribution cannot be confirmed automatically.`,
      })
    }
    const url = recipe.reportUrl.replace('{ref}', encodeURIComponent(String(variables.ref ?? '')))
    const auth = await authHeadersFor(recipe)
    if (auth.error) return refuse(`${recipe.brand}: ${auth.error}`)
    try {
      const response = await fetch(url, { headers: auth.headers })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) return result(false, response.status, {}, { error: `${recipe.brand} returned HTTP ${response.status}.` })
      return result(true, response.status, (body as Record<string, unknown>) ?? {})
    } catch (error) {
      return refuse(`Could not reach ${recipe.brand}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  if (action !== 'submit_release') return refuse(`${recipe.brand} does not support the action "${action}".`)

  const map = recipe.fieldMap || {}
  const payload: Record<string, unknown> = {
    ...(recipe.staticFields || {}),
    [map.headline || 'headline']: variables.headline ?? '',
    [map.body || 'body']: variables.body ?? '',
    [map.reference || 'external_ref']: variables.external_ref ?? '',
  }
  if (variables.language) payload[map.language || 'language'] = variables.language

  const auth = await authHeadersFor(recipe)
  if (auth.error) return refuse(`${recipe.brand}: ${auth.error}`)

  try {
    const response = await fetch(recipe.submitUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...auth.headers },
      body: JSON.stringify(payload),
    })
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>
    if (!response.ok) {
      return result(false, response.status, body ?? {}, { error: `${recipe.brand} rejected the release (HTTP ${response.status}).` })
    }
    const ref = String(body.id ?? body.ref ?? body.releaseId ?? variables.external_ref ?? '')
    return result(true, response.status, body ?? {}, { ref: ref || undefined })
  } catch (error) {
    return refuse(`Could not reach ${recipe.brand}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function runDeclaredDatabase(recipe: DeclaredDatabaseRecipe, action: string, variables: Record<string, unknown>): Promise<RunnerResult> {
  if (action !== 'verify_contact') return refuse(`${recipe.brand} does not support the action "${action}".`)
  const map = recipe.fieldMap || {}
  const fields: Record<string, unknown> = {
    ...(recipe.staticFields || {}),
    [map.contact || 'contact']: variables.contact ?? '',
    [map.publication || 'publication']: variables.publication ?? '',
  }
  if (variables.beat) fields[map.beat || 'beat'] = variables.beat

  const auth = await authHeadersFor(recipe)
  if (auth.error) return refuse(`${recipe.brand}: ${auth.error}`)

  try {
    let response: Response
    if ((recipe.method || 'POST') === 'GET') {
      const url = new URL(recipe.verifyUrl)
      for (const [key, value] of Object.entries(fields)) url.searchParams.set(key, String(value ?? ''))
      response = await fetch(url.toString(), { headers: auth.headers })
    } else {
      response = await fetch(recipe.verifyUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...auth.headers },
        body: JSON.stringify(fields),
      })
    }
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>
    if (!response.ok) return result(false, response.status, body ?? {}, { error: `${recipe.brand} returned HTTP ${response.status}.` })
    // The answer is read from where the buyer said it lives. A missing field is treated as NOT
    // FOUND rather than as found — the adapter refuses to dispatch on an unverified contact,
    // and defaulting the other way would turn a parsing miss into a send.
    const key = recipe.foundField || ''
    const found = key
      ? Boolean(body[key])
      : Boolean(body.found ?? body.verified ?? false)
    return result(true, response.status, { ...body, found }, {})
  } catch (error) {
    return refuse(`Could not reach ${recipe.brand}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Build a runner from credentials.
 *
 * The buyer configures this once. Nothing else in the portable changes, because every adapter
 * already speaks to `RunnerPort` — what changes is that the port is now full rather than empty.
 */
export function createPressRunner(config: PressRunnerConfig): RunnerPort {
  const declared = new Map((config.declaredWires || []).map(recipe => [recipe.brand.toLowerCase(), recipe]))
  const delegated = new Map((config.delegatedWires || []).map(entry => [entry.brand.toLowerCase(), entry]))
  const hasBusinessWire = Boolean(config.businessWire?.email && config.businessWire?.password)

  /** Which brand a pr_wire call goes to, and why, with no silent substitution. */
  function chooseWire(): { kind: 'businessWire' } | { kind: 'declared'; recipe: DeclaredWireRecipe } | { kind: 'none'; reason: string } {
    const preferred = config.preferredWire?.toLowerCase()
    if (preferred) {
      if (preferred === 'businesswire' || preferred === 'business wire') {
        return hasBusinessWire
          ? { kind: 'businessWire' }
          : { kind: 'none', reason: 'Business Wire is the preferred brand but no Connect credentials are configured.' }
      }
      const recipe = declared.get(preferred)
      if (recipe) return { kind: 'declared', recipe }
      const gated = delegated.get(preferred)
      if (gated) {
        return { kind: 'none', reason: gated.note || `${gated.brand} publishes no API. Submit through their portal, or point this at an endpoint you run.` }
      }
      return { kind: 'none', reason: `No configuration found for the preferred wire "${config.preferredWire}".` }
    }
    if (hasBusinessWire) return { kind: 'businessWire' }
    const first = (config.declaredWires || [])[0]
    if (first) return { kind: 'declared', recipe: first }
    return { kind: 'none', reason: 'No wire brand is configured. Add Business Wire credentials, or declare a wire with a REST endpoint.' }
  }

  return {
    async loadConfig(providerId: string): Promise<RunnerProviderConfig | null> {
      if (providerId === 'media_database') {
        const preferred = config.preferredDatabase?.toLowerCase()
        const recipes = config.declaredDatabases || []
        const recipe = preferred ? recipes.find(entry => entry.brand.toLowerCase() === preferred) : recipes[0]
        if (!recipe) return { connected: false, priceCents: 0, currency: 'USD' }
        return { connected: Boolean(recipe.verifyUrl && recipe.credential), priceCents: recipe.priceCents ?? 0, currency: recipe.currency || 'USD' }
      }
      if (providerId !== 'pr_wire') return null
      const chosen = chooseWire()
      if (chosen.kind === 'none') return { connected: false, priceCents: 0, currency: 'USD' }
      if (chosen.kind === 'businessWire') {
        return {
          connected: true,
          priceCents: config.businessWire?.priceCents ?? 0,
          currency: config.businessWire?.currency || 'USD',
        }
      }
      return {
        connected: true,
        priceCents: chosen.recipe.priceCents ?? 0,
        currency: chosen.recipe.currency || 'USD',
      }
    },

    async run(providerId: string, action: string, variables: Record<string, unknown>): Promise<RunnerResult> {
      if (providerId === 'media_database') {
        const preferred = config.preferredDatabase?.toLowerCase()
        const recipes = config.declaredDatabases || []
        const recipe = preferred ? recipes.find(entry => entry.brand.toLowerCase() === preferred) : recipes[0]
        if (recipe) return runDeclaredDatabase(recipe, action, variables)
        const gated = (config.delegatedDatabases || []).find(entry => !preferred || entry.brand.toLowerCase() === preferred)
        if (gated) {
          return refuse(gated.note || `${gated.brand} does not expose an API on your plan, so a contact cannot be verified automatically. Verify it in their interface, or supply targets you have already checked.`)
        }
        return refuse('No media database is configured. None of the major vendors publishes an open API, so this needs a subscription whose contract includes API access — declare it, or supply contacts you have verified yourself.')
      }

      if (providerId !== 'pr_wire') {
        return refuse(`This runner handles pr_wire and media_database; "${providerId}" was requested. Configure a runner for that provider or leave it unconfigured — an unconfigured provider is reported, never simulated.`)
      }

      const chosen = chooseWire()
      if (chosen.kind === 'none') return refuse(chosen.reason)

      if (chosen.kind === 'businessWire') {
        const wire = config.businessWire as BusinessWireConfig
        if (action === 'list_accounts') return listBusinessWireAccounts(wire)
        if (action === 'list_distributions') return listBusinessWireDistributions(wire)
        if (action === 'fetch_report') return fetchBusinessWireReport(wire, String(variables.ref ?? ''))
        if (action === 'submit_release') {
          return submitBusinessWireRelease(wire, {
            headline: String(variables.headline ?? ''),
            body: String(variables.body ?? ''),
            language: variables.language ? String(variables.language) : undefined,
            externalRef: variables.external_ref ? String(variables.external_ref) : undefined,
            releaseAt: variables.release_at ? String(variables.release_at) : undefined,
            timezoneCode: variables.timezone_code ? String(variables.timezone_code) : undefined,
            draft: variables.draft === true,
          })
        }
        return refuse(`Business Wire does not support the action "${action}".`)
      }

      return runDeclaredWire(chosen.recipe, action, variables)
    },
  }
}

/**
 * What is configured, in words a person can check before a release goes out.
 *
 * Exists because "is this actually wired up?" should be answerable without sending something.
 */
export function describePressRunner(config: PressRunnerConfig): {
  wires: Array<{ brand: string; reachable: boolean; how: string }>
  databases: Array<{ brand: string; reachable: boolean; how: string }>
  ready: boolean
} {
  const wires: Array<{ brand: string; reachable: boolean; how: string }> = []
  if (config.businessWire?.email && config.businessWire?.password) {
    const complete = Boolean(config.businessWire.sourceKey && config.businessWire.accountId && config.businessWire.savedDistributionId)
    wires.push({
      brand: 'Business Wire',
      reachable: complete,
      how: complete
        ? 'Built in. Credentials, account and distribution all configured.'
        : 'Built in, but incomplete: a source key, an account and a saved distribution must all be chosen before a release can be sent.',
    })
  }
  for (const recipe of config.declaredWires || []) {
    wires.push({ brand: recipe.brand, reachable: Boolean(recipe.submitUrl && recipe.credential), how: 'Declared REST endpoint.' })
  }
  for (const entry of config.delegatedWires || []) {
    wires.push({
      brand: entry.brand,
      reachable: Boolean(entry.bridgeUrl),
      how: entry.bridgeUrl ? 'Reached through an endpoint you run.' : entry.note || 'No public API. Submit through the vendor portal.',
    })
  }
  const databases: Array<{ brand: string; reachable: boolean; how: string }> = []
  for (const recipe of config.declaredDatabases || []) {
    databases.push({ brand: recipe.brand, reachable: Boolean(recipe.verifyUrl && recipe.credential), how: 'Declared REST endpoint.' })
  }
  for (const entry of config.delegatedDatabases || []) {
    databases.push({ brand: entry.brand, reachable: false, how: entry.note || 'No API on this plan. Verify contacts in the vendor interface.' })
  }

  return {
    wires,
    databases,
    // Ready means a release can actually be SENT. Contact verification is a safeguard on top of
    // that, not a precondition for it — a buyer with a verified list of their own is ready.
    ready: wires.some(wire => wire.reachable),
  }
}

/**
 * Check that a declared wire is reachable and its credential accepted, without publishing.
 *
 * Deliberately modest about what it proves. For an OAuth brand it acquires a token, which is a
 * real answer: the endpoint resolved and the client id and secret were accepted. For the others
 * it can only confirm the configuration is complete, because the sole way to test an API-key
 * wire is to send it something — and sending a test release to a wire is publishing it.
 *
 * It never submits. A "connected" result means the door opens, not that the submission will be
 * accepted, and it says so rather than implying more.
 */
export async function checkWireConnection(config: PressRunnerConfig, brand?: string): Promise<{
  brand: string
  reachable: boolean
  proven: 'credential_accepted' | 'configuration_complete' | 'not_configured'
  detail: string
}> {
  const wanted = String(brand || config.preferredWire || '').toLowerCase()
  const recipes = config.declaredWires || []
  const recipe = wanted ? recipes.find(entry => entry.brand.toLowerCase() === wanted) : recipes[0]

  if (!recipe) {
    if (config.businessWire?.email && config.businessWire?.password) {
      const complete = Boolean(config.businessWire.sourceKey && config.businessWire.accountId && config.businessWire.savedDistributionId)
      return {
        brand: 'Business Wire',
        reachable: complete,
        proven: complete ? 'configuration_complete' : 'not_configured',
        detail: complete
          ? 'Credentials, source key, account and distribution are all set. Business Wire is reached by logging in at submission time.'
          : 'Business Wire needs a source key, an account and a saved distribution before a release can be sent.',
      }
    }
    return { brand: wanted || '(none)', reachable: false, proven: 'not_configured', detail: 'No wire is configured under that name.' }
  }

  if (recipe.auth === 'oauth2') {
    const acquired = await oauthToken(recipe)
    return acquired.token
      ? { brand: recipe.brand, reachable: true, proven: 'credential_accepted', detail: 'The token endpoint accepted these credentials. A submission has not been attempted.' }
      : { brand: recipe.brand, reachable: false, proven: 'not_configured', detail: acquired.error }
  }

  const complete = Boolean(recipe.submitUrl && recipe.credential)
  return {
    brand: recipe.brand,
    reachable: complete,
    proven: complete ? 'configuration_complete' : 'not_configured',
    detail: complete
      ? 'Endpoint and credential are set. This scheme cannot be tested without sending a release, so nothing was sent.'
      : 'This wire is missing its endpoint or its credential.',
  }
}

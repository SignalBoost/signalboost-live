// saas/press-media-core/runners/businesswire.ts
//
// A REAL BUSINESS WIRE INTEGRATION. Not a port for the buyer to fill in — the actual calls.
//
// Until now every paid press provider ended at `ports.runner`, an interface the BUYER had to
// implement. That meant we shipped the safety rails and asked the customer to build the engine.
// A buyer who has paid for a press portable and then has to write the Business Wire client
// themselves has not bought a product; they have bought a specification.
//
// This file talks to Business Wire's Connect 5 Client Services API directly. The buyer supplies
// their Connect email, password and source key — the same three things they would type into the
// web portal — and nothing else. No SDK, no dependency: `fetch`, `FormData` and `Blob` are
// global in Node 18+, so the payload stays dependency-free and the boundary holds.
//
// THE FLOW, exactly as Business Wire documents it:
//
//   1. POST /auth/login          { email, password, strategy: 'legacyUser' }
//                                → JWT in the x-auth-token response HEADER (not the body),
//                                  refresh token in x-refresh-token.
//   2. GET  /api/v1/client/account/lookup      → the accounts this login can post under.
//   3. GET  /api/v1/order/savedDistribution    → the distribution lists they have saved.
//   4. POST /api/v1/clientServices/order       → multipart/form-data: the order JSON plus the
//                                                release text as an uploaded file.
//
// THE JWT IS SHORT-LIVED AND IS NOT CACHED ACROSS CALLS. Business Wire's own documentation says
// each request needs a new one. We log in per operation rather than holding a token that will
// be expired by the time it matters — a stale token here fails at submission, which is the
// worst possible moment for a press release.
//
// TWO THINGS THE BUYER MUST CHOOSE, AND WHY THEY ARE PICKED RATHER THAN TYPED:
//
//   accountId            which of their accounts the release is billed and attributed to
//   savedDistributionId  which circuit it goes out on — the thing that decides reach and cost
//
// Both are read LIVE from their account by `list_accounts` and `list_distributions`. A typed
// account number would silently post under the wrong entity; a typed distribution id would
// silently buy the wrong circuit. Neither error is visible until after the release is out.
//
// WORK IN PROGRESS IS THE DEFAULT ANSWER TO A MISSING CHOICE. If no saved distribution is
// configured, this refuses rather than guessing one — sending a release on an unknown circuit
// is spending someone else's money on a decision nobody made.
//
// NO CREDENTIAL EVER LEAVES THIS FILE. It goes into the login request and nowhere else: not
// into a returned object, not into an error message, not into a log line.

export type BusinessWireConfig = {
  /** Connect login email. */
  email: string
  /** Connect password. */
  password: string
  /**
   * Order source key. Business Wire issues this per client — their documentation says to ask
   * your account representative. Without it the order is refused by their API, not by us.
   */
  sourceKey: string
  /** Which account to post under. Read from list_accounts; never invented. */
  accountId?: number
  /** Which saved distribution circuit to use. Read from list_distributions; never invented. */
  savedDistributionId?: number
  /** Contact block printed on the release. Business Wire requires both. */
  contactEmail?: string
  contactPhone?: string
  /** Override for testing against a sandbox host. Defaults to the documented platform host. */
  baseUrl?: string
}

export type BusinessWireResult = {
  ok: boolean
  status: number
  outputs: Record<string, unknown>
  ref?: string
  error?: string
}

const DEFAULT_BASE = 'https://platform.businesswire.com'

/** Business Wire's documented schedule codes. */
const SCHEDULE_IMMEDIATE = 1
const SCHEDULE_AT_TIME = 3

/** Their release-text language codes. Anything else is sent as English rather than refused. */
const SUPPORTED_LANGUAGES = new Set([
  'en', 'es', 'pt', 'de', 'fr', 'it', 'nl', 'da', 'no', 'sv', 'fi',
  'pl', 'cs', 'hu', 'et', 'lv', 'lt', 'ja', 'zh-HK', 'zh-CN',
])

function languageCode(value: unknown): string {
  const raw = String(value ?? 'en').trim()
  return SUPPORTED_LANGUAGES.has(raw) ? raw : 'en'
}

function failure(status: number, error: string): BusinessWireResult {
  return { ok: false, status, outputs: {}, error }
}

/**
 * Log in and return a fresh JWT.
 *
 * The token arrives in a RESPONSE HEADER rather than the body, which is unusual enough that
 * reading the body and finding nothing is the first mistake anyone makes against this API.
 */
type LoginOutcome = { token: string; error: string; status: number }

async function login(config: BusinessWireConfig, base: string): Promise<LoginOutcome> {
  let response: Response
  try {
    response = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: config.email, password: config.password, strategy: 'legacyUser' }),
    })
  } catch (error) {
    return { token: '', error: `Could not reach Business Wire: ${error instanceof Error ? error.message : String(error)}`, status: 0 }
  }
  if (!response.ok) {
    // Deliberately does not echo the response body: a failed login response can contain the
    // submitted address, and this message travels into logs.
    return { token: '', error: `Business Wire rejected the login (HTTP ${response.status}). Check the Connect email and password.`, status: response.status }
  }
  const token = response.headers.get('x-auth-token') || ''
  if (!token) {
    return { token: '', error: 'Business Wire accepted the login but returned no x-auth-token header.', status: response.status }
  }
  return { token, error: '', status: response.status }
}

/**
 * One uniform shape rather than a discriminated union, deliberately.
 *
 * A union here would be tidier to read and would force every caller to narrow it — and
 * narrowing is exactly what failed in this repo's build once already, compiling locally and
 * breaking under the toolchain that matters. A flat record costs one field and cannot break.
 */
type GetOutcome = { ok: boolean; body: unknown; status: number; error: string }

async function authorisedGet(path: string, token: string, base: string): Promise<GetOutcome> {
  try {
    const response = await fetch(`${base}${path}`, { headers: { authorization: `Bearer ${token}` } })
    if (!response.ok) {
      return { ok: false, body: null, status: response.status, error: `Business Wire returned HTTP ${response.status} for ${path}.` }
    }
    return { ok: true, body: await response.json(), status: response.status, error: '' }
  } catch (error) {
    return { ok: false, body: null, status: 0, error: `Could not reach Business Wire: ${error instanceof Error ? error.message : String(error)}` }
  }
}

/** The accounts this login may post under. Feeds a picker; never a typed field. */
export async function listBusinessWireAccounts(config: BusinessWireConfig): Promise<BusinessWireResult> {
  const base = config.baseUrl || DEFAULT_BASE
  const auth = await login(config, base)
  if (!auth.token) return failure(auth.status, auth.error)
  const result = await authorisedGet('/api/v1/client/account/lookup', auth.token, base)
  if (!result.ok) return failure(result.status, result.error)
  return { ok: true, status: 200, outputs: { accounts: result.body } }
}

/** The saved distribution circuits on this account. Feeds a picker; never a typed field. */
export async function listBusinessWireDistributions(config: BusinessWireConfig): Promise<BusinessWireResult> {
  const base = config.baseUrl || DEFAULT_BASE
  const auth = await login(config, base)
  if (!auth.token) return failure(auth.status, auth.error)
  const result = await authorisedGet('/api/v1/order/savedDistribution', auth.token, base)
  if (!result.ok) return failure(result.status, result.error)
  return { ok: true, status: 200, outputs: { distributions: result.body } }
}

export type BusinessWireSubmission = {
  headline: string
  body: string
  language?: string
  /** ISO timestamp. Omit for immediate release. */
  releaseAt?: string
  /** Business Wire timezone code, e.g. 'ET'. Required when releaseAt is set. */
  timezoneCode?: string
  /** Your own reference, carried into the filename so a submission can be traced back. */
  externalRef?: string
  /**
   * When true the order is saved to drafts instead of being sent. Business Wire calls this
   * workInProgress. Useful for a first run: the release appears in their portal for a human to
   * look at before anything goes out.
   */
  draft?: boolean
}

/**
 * Submit a release.
 *
 * Refuses before contacting Business Wire when anything required is missing, so a buyer finds
 * out from us, immediately, rather than from a rejected order later.
 */
export async function submitBusinessWireRelease(
  config: BusinessWireConfig,
  submission: BusinessWireSubmission,
): Promise<BusinessWireResult> {
  const base = config.baseUrl || DEFAULT_BASE

  if (!config.sourceKey) return failure(0, 'Business Wire needs a source key. Ask your account representative for one; the order is refused without it.')
  if (!config.accountId) return failure(0, 'No Business Wire account selected. Choose one from list_accounts rather than typing a number — the wrong account posts under the wrong entity.')
  if (!config.savedDistributionId) return failure(0, 'No saved distribution selected. Choose one from list_distributions; sending on an unknown circuit spends money on a decision nobody made.')
  if (!config.contactEmail || !config.contactPhone) return failure(0, 'Business Wire requires a release contact email and phone on every order.')
  if (!String(submission.headline || '').trim()) return failure(0, 'A headline is required.')
  if (!String(submission.body || '').trim()) return failure(0, 'Release text is required.')

  const auth = await login(config, base)
  if (!auth.token) return failure(auth.status, auth.error)

  const language = languageCode(submission.language)
  const filename = `release-${String(submission.externalRef || Date.now()).replace(/[^A-Za-z0-9_-]/g, '')}.txt`
  const releaseText = `${submission.headline.trim()}\n\n${submission.body.trim()}\n`

  const schedule: Record<string, unknown> = { accountId: config.accountId }
  if (submission.releaseAt) {
    const at = new Date(submission.releaseAt)
    if (!Number.isFinite(at.getTime())) return failure(0, 'releaseAt is not a valid timestamp.')
    if (!submission.timezoneCode) return failure(0, 'A scheduled release needs a Business Wire timezone code, for example ET.')
    schedule.scheduleType = SCHEDULE_AT_TIME
    // Their documented format: YYYY-MM-DD HH:MM, 24-hour.
    schedule.dateAndTime = at.toISOString().slice(0, 16).replace('T', ' ')
    schedule.timezoneCode = submission.timezoneCode
  } else {
    schedule.scheduleType = SCHEDULE_IMMEDIATE
  }

  const order = {
    workInProgress: submission.draft === true,
    schedule,
    distribution: { savedDistributionId: config.savedDistributionId },
    files: { releaseText: [{ filename, language }] },
    details: {
      requireCopyApproval: false,
      pullQuotesAndTweetThis: { disablePullQuote: false, disableTweetBtn: false },
      releaseContact: { contactEmail: config.contactEmail, contactPhone: config.contactPhone },
      sourceKey: config.sourceKey,
    },
  }

  const form = new FormData()
  form.append('order', JSON.stringify({ order }))
  form.append('files', new Blob([releaseText], { type: 'text/plain' }), filename)

  let response: Response
  try {
    response = await fetch(`${base}/api/v1/clientServices/order`, {
      method: 'POST',
      headers: { authorization: `Bearer ${auth.token}` },
      body: form,
    })
  } catch (error) {
    return failure(0, `Could not reach Business Wire: ${error instanceof Error ? error.message : String(error)}`)
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    return { ok: false, status: response.status, outputs: (payload as Record<string, unknown>) ?? {}, error: `Business Wire rejected the order (HTTP ${response.status}).` }
  }

  const record = (payload as Record<string, unknown>) || {}
  const ref = String(record.orderId ?? record.id ?? record.orderNumber ?? submission.externalRef ?? '')
  return {
    ok: true,
    status: response.status,
    outputs: { ...record, submittedAs: submission.draft ? 'draft' : 'submitted', filename },
    ref: ref || undefined,
  }
}

/**
 * Ask what happened to a submitted order.
 *
 * Business Wire's published Client Services API does not document a status endpoint, so this
 * reports PENDING with the reason rather than inventing a result. That is the honest answer and
 * it matches the portable's rule everywhere else: proof is never fabricated. A buyer confirms
 * distribution in their Business Wire portal, or their account representative supplies the
 * reporting endpoint their contract includes, which this file can then use.
 */
export async function fetchBusinessWireReport(_config: BusinessWireConfig, ref: string): Promise<BusinessWireResult> {
  return {
    ok: true,
    status: 200,
    outputs: {
      ref,
      status: 'pending',
      completed: false,
      reason: 'Business Wire does not publish an order-status endpoint in its Client Services API. Confirm distribution in the Business Wire portal.',
    },
    ref,
  }
}

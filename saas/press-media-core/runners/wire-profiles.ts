// saas/press-media-core/runners/wire-profiles.ts
//
// THE POPULAR VENDORS, PRE-STAGED AS FAR AS HONESTY ALLOWS.
//
// Business Wire publishes its developer documentation openly, so it is implemented in full and
// needs credentials alone. Every other major wire — PR Newswire, GlobeNewswire, PRWeb,
// Accesswire — has an API and hands the documentation only to contracted customers. We cannot
// read a specification we are not given, and GUESSING ONE IS WORSE THAN AN HONEST GAP: an
// invented endpoint fails in front of a buyer, at the moment they are trying to publish.
//
// But the buyer is not missing that information. It is in the onboarding pack their account
// representative gave them. So the gap is not "build an integration" — it is "paste three
// values". This file removes everything except those three.
//
// WHAT A PROFILE CARRIES: the brand as a person names it, the authentication scheme the vendor
// actually uses, the field names the request will carry, and a plain sentence saying exactly
// which values to copy and where they appear in the pack. What it does NOT carry is a URL we
// guessed. A blank the buyer fills from their own contract is honest; a plausible-looking
// address that 404s is not.
//
// THE PROTOCOL WORK THIS MADE POSSIBLE. Enterprise wires authenticate with OAuth 2.0 client
// credentials — a published standard, implementable correctly without any vendor's private
// documentation. That is now supported alongside bearer, API-key and basic, which means for
// most of these brands the only unknown left is the endpoint itself.
//
// PURE: no imports, no environment reads, no network. This file is data and one mapping
// function; the runner performs the calls.

/** How a vendor expects its credential to be presented. */
export type WireAuthScheme = 'oauth2' | 'bearer' | 'api-key-header' | 'basic'

export type WireProfile = {
  /** Stable id used in configuration. */
  brand: string
  /** The brand as a person writes it. */
  label: string
  /** Who owns it now — relevant because this market has consolidated heavily. */
  parent?: string
  auth: WireAuthScheme
  /** Header name when auth is api-key-header. */
  authHeader?: string
  /** Field names this vendor's submission payload is expected to use. */
  fieldMap: { headline: string; body: string; reference: string; language?: string }
  /**
   * Exactly what to copy from the onboarding pack, in the buyer's terms. Written as an
   * instruction rather than a description, because this is read by someone who has the pack
   * open beside them.
   */
  whatToCopy: readonly string[]
  /** Anything about this vendor a buyer should know before choosing it. */
  note?: string
  /** True when we ship a full implementation and no endpoint is needed. */
  builtIn?: boolean
  /** True when the vendor publishes no API at all and the entry exists to say so. */
  noApi?: boolean
}

const WIRE_PROFILES: readonly WireProfile[] = Object.freeze([
  {
    brand: 'business-wire',
    label: 'Business Wire',
    parent: 'Berkshire Hathaway',
    auth: 'basic',
    builtIn: true,
    fieldMap: { headline: 'headline', body: 'body', reference: 'external_ref', language: 'language' },
    whatToCopy: Object.freeze([
      'Your Connect login email and password — the same ones you use on their web portal.',
      'Your source key: ask your account representative. Their API refuses an order without it.',
      'Nothing else. Your account and your distribution circuit are read live from your account and chosen from a list.',
    ]),
    note: 'Fully implemented against their published Connect 5 API. Credentials only — no endpoint to supply.',
  },
  {
    brand: 'pr-newswire',
    label: 'PR Newswire',
    parent: 'Cision',
    auth: 'oauth2',
    fieldMap: { headline: 'headline', body: 'body', reference: 'clientReference', language: 'language' },
    whatToCopy: Object.freeze([
      'The distribution endpoint URL from your onboarding pack.',
      'The token endpoint URL — usually on the same page, labelled authentication or OAuth.',
      'Your client id and client secret. These are issued per account, not per user.',
    ]),
    note: 'Cision issues API documentation to contracted customers. We implement the OAuth 2.0 client-credentials flow they use; the endpoints come from your pack.',
  },
  {
    brand: 'globenewswire',
    label: 'GlobeNewswire',
    parent: 'Notified',
    auth: 'oauth2',
    fieldMap: { headline: 'title', body: 'content', reference: 'externalId', language: 'language' },
    whatToCopy: Object.freeze([
      'The submission endpoint URL from your Notified integration pack.',
      'The token endpoint URL.',
      'Your client id and client secret.',
    ]),
  },
  {
    brand: 'prweb',
    label: 'PRWeb',
    parent: 'Cision',
    auth: 'api-key-header',
    authHeader: 'x-api-key',
    fieldMap: { headline: 'headline', body: 'body', reference: 'reference', language: 'language' },
    whatToCopy: Object.freeze([
      'The submission endpoint URL from your account settings.',
      'Your API key. PRWeb sends it as a header rather than a bearer token.',
    ]),
  },
  {
    brand: 'accesswire',
    label: 'Accesswire',
    parent: 'Issuer Direct',
    auth: 'bearer',
    fieldMap: { headline: 'headline', body: 'body', reference: 'reference', language: 'language' },
    whatToCopy: Object.freeze([
      'The submission endpoint URL from your account documentation.',
      'Your API token.',
    ]),
  },
  {
    brand: 'ein-presswire',
    label: 'EIN Presswire',
    parent: 'Newsmatics',
    auth: 'bearer',
    noApi: true,
    fieldMap: { headline: 'headline', body: 'body', reference: 'reference' },
    whatToCopy: Object.freeze([
      'Nothing. There is no developer API to connect.',
    ]),
    note: 'EIN Presswire publishes no developer API — releases are uploaded through their portal or by their account team. Listed so you know at setup rather than at send time. If your team fronts it with an endpoint of your own, declare that instead.',
  },
])

export type DatabaseProfile = {
  brand: string
  label: string
  parent?: string
  auth: WireAuthScheme
  authHeader?: string
  fieldMap: { contact: string; publication: string; beat?: string }
  /** Where the yes/no lives in this vendor's response, when it is known. */
  foundField?: string
  method?: 'GET' | 'POST'
  whatToCopy: readonly string[]
  note?: string
  noApi?: boolean
}

const DATABASE_PROFILES: readonly DatabaseProfile[] = Object.freeze([
  {
    brand: 'cision',
    label: 'Cision',
    auth: 'oauth2',
    fieldMap: { contact: 'email', publication: 'outlet', beat: 'beat' },
    foundField: 'found',
    whatToCopy: Object.freeze([
      'The contact lookup endpoint from your Cision API pack.',
      'The token endpoint, plus your client id and secret.',
    ]),
    note: 'Available only on plans that include API access. Ask your account team whether yours does before promising it internally.',
  },
  {
    brand: 'meltwater',
    label: 'Meltwater',
    auth: 'bearer',
    fieldMap: { contact: 'email', publication: 'outlet' },
    whatToCopy: Object.freeze([
      'The contact endpoint from your Meltwater API documentation.',
      'Your API token.',
    ]),
  },
  {
    brand: 'muck-rack',
    label: 'Muck Rack',
    auth: 'bearer',
    fieldMap: { contact: 'email', publication: 'outlet' },
    whatToCopy: Object.freeze([
      'The journalist lookup endpoint from your Muck Rack API access.',
      'Your API token.',
    ]),
  },
  {
    brand: 'agility-pr',
    label: 'Agility PR',
    auth: 'api-key-header',
    authHeader: 'x-api-key',
    fieldMap: { contact: 'email', publication: 'outlet' },
    whatToCopy: Object.freeze([
      'The contact endpoint from your Agility account.',
      'Your API key.',
    ]),
  },
  {
    brand: 'prowly',
    label: 'Prowly',
    parent: 'Semrush',
    auth: 'bearer',
    noApi: true,
    fieldMap: { contact: 'email', publication: 'outlet' },
    whatToCopy: Object.freeze(['Nothing. Prowly states publicly that it has no API.']),
    note: 'Listed so the answer is visible at setup. Verify contacts in their interface, or supply a list you have already checked.',
  },
])

export function listWireProfiles(): readonly WireProfile[] {
  return WIRE_PROFILES
}

export function getWireProfile(brand: string): WireProfile | null {
  const wanted = String(brand || '').trim().toLowerCase()
  return WIRE_PROFILES.find(profile => profile.brand === wanted || profile.label.toLowerCase() === wanted) || null
}

export function listDatabaseProfiles(): readonly DatabaseProfile[] {
  return DATABASE_PROFILES
}

export function getDatabaseProfile(brand: string): DatabaseProfile | null {
  const wanted = String(brand || '').trim().toLowerCase()
  return DATABASE_PROFILES.find(profile => profile.brand === wanted || profile.label.toLowerCase() === wanted) || null
}

/** What a buyer still has to supply for a chosen brand. Flat, so no caller has to narrow it. */
export type ProfileFillResult = {
  ok: boolean
  /** Present when ok. Shaped for createPressRunner's declaredWires / declaredDatabases. */
  recipe: Record<string, unknown> | null
  /** Present when not ok — names what is missing, in the buyer's words. */
  reason: string
}

export type WireProfileSecrets = {
  /** Submission endpoint from the buyer's onboarding pack. */
  submitUrl?: string
  /** Optional status endpoint. `{ref}` is substituted. */
  reportUrl?: string
  /** OAuth token endpoint, for the oauth2 brands. */
  tokenUrl?: string
  /** OAuth client id, or the plain credential for the other schemes. */
  clientId?: string
  credential?: string
  /** Basic-auth user, when the scheme is basic. */
  username?: string
  /** Anything the vendor always requires — an account id, a circuit code. */
  staticFields?: Record<string, unknown>
  priceCents?: number
  currency?: string
}

/**
 * Turn a chosen brand plus the buyer's three values into a working recipe.
 *
 * Refuses rather than half-building: a recipe missing its endpoint would sit in the
 * configuration looking connected and fail at the moment of publishing.
 */
export function fillWireProfile(brand: string, secrets: WireProfileSecrets): ProfileFillResult {
  const profile = getWireProfile(brand)
  if (!profile) return { ok: false, recipe: null, reason: `Unknown wire brand "${brand}". Choose one of: ${WIRE_PROFILES.map(entry => entry.label).join(', ')}.` }
  if (profile.builtIn) {
    return { ok: false, recipe: null, reason: `${profile.label} is implemented in full — configure it under businessWire with your credentials rather than as a declared wire.` }
  }
  if (profile.noApi) {
    return { ok: false, recipe: null, reason: profile.note || `${profile.label} publishes no API.` }
  }

  const missing: string[] = []
  if (!secrets.submitUrl) missing.push('the submission endpoint from your onboarding pack')
  if (!secrets.credential) missing.push(profile.auth === 'oauth2' ? 'your client secret' : 'your API key or token')
  if (profile.auth === 'oauth2' && !secrets.tokenUrl) missing.push('the token endpoint')
  if (profile.auth === 'oauth2' && !secrets.clientId) missing.push('your client id')
  if (profile.auth === 'basic' && !secrets.username) missing.push('your account user name')
  if (missing.length) return { ok: false, recipe: null, reason: `${profile.label} still needs ${missing.join(', ')}.` }

  return {
    ok: true,
    reason: '',
    recipe: {
      brand: profile.label,
      submitUrl: secrets.submitUrl,
      ...(secrets.reportUrl ? { reportUrl: secrets.reportUrl } : {}),
      auth: profile.auth,
      ...(profile.authHeader ? { authHeader: profile.authHeader } : {}),
      credential: secrets.credential,
      ...(secrets.username ? { username: secrets.username } : {}),
      ...(secrets.clientId ? { clientId: secrets.clientId } : {}),
      ...(secrets.tokenUrl ? { tokenUrl: secrets.tokenUrl } : {}),
      fieldMap: profile.fieldMap,
      ...(secrets.staticFields ? { staticFields: secrets.staticFields } : {}),
      ...(secrets.priceCents === undefined ? {} : { priceCents: secrets.priceCents }),
      ...(secrets.currency ? { currency: secrets.currency } : {}),
    },
  }
}

/** Same, for a media database. */
export function fillDatabaseProfile(brand: string, secrets: WireProfileSecrets & { verifyUrl?: string }): ProfileFillResult {
  const profile = getDatabaseProfile(brand)
  if (!profile) return { ok: false, recipe: null, reason: `Unknown media database "${brand}". Choose one of: ${DATABASE_PROFILES.map(entry => entry.label).join(', ')}.` }
  if (profile.noApi) return { ok: false, recipe: null, reason: profile.note || `${profile.label} publishes no API.` }

  const missing: string[] = []
  if (!secrets.verifyUrl) missing.push('the contact lookup endpoint from your pack')
  if (!secrets.credential) missing.push(profile.auth === 'oauth2' ? 'your client secret' : 'your API key or token')
  if (profile.auth === 'oauth2' && !secrets.tokenUrl) missing.push('the token endpoint')
  if (profile.auth === 'oauth2' && !secrets.clientId) missing.push('your client id')
  if (missing.length) return { ok: false, recipe: null, reason: `${profile.label} still needs ${missing.join(', ')}.` }

  return {
    ok: true,
    reason: '',
    recipe: {
      brand: profile.label,
      verifyUrl: secrets.verifyUrl,
      auth: profile.auth,
      ...(profile.authHeader ? { authHeader: profile.authHeader } : {}),
      credential: secrets.credential,
      ...(secrets.clientId ? { clientId: secrets.clientId } : {}),
      ...(secrets.tokenUrl ? { tokenUrl: secrets.tokenUrl } : {}),
      fieldMap: profile.fieldMap,
      ...(profile.foundField ? { foundField: profile.foundField } : {}),
      ...(profile.method ? { method: profile.method } : {}),
      ...(secrets.priceCents === undefined ? {} : { priceCents: secrets.priceCents }),
      ...(secrets.currency ? { currency: secrets.currency } : {}),
    },
  }
}

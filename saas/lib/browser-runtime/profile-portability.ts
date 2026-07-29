export const BROWSER_PROFILE_SNAPSHOT_SCHEMA_VERSION = '1.0.0' as const

export interface BrowserProfileCookie {
  readonly name: string
  readonly value: string
  readonly domain: string
  readonly path: string
  readonly expires?: number
  readonly httpOnly?: boolean
  readonly secure?: boolean
  readonly sameSite?: 'Strict' | 'Lax' | 'None'
}

export interface BrowserProfileStorageItem {
  readonly name: string
  readonly value: string
}

export interface BrowserProfileOriginStorage {
  readonly origin: string
  readonly localStorage: readonly Readonly<BrowserProfileStorageItem>[]
}

export interface BrowserProfileSnapshot {
  readonly schemaVersion: typeof BROWSER_PROFILE_SNAPSHOT_SCHEMA_VERSION
  readonly profileId: string
  readonly createdAt: string
  readonly cookies: readonly BrowserProfileCookie[]
  readonly origins: readonly BrowserProfileOriginStorage[]
}

export interface BrowserProfilePort {
  exportProfile(): Promise<BrowserProfileSnapshot>
  importProfile(snapshot: BrowserProfileSnapshot): Promise<void>
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested)
  return value
}

function requireString(value: unknown, code: string, max = 4096): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > max || value.includes('\0')) throw new Error(code)
  return value
}

function normalizeOrigin(value: unknown): string {
  const origin = requireString(value, 'browser_profile_origin_invalid', 2048)
  let parsed: URL
  try { parsed = new URL(origin) } catch { throw new Error('browser_profile_origin_invalid') }
  if (parsed.origin !== origin || !/^https?:$/.test(parsed.protocol)) throw new Error('browser_profile_origin_invalid')
  return origin
}

export function normalizeBrowserProfileSnapshot(value: BrowserProfileSnapshot): BrowserProfileSnapshot {
  if (!value || value.schemaVersion !== BROWSER_PROFILE_SNAPSHOT_SCHEMA_VERSION) throw new Error('browser_profile_schema_invalid')
  const profileId = requireString(value.profileId, 'browser_profile_id_invalid', 128)
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(profileId)) throw new Error('browser_profile_id_invalid')
  const createdAt = requireString(value.createdAt, 'browser_profile_created_at_invalid', 64)
  if (!Number.isFinite(Date.parse(createdAt))) throw new Error('browser_profile_created_at_invalid')
  if (!Array.isArray(value.cookies) || value.cookies.length > 10000) throw new Error('browser_profile_cookies_invalid')
  if (!Array.isArray(value.origins) || value.origins.length > 1000) throw new Error('browser_profile_origins_invalid')

  const cookies = value.cookies.map((cookie: BrowserProfileCookie) => Object.freeze({
    name: requireString(cookie?.name, 'browser_profile_cookie_invalid', 1024),
    value: requireString(cookie?.value, 'browser_profile_cookie_invalid', 16384),
    domain: requireString(cookie?.domain, 'browser_profile_cookie_invalid', 512),
    path: requireString(cookie?.path, 'browser_profile_cookie_invalid', 2048),
    ...(cookie.expires === undefined ? {} : { expires: Number.isFinite(cookie.expires) ? cookie.expires : (() => { throw new Error('browser_profile_cookie_invalid') })() }),
    ...(cookie.httpOnly === undefined ? {} : { httpOnly: cookie.httpOnly === true }),
    ...(cookie.secure === undefined ? {} : { secure: cookie.secure === true }),
    ...(cookie.sameSite === undefined ? {} : { sameSite: cookie.sameSite }),
  })).sort((a: Readonly<BrowserProfileCookie>, b: Readonly<BrowserProfileCookie>) => `${a.domain}\0${a.path}\0${a.name}`.localeCompare(`${b.domain}\0${b.path}\0${b.name}`))

  const cookieKeys = cookies.map((cookie: Readonly<BrowserProfileCookie>) => `${cookie.domain}\0${cookie.path}\0${cookie.name}`)
  if (new Set(cookieKeys).size !== cookieKeys.length) throw new Error('browser_profile_cookie_duplicate')
  if (cookies.some((cookie: Readonly<BrowserProfileCookie>) => cookie.sameSite !== undefined && !['Strict', 'Lax', 'None'].includes(cookie.sameSite))) throw new Error('browser_profile_cookie_invalid')

  const origins = value.origins.map((entry: BrowserProfileOriginStorage) => {
    const origin = normalizeOrigin(entry?.origin)
    if (!Array.isArray(entry.localStorage) || entry.localStorage.length > 10000) throw new Error('browser_profile_storage_invalid')
    const localStorage = entry.localStorage.map((item: Readonly<BrowserProfileStorageItem>) => Object.freeze({
      name: requireString(item?.name, 'browser_profile_storage_invalid', 4096),
      value: requireString(item?.value, 'browser_profile_storage_invalid', 1048576),
    })).sort((a: Readonly<BrowserProfileStorageItem>, b: Readonly<BrowserProfileStorageItem>) => a.name.localeCompare(b.name))
    if (new Set(localStorage.map((item: Readonly<BrowserProfileStorageItem>) => item.name)).size !== localStorage.length) throw new Error('browser_profile_storage_duplicate')
    return Object.freeze({ origin, localStorage: Object.freeze(localStorage) })
  }).sort((a: Readonly<BrowserProfileOriginStorage>, b: Readonly<BrowserProfileOriginStorage>) => a.origin.localeCompare(b.origin))

  if (new Set(origins.map((entry: Readonly<BrowserProfileOriginStorage>) => entry.origin)).size !== origins.length) throw new Error('browser_profile_origin_duplicate')

  return deepFreeze({
    schemaVersion: BROWSER_PROFILE_SNAPSHOT_SCHEMA_VERSION,
    profileId,
    createdAt: new Date(createdAt).toISOString(),
    cookies: Object.freeze(cookies),
    origins: Object.freeze(origins),
  })
}

export function serializeBrowserProfileSnapshot(snapshot: BrowserProfileSnapshot): string {
  return JSON.stringify(normalizeBrowserProfileSnapshot(snapshot))
}

export function deserializeBrowserProfileSnapshot(payload: string): BrowserProfileSnapshot {
  if (typeof payload !== 'string' || payload.length === 0 || payload.length > 25_000_000) throw new Error('browser_profile_payload_invalid')
  let parsed: unknown
  try { parsed = JSON.parse(payload) } catch { throw new Error('browser_profile_payload_invalid') }
  return normalizeBrowserProfileSnapshot(parsed as BrowserProfileSnapshot)
}

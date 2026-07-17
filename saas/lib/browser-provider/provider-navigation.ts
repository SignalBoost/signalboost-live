import { BrowserProviderError } from './provider-errors.ts'
import { BPAL_SCHEMA_VERSION } from './provider-version.ts'

export interface BrowserProviderNavigationProfile {
  navigationProfileId: string
  providerId: string
  labelKey: string
  originId: string
  routeTemplate?: string
  fixedPath?: string
  requiredParameters: readonly string[]
  readOnly: boolean
  supportedCapabilities: readonly string[]
  schemaVersion: typeof BPAL_SCHEMA_VERSION
}
export type NavigationProfile = BrowserProviderNavigationProfile
export type NavigationId = string

function hasDuplicates(values: readonly string[]): boolean {
  return new Set(values).size !== values.length
}

export function assertBrowserProviderNavigationProfile(profile: BrowserProviderNavigationProfile): Readonly<BrowserProviderNavigationProfile> {
  if (!profile.navigationProfileId || !profile.providerId || !profile.labelKey || profile.schemaVersion !== BPAL_SCHEMA_VERSION || !profile.readOnly) {
    throw new BrowserProviderError('invalid_navigation')
  }
  if ((!profile.routeTemplate && !profile.fixedPath) || (profile.routeTemplate && profile.fixedPath)) {
    throw new BrowserProviderError('invalid_navigation')
  }

  const path = profile.routeTemplate ?? profile.fixedPath ?? ''
  if (
    !path.startsWith('/')
    || path.startsWith('//')
    || /https?:\/\//i.test(path)
    || /\\|[?#]|%2e|%2f|%5c/i.test(path)
    || path.split('/').some(segment => segment === '.' || segment === '..')
    || hasDuplicates(profile.requiredParameters)
    || hasDuplicates(profile.supportedCapabilities)
  ) {
    throw new BrowserProviderError('invalid_navigation')
  }

  const declaredParameters = [...profile.requiredParameters].sort()
  const templateParameters = [...path.matchAll(/:([A-Za-z][A-Za-z0-9_]*)/g)].map(match => match[1]).sort()
  if (JSON.stringify(declaredParameters) !== JSON.stringify(templateParameters)) {
    throw new BrowserProviderError('invalid_navigation')
  }

  return Object.freeze({
    ...profile,
    requiredParameters: Object.freeze(declaredParameters),
    supportedCapabilities: Object.freeze([...profile.supportedCapabilities].sort()),
  })
}

export function createNavigationRegistry(items: readonly BrowserProviderNavigationProfile[]) {
  const seen = new Set<string>()
  const values = items.map(assertBrowserProviderNavigationProfile).sort((a, b) => a.navigationProfileId.localeCompare(b.navigationProfileId))
  for (const item of values) {
    if (seen.has(item.navigationProfileId)) throw new BrowserProviderError('duplicate_navigation')
    seen.add(item.navigationProfileId)
  }
  const map = new Map(values.map(item => [item.navigationProfileId, item] as const))
  return Object.freeze({
    get(id: string) {
      const value = map.get(id)
      if (!value) throw new BrowserProviderError('unknown_navigation')
      return value
    },
    list() { return [...values] },
    toJSON() { return [...values] },
  })
}

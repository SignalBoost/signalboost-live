import { BrowserProviderError } from './provider-errors.ts'
import { BPAL_SCHEMA_VERSION } from './provider-version.ts'

export type BrowserProviderEnvironment = 'sandbox' | 'preview' | 'production'
export interface BrowserProviderOrigin { originId:string; providerId:string; labelKey:string; exactOrigin:string; environments:readonly BrowserProviderEnvironment[]; readOnlyAllowed:boolean; browserOnDemandAllowed:boolean; autoFailoverAllowed:boolean; productionAllowed:boolean; schemaVersion:typeof BPAL_SCHEMA_VERSION }
export type OriginProfile = BrowserProviderOrigin
export type OriginId = string

export function assertBrowserProviderOrigin(origin: BrowserProviderOrigin): Readonly<BrowserProviderOrigin> {
  let parsed: URL
  try { parsed = new URL(origin.exactOrigin) } catch { throw new BrowserProviderError('invalid_origin') }
  if (parsed.protocol !== 'https:' || parsed.origin !== origin.exactOrigin || parsed.href.includes('@') || parsed.search || parsed.hash || parsed.hostname.includes('*')) throw new BrowserProviderError('invalid_origin')
  if (!origin.originId || !origin.providerId || !origin.labelKey || origin.schemaVersion !== BPAL_SCHEMA_VERSION) throw new BrowserProviderError('invalid_origin')
  return Object.freeze({ ...origin, environments:Object.freeze([...origin.environments].sort()) })
}

export function createOriginRegistry(items: readonly BrowserProviderOrigin[]) {
  const seen = new Set<string>()
  const values = items.map(assertBrowserProviderOrigin).sort((a,b)=>a.originId.localeCompare(b.originId))
  for (const item of values) { if (seen.has(item.originId)) throw new BrowserProviderError('duplicate_origin'); seen.add(item.originId) }
  const map = new Map(values.map(item => [item.originId, item] as const))
  return Object.freeze({ get(originId:string){ const value=map.get(originId); if(!value) throw new BrowserProviderError('unknown_origin'); return value }, list(){ return [...values] }, toJSON(){ return [...values] } })
}

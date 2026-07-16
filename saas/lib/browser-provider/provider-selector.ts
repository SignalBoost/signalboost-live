import { BrowserProviderError } from './provider-errors.ts'
import { BPAL_SCHEMA_VERSION } from './provider-version.ts'

export const browserProviderSelectorAreas = ['projects','deployments','deploymentDetails','logs','domains','settings','environmentVariables','authentication','dashboard'] as const
export type BrowserProviderSelectorArea = (typeof browserProviderSelectorAreas)[number]
export type BrowserProviderSelectorTargetType = 'button'|'link'|'status'|'metadata'|'table'|'form'|'field'|'panel'|'text'
export type BrowserProviderStructuredSelector =
  | { strategy:'role'; role:string; name:string }
  | { strategy:'label'; label:string }
  | { strategy:'testId'; testId:string }
  | { strategy:'exactText'; text:string }
  | { strategy:'css'; css:string }
export interface BrowserProviderSelector { selectorId:string; providerId:string; area:BrowserProviderSelectorArea; targetType:BrowserProviderSelectorTargetType; selector:BrowserProviderStructuredSelector; readOnly:boolean; supportedCapabilities:readonly string[]; adapterVersion:string; schemaVersion:typeof BPAL_SCHEMA_VERSION }
export type ProviderSelector = BrowserProviderSelector

export function assertBrowserProviderSelector(selector: BrowserProviderSelector): Readonly<BrowserProviderSelector> {
  if (!selector.selectorId || !selector.providerId || !browserProviderSelectorAreas.includes(selector.area) || selector.schemaVersion !== BPAL_SCHEMA_VERSION || !selector.readOnly) throw new BrowserProviderError('invalid_selector')
  const s = selector.selector
  if (s.strategy === 'css' && (/\*|xpath|javascript:|\/\//i.test(s.css) || !s.css.trim())) throw new BrowserProviderError('invalid_selector')
  if (s.strategy !== 'css' && !Object.values(s).every(v => typeof v !== 'string' || v.trim().length > 0)) throw new BrowserProviderError('invalid_selector')
  return Object.freeze({ ...selector, selector:Object.freeze({ ...selector.selector }), supportedCapabilities:Object.freeze([...selector.supportedCapabilities].sort()) })
}

export function createSelectorRegistry(items: readonly BrowserProviderSelector[]) {
  const seen = new Set<string>(); const values = items.map(assertBrowserProviderSelector).sort((a,b)=>a.selectorId.localeCompare(b.selectorId))
  for (const item of values) { if (seen.has(item.selectorId)) throw new BrowserProviderError('duplicate_selector'); seen.add(item.selectorId) }
  const map = new Map(values.map(item => [item.selectorId, item] as const))
  return Object.freeze({ get(id:string){ const value=map.get(id); if(!value) throw new BrowserProviderError('unknown_selector'); return value }, list(){ return [...values] }, toJSON(){ return [...values] } })
}

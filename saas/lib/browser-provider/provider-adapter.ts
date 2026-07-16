import type { BrowserProviderCapability } from './provider-capability.ts'
import type { BrowserProviderEvidenceProfile } from './provider-evidence.ts'
import type { BrowserProviderHealth } from './provider-health.ts'
import { assertBrowserProviderHealth } from './provider-health.ts'
import type { BrowserProviderNavigationProfile } from './provider-navigation.ts'
import type { BrowserProviderOrigin } from './provider-origin.ts'
import type { BrowserProviderSelector } from './provider-selector.ts'
import type { BrowserProviderVerificationProfile } from './provider-verification.ts'
import type { BrowserProviderVersion } from './provider-version.ts'
import { assertBrowserProviderVersion } from './provider-version.ts'
export type BrowserProviderExecutionMode='read_only'
export interface BrowserProviderAdapter { providerId:string; displayNameKey:string; adapterVersion:string; schemaVersion:'1.0.0'; health:BrowserProviderHealth; capabilities:readonly BrowserProviderCapability[]; origins:readonly BrowserProviderOrigin[]; navigationProfiles:readonly BrowserProviderNavigationProfile[]; selectors:readonly BrowserProviderSelector[]; verificationProfiles:readonly BrowserProviderVerificationProfile[]; evidenceProfiles:readonly BrowserProviderEvidenceProfile[]; supportsExecutionMode(mode:BrowserProviderExecutionMode):boolean; supportsReadOnlyInspection():boolean; supportsAutoFailover():boolean; supportsBrowserOnDemand():boolean; supportsSandbox():boolean; supportsProduction():boolean; getVersion():BrowserProviderVersion }
export function freezeProviderAdapter(adapter:BrowserProviderAdapter):BrowserProviderAdapter{return Object.freeze({...adapter,health:assertBrowserProviderHealth(adapter.health),capabilities:Object.freeze([...adapter.capabilities].sort((a,b)=>a.capabilityId.localeCompare(b.capabilityId))),origins:Object.freeze([...adapter.origins].sort((a,b)=>a.originId.localeCompare(b.originId))),navigationProfiles:Object.freeze([...adapter.navigationProfiles].sort((a,b)=>a.navigationProfileId.localeCompare(b.navigationProfileId))),selectors:Object.freeze([...adapter.selectors].sort((a,b)=>a.selectorId.localeCompare(b.selectorId))),verificationProfiles:Object.freeze([...adapter.verificationProfiles].sort((a,b)=>a.verificationProfileId.localeCompare(b.verificationProfileId))),evidenceProfiles:Object.freeze([...adapter.evidenceProfiles].sort((a,b)=>a.evidenceProfileId.localeCompare(b.evidenceProfileId))),getVersion:()=>assertBrowserProviderVersion(adapter.getVersion())})}

import type { BrowserProviderAdapter } from '../browser-provider/provider-adapter.ts'
import { UNIVERSAL_PROVIDER_SCHEMA_VERSION, type UniversalProviderMetadata, type UniversalProviderSdk } from './types.ts'

export interface BrowserProviderDeploymentMetadata { supportedAuthentication?: UniversalProviderMetadata['supportedAuthentication']; supportedRegions?: readonly string[]; timeouts?: { connectMs:number; readMs:number; totalMs:number }; rateLimit?: { windowSeconds:number; maxRequests:number; scope:'provider'|'tenant'|'capability'|'credential' }; retryPolicy?: { maxAttempts:number; backoff:'none'|'fixed'|'exponential'; baseDelayMs:number; maxDelayMs:number }; webhook?: UniversalProviderMetadata['webhook']; scheduler?: UniversalProviderMetadata['scheduler']; configurationSchema?: UniversalProviderMetadata['configurationSchema'] }
export function createUniversalMetadataFromBrowserProvider(adapter:BrowserProviderAdapter, deployment:BrowserProviderDeploymentMetadata={}):UniversalProviderMetadata{
  const supportsBrowser=adapter.capabilities.some(c=>c.supportsBrowser)
  const supportsApi=adapter.capabilities.some(c=>c.supportsApi)
  return {
    providerId:adapter.providerId,
    displayNameKey:adapter.displayNameKey,
    descriptionKey:`universalProvider.${adapter.providerId}.description`,
    version:{providerVersion:adapter.adapterVersion,sdkVersion:adapter.adapterVersion,capabilityCatalogVersion:adapter.getVersion().capabilityVersion,schemaVersion:UNIVERSAL_PROVIDER_SCHEMA_VERSION,compatibleSchemaVersions:[UNIVERSAL_PROVIDER_SCHEMA_VERSION]},
    health:{lifecycle: adapter.health.state==='unknown'?'registered':adapter.health.state, checkedAt:adapter.health.checkedAt, reasonCode:adapter.health.reasonCode, detailsKey:adapter.health.detailsKey},
    capabilities:adapter.capabilities.map(capability=>({capabilityId:capability.capabilityId,displayNameKey:capability.displayNameKey,descriptionKey:capability.descriptionKey,version:capability.capabilityVersion,maturity:capability.maturity,riskClass:capability.riskClass,channels:[...(capability.supportsApi?['api' as const]:[]),...(capability.supportsBrowser?['browser' as const]:[]),...(capability.requiresHumanApproval?['manual' as const]:[])],environments:['sandbox','preview'],authentication:['api_key'],requiresApproval:capability.requiresHumanApproval,readOnly:capability.readOnly,rateLimit:deployment.rateLimit||{windowSeconds:60,maxRequests:60,scope:'provider'},timeout:deployment.timeouts||{connectMs:2000,readMs:5000,totalMs:10000},retryPolicy:deployment.retryPolicy||{maxAttempts:2,backoff:'exponential',baseDelayMs:250,maxDelayMs:2000},webhook:{supported:false,eventTypes:[],signatureSchemes:[],replayProtection:false},scheduler:{supported:false,jitterSupported:false},evidenceProviderIds:[capability.evidenceProfileId],verificationProviderIds:[capability.verificationProfileId]})),
    supportedChannels:[...(supportsApi?['api' as const]:[]),...(supportsBrowser?['browser' as const]:[]),'manual'],
    supportedAuthentication:deployment.supportedAuthentication||['api_key'], supportedEnvironments:['sandbox','preview'], supportedRegions:deployment.supportedRegions||['global'],
    configurationSchema:deployment.configurationSchema||{schemaId:`${adapter.providerId}.browser-provider.config`,version:adapter.adapterVersion,fields:[]},
    webhook:deployment.webhook||{supported:false,eventTypes:[],signatureSchemes:[],replayProtection:false}, scheduler:deployment.scheduler||{supported:false,jitterSupported:false},
    operator:{ownerTeamKey:'universalProvider.operator.ownerTeam',documentationKey:'universalProvider.operator.documentation'},
  }
}
export function createUniversalSdkFromBrowserProvider(adapter:BrowserProviderAdapter):UniversalProviderSdk{ const metadata=createUniversalMetadataFromBrowserProvider(adapter); return {metadata,listCapabilities:()=>metadata.capabilities,getCapability:id=>metadata.capabilities.find(c=>c.capabilityId===id),getHealth:()=>metadata.health,getVersion:()=>metadata.version} }

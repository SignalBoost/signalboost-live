export const UNIVERSAL_PROVIDER_SCHEMA_VERSION = 'universal-provider-v1' as const

export const providerLifecycleStages = ['registered','configured','validated','healthy','degraded','outage','maintenance','disabled','retired','suspended','failed_validation'] as const
export type ProviderLifecycleStage = typeof providerLifecycleStages[number]
export const providerExecutionChannels = ['api','browser','manual','webhook','scheduler'] as const
export type ProviderExecutionChannel = typeof providerExecutionChannels[number]
export const providerAuthenticationKinds = ['none','api_key','oauth2','jwt','basic','signature','service_role','user_byok'] as const
export type ProviderAuthenticationKind = typeof providerAuthenticationKinds[number]
export const capabilityMaturityLevels = ['experimental','sandbox_verified','human_approved','auto_failover_ready','suspended'] as const
export type UniversalCapabilityMaturity = typeof capabilityMaturityLevels[number]
export const providerRiskClasses = ['read_only','low_risk_reversible','medium','high','forbidden'] as const
export type UniversalProviderRiskClass = typeof providerRiskClasses[number]
export type ProviderEnvironment = 'local'|'sandbox'|'preview'|'production'

export interface UniversalProviderVersion { providerVersion:string; sdkVersion:string; capabilityCatalogVersion:string; schemaVersion:typeof UNIVERSAL_PROVIDER_SCHEMA_VERSION; compatibleSchemaVersions:readonly string[] }
export interface UniversalProviderHealth { lifecycle:ProviderLifecycleStage; checkedAt:string; reasonCode?:string; detailsKey?:string }
export interface ProviderRateLimitMetadata { windowSeconds:number; maxRequests:number; burst?:number; scope:'provider'|'tenant'|'capability'|'credential' }
export interface ProviderRetryPolicyMetadata { maxAttempts:number; backoff:'none'|'fixed'|'exponential'; baseDelayMs:number; maxDelayMs:number }
export interface ProviderTimeoutMetadata { connectMs:number; readMs:number; totalMs:number }
export interface ProviderWebhookMetadata { supported:boolean; eventTypes:readonly string[]; signatureSchemes:readonly string[]; replayProtection:boolean; localizationKey?:string }
export interface ProviderSchedulerMetadata { supported:boolean; minimumIntervalSeconds?:number; jitterSupported:boolean; localizationKey?:string }
export interface ProviderConfigurationField { key:string; type:'string'|'number'|'boolean'|'url'|'secret_ref'|'enum'; required:boolean; labelKey:string; options?:readonly string[]; validationPattern?:string }
export interface ProviderConfigurationSchema { schemaId:string; version:string; fields:readonly ProviderConfigurationField[] }
export interface UniversalProviderCapability { capabilityId:string; displayNameKey:string; descriptionKey?:string; version:string; maturity:UniversalCapabilityMaturity; riskClass:UniversalProviderRiskClass; channels:readonly ProviderExecutionChannel[]; environments:readonly ProviderEnvironment[]; authentication:readonly ProviderAuthenticationKind[]; requiresApproval:boolean; readOnly:boolean; rateLimit?:ProviderRateLimitMetadata; timeout?:ProviderTimeoutMetadata; retryPolicy?:ProviderRetryPolicyMetadata; webhook?:ProviderWebhookMetadata; scheduler?:ProviderSchedulerMetadata; evidenceProviderIds:readonly string[]; verificationProviderIds:readonly string[] }
export interface UniversalProviderMetadata { providerId:string; displayNameKey:string; descriptionKey?:string; version:UniversalProviderVersion; health:UniversalProviderHealth; capabilities:readonly UniversalProviderCapability[]; supportedChannels:readonly ProviderExecutionChannel[]; supportedAuthentication:readonly ProviderAuthenticationKind[]; supportedEnvironments:readonly ProviderEnvironment[]; supportedRegions:readonly string[]; configurationSchema:ProviderConfigurationSchema; webhook:ProviderWebhookMetadata; scheduler:ProviderSchedulerMetadata; operator:Readonly<{ownerTeamKey:string; documentationKey:string; supportKey?:string}> }
export interface UniversalProviderSdk { metadata:UniversalProviderMetadata; listCapabilities():readonly UniversalProviderCapability[]; getCapability(capabilityId:string):UniversalProviderCapability|undefined; getHealth():UniversalProviderHealth; getVersion():UniversalProviderVersion }

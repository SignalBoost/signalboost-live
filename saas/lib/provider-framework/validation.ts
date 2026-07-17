import { providerAuthenticationKinds, providerExecutionChannels, providerLifecycleStages, providerRiskClasses, capabilityMaturityLevels, UNIVERSAL_PROVIDER_SCHEMA_VERSION, type ProviderConfigurationSchema, type UniversalProviderCapability, type UniversalProviderMetadata } from './types.ts'

export class UniversalProviderError extends Error { code:string; constructor(code:string){ super(code); this.code=code; this.name='UniversalProviderError' } }
const unique = (values:readonly string[]) => new Set(values).size === values.length
const iso = (value:string) => { try { return new Date(value).toISOString() === value } catch { return false } }
function assertKeys(keys: readonly (string|undefined)[]) { for (const key of keys) if (key !== undefined && (!key.trim() || !key.includes('.'))) throw new UniversalProviderError('invalid_localization_key') }
function assertConfig(schema:ProviderConfigurationSchema){ if(!schema.schemaId||!schema.version||!unique(schema.fields.map(f=>f.key))) throw new UniversalProviderError('invalid_configuration_schema'); for(const f of schema.fields){ assertKeys([f.labelKey]); if(f.type==='enum'&&(!f.options?.length||!unique(f.options))) throw new UniversalProviderError('invalid_configuration_schema'); if(f.type==='url'&&f.validationPattern){ new RegExp(f.validationPattern) } } }
function assertCapability(capability:UniversalProviderCapability, provider:UniversalProviderMetadata):UniversalProviderCapability{
  assertKeys([capability.displayNameKey, capability.descriptionKey])
  if(!capability.capabilityId||!capability.version||!capabilityMaturityLevels.includes(capability.maturity)||!providerRiskClasses.includes(capability.riskClass)) throw new UniversalProviderError('invalid_capability')
  if(!unique(capability.channels)||!capability.channels.every(c=>providerExecutionChannels.includes(c))||capability.channels.some(c=>!provider.supportedChannels.includes(c))) throw new UniversalProviderError('invalid_capability_channels')
  if(!unique(capability.environments)||capability.environments.some(e=>!provider.supportedEnvironments.includes(e))) throw new UniversalProviderError('invalid_capability_environment')
  if(!unique(capability.authentication)||!capability.authentication.every(a=>providerAuthenticationKinds.includes(a))||capability.authentication.some(a=>!provider.supportedAuthentication.includes(a))) throw new UniversalProviderError('invalid_capability_authentication')
  if(capability.readOnly !== (capability.riskClass==='read_only')) throw new UniversalProviderError('invalid_capability_risk')
  if(capability.webhook?.supported && !provider.webhook.supported) throw new UniversalProviderError('invalid_webhook_metadata')
  if(capability.scheduler?.supported && !provider.scheduler.supported) throw new UniversalProviderError('invalid_scheduler_metadata')
  if(capability.rateLimit && (capability.rateLimit.windowSeconds<=0||capability.rateLimit.maxRequests<=0)) throw new UniversalProviderError('invalid_rate_limit')
  return Object.freeze({...capability, channels:Object.freeze([...capability.channels].sort()), environments:Object.freeze([...capability.environments].sort()), authentication:Object.freeze([...capability.authentication].sort()), evidenceProviderIds:Object.freeze([...capability.evidenceProviderIds].sort()), verificationProviderIds:Object.freeze([...capability.verificationProviderIds].sort())})
}
export function freezeUniversalProviderMetadata(raw:UniversalProviderMetadata):UniversalProviderMetadata{
  assertKeys([raw.displayNameKey, raw.descriptionKey, raw.operator.ownerTeamKey, raw.operator.documentationKey, raw.operator.supportKey])
  if(!raw.providerId||raw.version.schemaVersion!==UNIVERSAL_PROVIDER_SCHEMA_VERSION||!raw.version.compatibleSchemaVersions.includes(UNIVERSAL_PROVIDER_SCHEMA_VERSION)||!providerLifecycleStages.includes(raw.health.lifecycle)||!iso(raw.health.checkedAt)) throw new UniversalProviderError('invalid_provider_metadata')
  if(!unique(raw.supportedChannels)||!raw.supportedChannels.every(c=>providerExecutionChannels.includes(c))) throw new UniversalProviderError('invalid_provider_channels')
  if(!unique(raw.supportedAuthentication)||!raw.supportedAuthentication.every(a=>providerAuthenticationKinds.includes(a))) throw new UniversalProviderError('invalid_provider_authentication')
  assertConfig(raw.configurationSchema)
  const base={...raw, supportedChannels:Object.freeze([...raw.supportedChannels].sort()), supportedAuthentication:Object.freeze([...raw.supportedAuthentication].sort()), supportedEnvironments:Object.freeze([...raw.supportedEnvironments].sort()), supportedRegions:Object.freeze([...raw.supportedRegions].sort())}
  const caps=raw.capabilities.map(c=>assertCapability(c, base)).sort((a,b)=>a.capabilityId.localeCompare(b.capabilityId))
  if(caps.length===0||!unique(caps.map(c=>c.capabilityId))) throw new UniversalProviderError('duplicate_capability')
  return Object.freeze({
    ...base,
    health: Object.freeze({ ...raw.health }),
    version: Object.freeze({ ...raw.version, compatibleSchemaVersions: Object.freeze([...raw.version.compatibleSchemaVersions]) }),
    configurationSchema: Object.freeze({
      ...raw.configurationSchema,
      fields: Object.freeze(raw.configurationSchema.fields.map(f => Object.freeze({ ...f, options: f.options ? Object.freeze([...f.options]) : undefined }))),
    }),
    webhook: Object.freeze({ ...raw.webhook, eventTypes: Object.freeze([...raw.webhook.eventTypes]), signatureSchemes: Object.freeze([...raw.webhook.signatureSchemes]) }),
    scheduler: Object.freeze({ ...raw.scheduler }),
    operator: Object.freeze({ ...raw.operator }),
    capabilities: Object.freeze(caps),
  })
}

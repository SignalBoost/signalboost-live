import type { UniversalProviderCapability, UniversalProviderMetadata, UniversalProviderSdk } from './types.ts'
import { UniversalProviderError, freezeUniversalProviderMetadata } from './validation.ts'

export class UniversalProviderRegistry {
  private readonly providers = new Map<string, UniversalProviderSdk>()
  register(sdk:UniversalProviderSdk){ if(this.providers.has(sdk.metadata.providerId)) throw new UniversalProviderError('duplicate_provider'); const metadata=freezeUniversalProviderMetadata(sdk.metadata); const byCapability=new Map(metadata.capabilities.map(c=>[c.capabilityId,c] as const)); const frozen:UniversalProviderSdk=Object.freeze({metadata,listCapabilities:()=>[...metadata.capabilities],getCapability:(id:string)=>byCapability.get(id),getHealth:()=>metadata.health,getVersion:()=>metadata.version}); this.providers.set(metadata.providerId,frozen); return frozen }
  get(providerId:string){ const sdk=this.providers.get(providerId); if(!sdk) throw new UniversalProviderError('unknown_provider'); if(['disabled','retired','suspended','failed_validation'].includes(sdk.metadata.health.lifecycle)) throw new UniversalProviderError('provider_unavailable'); return sdk }
  list(){ return [...this.providers.values()].sort((a,b)=>a.metadata.providerId.localeCompare(b.metadata.providerId)) }
  discoverCapabilities(providerId:string){ return this.get(providerId).listCapabilities() }
  findCapability(providerId:string, capabilityId:string):UniversalProviderCapability{ const capability=this.get(providerId).getCapability(capabilityId); if(!capability) throw new UniversalProviderError('unknown_capability'); if(capability.maturity==='suspended') throw new UniversalProviderError('capability_suspended'); return capability }
  toMetadata(){ return this.list().map(s=>s.metadata) }
}

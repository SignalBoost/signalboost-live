export type ProviderWorkerHealth = 'healthy'|'degraded'|'unavailable'
export interface ProviderWorker { providerKind:string; supportedWorkItemTypes:string[]; supportedCapabilities:string[]; adapterVersion:string; health:ProviderWorkerHealth; maximumConcurrentWork:number; executionDependencies:string[] }

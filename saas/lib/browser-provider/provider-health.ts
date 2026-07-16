export const providerHealthStates=['healthy','degraded','outage','suspended','unknown'] as const
export type ProviderHealthState=typeof providerHealthStates[number]
export interface ProviderHealth { state: ProviderHealthState; checkedAt: string; details?: string }
export function assertProviderHealth(v:ProviderHealth):ProviderHealth { if(!providerHealthStates.includes(v.state)||new Date(v.checkedAt).toISOString()!==v.checkedAt) throw new Error('invalid_provider_health'); return Object.freeze({...v}) }

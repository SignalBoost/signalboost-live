export interface SteelAdapterConfiguration { configuration:Readonly<Record<string,unknown>> }
export const steelAdapterStatus=Object.freeze({status:'hostPackageRequired' as const,notImplemented:true,requiredPorts:[] as readonly string[]})
export interface SteelAdapterFactory { create(configuration:SteelAdapterConfiguration):never }
export const validateSteelAdapterConfiguration=(value:unknown):value is SteelAdapterConfiguration=>!!value&&typeof value==='object'

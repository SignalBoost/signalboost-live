export interface HyperbrowserAdapterConfiguration { configuration:Readonly<Record<string,unknown>> }
export const hyperbrowserAdapterStatus=Object.freeze({status:'hostPackageRequired' as const,notImplemented:true,requiredPorts:[] as readonly string[]})
export interface HyperbrowserAdapterFactory { create(configuration:HyperbrowserAdapterConfiguration):never }
export const validateHyperbrowserAdapterConfiguration=(value:unknown):value is HyperbrowserAdapterConfiguration=>!!value&&typeof value==='object'

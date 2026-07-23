export interface NotteAdapterConfiguration { configuration:Readonly<Record<string,unknown>> }
export const notteAdapterStatus=Object.freeze({status:'hostPackageRequired' as const,notImplemented:true,requiredPorts:[] as readonly string[]})
export interface NotteAdapterFactory { create(configuration:NotteAdapterConfiguration):never }
export const validateNotteAdapterConfiguration=(value:unknown):value is NotteAdapterConfiguration=>!!value&&typeof value==='object'

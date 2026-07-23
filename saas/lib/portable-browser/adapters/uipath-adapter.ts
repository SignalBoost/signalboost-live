export interface UipathAdapterConfiguration { configuration:Readonly<Record<string,unknown>> }
export const uipathAdapterStatus=Object.freeze({status:'hostPackageRequired' as const,notImplemented:true,requiredPorts:[] as readonly string[]})
export interface UipathAdapterFactory { create(configuration:UipathAdapterConfiguration):never }
export const validateUipathAdapterConfiguration=(value:unknown):value is UipathAdapterConfiguration=>!!value&&typeof value==='object'

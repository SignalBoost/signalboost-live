export interface CustomAdapterConfiguration { configuration:Readonly<Record<string,unknown>> }
export const customAdapterStatus=Object.freeze({status:'hostPackageRequired' as const,notImplemented:true,requiredPorts:[] as readonly string[]})
export interface CustomAdapterFactory { create(configuration:CustomAdapterConfiguration):never }
export const validateCustomAdapterConfiguration=(value:unknown):value is CustomAdapterConfiguration=>!!value&&typeof value==='object'

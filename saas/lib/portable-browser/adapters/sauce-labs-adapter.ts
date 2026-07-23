export interface SauceLabsAdapterConfiguration { configuration:Readonly<Record<string,unknown>> }
export const sauce_labsAdapterStatus=Object.freeze({status:'hostPackageRequired' as const,notImplemented:true,requiredPorts:[] as readonly string[]})
export interface SauceLabsAdapterFactory { create(configuration:SauceLabsAdapterConfiguration):never }
export const validateSauceLabsAdapterConfiguration=(value:unknown):value is SauceLabsAdapterConfiguration=>!!value&&typeof value==='object'

export interface BrowserbaseAdapterConfiguration { configuration:Readonly<Record<string,unknown>> }
export const browserbaseAdapterStatus=Object.freeze({status:'hostPackageRequired' as const,notImplemented:true,requiredPorts:[] as readonly string[]})
export interface BrowserbaseAdapterFactory { create(configuration:BrowserbaseAdapterConfiguration):never }
export const validateBrowserbaseAdapterConfiguration=(value:unknown):value is BrowserbaseAdapterConfiguration=>!!value&&typeof value==='object'

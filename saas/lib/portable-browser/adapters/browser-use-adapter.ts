export interface BrowserUseAdapterConfiguration { configuration:Readonly<Record<string,unknown>> }
export const browser_useAdapterStatus=Object.freeze({status:'hostPackageRequired' as const,notImplemented:true,requiredPorts:[] as readonly string[]})
export interface BrowserUseAdapterFactory { create(configuration:BrowserUseAdapterConfiguration):never }
export const validateBrowserUseAdapterConfiguration=(value:unknown):value is BrowserUseAdapterConfiguration=>!!value&&typeof value==='object'

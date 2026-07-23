export interface BrowserstackAdapterConfiguration { configuration:Readonly<Record<string,unknown>> }
export const browserstackAdapterStatus=Object.freeze({status:'hostPackageRequired' as const,notImplemented:true,requiredPorts:[] as readonly string[]})
export interface BrowserstackAdapterFactory { create(configuration:BrowserstackAdapterConfiguration):never }
export const validateBrowserstackAdapterConfiguration=(value:unknown):value is BrowserstackAdapterConfiguration=>!!value&&typeof value==='object'

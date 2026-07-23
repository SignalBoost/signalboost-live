export interface FirecrawlAdapterConfiguration { configuration:Readonly<Record<string,unknown>> }
export const firecrawlAdapterStatus=Object.freeze({status:'hostPackageRequired' as const,notImplemented:true,requiredPorts:[] as readonly string[]})
export interface FirecrawlAdapterFactory { create(configuration:FirecrawlAdapterConfiguration):never }
export const validateFirecrawlAdapterConfiguration=(value:unknown):value is FirecrawlAdapterConfiguration=>!!value&&typeof value==='object'

export interface AzurePlaywrightAdapterConfiguration { configuration:Readonly<Record<string,unknown>> }
export const azure_playwrightAdapterStatus=Object.freeze({status:'hostPackageRequired' as const,notImplemented:true,requiredPorts:[] as readonly string[]})
export interface AzurePlaywrightAdapterFactory { create(configuration:AzurePlaywrightAdapterConfiguration):never }
export const validateAzurePlaywrightAdapterConfiguration=(value:unknown):value is AzurePlaywrightAdapterConfiguration=>!!value&&typeof value==='object'

export interface LambdatestAdapterConfiguration { configuration:Readonly<Record<string,unknown>> }
export const lambdatestAdapterStatus=Object.freeze({status:'hostPackageRequired' as const,notImplemented:true,requiredPorts:[] as readonly string[]})
export interface LambdatestAdapterFactory { create(configuration:LambdatestAdapterConfiguration):never }
export const validateLambdatestAdapterConfiguration=(value:unknown):value is LambdatestAdapterConfiguration=>!!value&&typeof value==='object'

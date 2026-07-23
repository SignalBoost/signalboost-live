export interface PowerAutomateAdapterConfiguration { configuration:Readonly<Record<string,unknown>> }
export const power_automateAdapterStatus=Object.freeze({status:'hostPackageRequired' as const,notImplemented:true,requiredPorts:[] as readonly string[]})
export interface PowerAutomateAdapterFactory { create(configuration:PowerAutomateAdapterConfiguration):never }
export const validatePowerAutomateAdapterConfiguration=(value:unknown):value is PowerAutomateAdapterConfiguration=>!!value&&typeof value==='object'

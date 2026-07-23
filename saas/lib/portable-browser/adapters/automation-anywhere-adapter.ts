export interface AutomationAnywhereAdapterConfiguration { configuration:Readonly<Record<string,unknown>> }
export const automation_anywhereAdapterStatus=Object.freeze({status:'hostPackageRequired' as const,notImplemented:true,requiredPorts:[] as readonly string[]})
export interface AutomationAnywhereAdapterFactory { create(configuration:AutomationAnywhereAdapterConfiguration):never }
export const validateAutomationAnywhereAdapterConfiguration=(value:unknown):value is AutomationAnywhereAdapterConfiguration=>!!value&&typeof value==='object'

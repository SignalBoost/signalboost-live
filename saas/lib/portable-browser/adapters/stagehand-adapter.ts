export interface StagehandAdapterConfiguration { configuration:Readonly<Record<string,unknown>> }
export const stagehandAdapterStatus=Object.freeze({status:'hostPackageRequired' as const,notImplemented:true,requiredPorts:[] as readonly string[]})
export interface StagehandAdapterFactory { create(configuration:StagehandAdapterConfiguration):never }
export const validateStagehandAdapterConfiguration=(value:unknown):value is StagehandAdapterConfiguration=>!!value&&typeof value==='object'

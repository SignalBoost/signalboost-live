export interface AwsAgentcoreBrowserAdapterConfiguration { configuration:Readonly<Record<string,unknown>> }
export const aws_agentcore_browserAdapterStatus=Object.freeze({status:'hostPackageRequired' as const,notImplemented:true,requiredPorts:[] as readonly string[]})
export interface AwsAgentcoreBrowserAdapterFactory { create(configuration:AwsAgentcoreBrowserAdapterConfiguration):never }
export const validateAwsAgentcoreBrowserAdapterConfiguration=(value:unknown):value is AwsAgentcoreBrowserAdapterConfiguration=>!!value&&typeof value==='object'

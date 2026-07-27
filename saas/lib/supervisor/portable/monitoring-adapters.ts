import type { IncidentSourceDefinition } from './incident-source.ts'
import { createDatadogDefinition } from './monitoring-adapters/datadog.ts'
import { createPagerDutyDefinition } from './monitoring-adapters/pagerduty.ts'
import { createAwsDefinition } from './monitoring-adapters/aws-cloudwatch-eventbridge.ts'
import { createAlertmanagerDefinition } from './monitoring-adapters/prometheus-alertmanager.ts'
import { createSplunkDefinition } from './monitoring-adapters/splunk.ts'
import { createAzureMonitorDefinition } from './monitoring-adapters/azure-monitor.ts'
import { createGrafanaDefinition } from './monitoring-adapters/grafana-alerting.ts'
import { createGoogleCloudDefinition } from './monitoring-adapters/google-cloud-operations.ts'

export const monitoringAdapterIds = ['datadog','pagerduty','aws-cloudwatch-eventbridge','prometheus-alertmanager','splunk','azure-monitor','grafana-alerting','google-cloud-operations'] as const
export type MonitoringAdapterId = (typeof monitoringAdapterIds)[number]
export type MonitoringAdapterMaturity = 'staged' | 'certified' | 'deprecated'
export interface MonitoringAdapterDescriptor { readonly adapterId:MonitoringAdapterId; readonly displayName:string; readonly maturity:MonitoringAdapterMaturity; readonly transport:'webhook'; readonly authentication:readonly string[]; readonly schemaVersion:'monitoring-adapter-v1' }
export interface MonitoringAdapterContext { readonly sourceId:string; readonly defaultEnvironment?:string }

const rows:Record<MonitoringAdapterId,MonitoringAdapterDescriptor>={
  datadog:d('datadog','Datadog',['shared-secret','source-ip-policy']), pagerduty:d('pagerduty','PagerDuty',['webhook-signature']),
  'aws-cloudwatch-eventbridge':d('aws-cloudwatch-eventbridge','AWS CloudWatch / EventBridge',['aws-sns-signature','api-gateway-authorizer']),
  'prometheus-alertmanager':d('prometheus-alertmanager','Prometheus Alertmanager',['shared-secret','reverse-proxy-auth']), splunk:d('splunk','Splunk',['hec-token','shared-secret']),
  'azure-monitor':d('azure-monitor','Azure Monitor',['entra-id','shared-secret']), 'grafana-alerting':d('grafana-alerting','Grafana Alerting',['basic-auth','shared-secret']),
  'google-cloud-operations':d('google-cloud-operations','Google Cloud Operations',['oidc','shared-secret']),
}
function d(adapterId:MonitoringAdapterId,displayName:string,authentication:readonly string[]):MonitoringAdapterDescriptor{return Object.freeze({adapterId,displayName,maturity:'staged',transport:'webhook',authentication:Object.freeze([...authentication]),schemaVersion:'monitoring-adapter-v1'})}
export const stagedMonitoringAdapters=Object.freeze(monitoringAdapterIds.map(id=>rows[id]))

export function createMonitoringIncidentSourceDefinition(adapterId:MonitoringAdapterId,context:MonitoringAdapterContext):IncidentSourceDefinition{
  if(!context.sourceId.trim())throw new Error('monitoring_adapter_source_id_required')
  switch(adapterId){
    case'datadog':return createDatadogDefinition(context.sourceId)
    case'pagerduty':return createPagerDutyDefinition(context.sourceId)
    case'aws-cloudwatch-eventbridge':return createAwsDefinition(context.sourceId)
    case'prometheus-alertmanager':return createAlertmanagerDefinition(context.sourceId)
    case'splunk':return createSplunkDefinition(context.sourceId)
    case'azure-monitor':return createAzureMonitorDefinition(context.sourceId)
    case'grafana-alerting':return createGrafanaDefinition(context.sourceId)
    case'google-cloud-operations':return createGoogleCloudDefinition(context.sourceId)
  }
}

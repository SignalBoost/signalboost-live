// saas/lib/observability/agentTrace.ts
import { randomUUID } from 'node:crypto'

export const AGENT_TRACE_SCHEMA = 'itmounts-agent-trace-v1' as const

export type AgentTraceKind =
  | 'request' | 'agent' | 'model' | 'tool' | 'mcp' | 'authorization'
  | 'action' | 'evaluation' | 'remediation' | 'outcome'

export type AgentTraceStatus = 'started' | 'succeeded' | 'failed' | 'blocked' | 'observed'

export interface AgentTraceEvent {
  schemaVersion: typeof AGENT_TRACE_SCHEMA
  eventId: string
  traceId: string
  parentSpanId?: string
  spanId: string
  occurredAt: string
  kind: AgentTraceKind
  name: string
  status: AgentTraceStatus
  actor?: string
  model?: string
  provider?: string
  capability?: string
  authorityRef?: string
  durationMs?: number
  costUsd?: number
  inputTokens?: number
  outputTokens?: number
  errorCode?: string
  attributes?: Readonly<Record<string, string | number | boolean | null>>
}

/** Metadata-only trace contract. Never put prompts, responses, secrets, credentials or raw tool args here. */
export function createAgentTraceId(prefix='trace'){return `${prefix}:${randomUUID()}`}
export function createAgentSpanId(){return randomUUID()}

function finite(value:unknown){return typeof value==='number'&&Number.isFinite(value)&&value>=0?value:undefined}
function clean(value:unknown,max=160){const text=String(value??'').trim();return text?text.slice(0,max):undefined}

export function agentTraceEvent(input:Omit<AgentTraceEvent,'schemaVersion'|'eventId'|'occurredAt'|'spanId'> & {eventId?:string;occurredAt?:string;spanId?:string}):AgentTraceEvent{
  const traceId=clean(input.traceId,240);const name=clean(input.name,240)
  if(!traceId)throw new Error('agent_trace_id_required')
  if(!name)throw new Error('agent_trace_name_required')
  return Object.freeze({
    schemaVersion:AGENT_TRACE_SCHEMA,
    eventId:clean(input.eventId,240)||randomUUID(),
    traceId,
    spanId:clean(input.spanId,240)||createAgentSpanId(),
    occurredAt:input.occurredAt||new Date().toISOString(),
    kind:input.kind,
    name,
    status:input.status,
    ...(clean(input.parentSpanId,240)?{parentSpanId:clean(input.parentSpanId,240)}:{}),
    ...(clean(input.actor,240)?{actor:clean(input.actor,240)}:{}),
    ...(clean(input.model,240)?{model:clean(input.model,240)}:{}),
    ...(clean(input.provider,120)?{provider:clean(input.provider,120)}:{}),
    ...(clean(input.capability,240)?{capability:clean(input.capability,240)}:{}),
    ...(clean(input.authorityRef,240)?{authorityRef:clean(input.authorityRef,240)}:{}),
    ...(finite(input.durationMs)!==undefined?{durationMs:finite(input.durationMs)}:{}),
    ...(finite(input.costUsd)!==undefined?{costUsd:finite(input.costUsd)}:{}),
    ...(finite(input.inputTokens)!==undefined?{inputTokens:finite(input.inputTokens)}:{}),
    ...(finite(input.outputTokens)!==undefined?{outputTokens:finite(input.outputTokens)}:{}),
    ...(clean(input.errorCode,240)?{errorCode:clean(input.errorCode,240)}:{}),
    ...(input.attributes?{attributes:Object.freeze({...input.attributes})}:{}),
  })
}

export function emitAgentTrace(event:AgentTraceEvent):void{
  console.info('[itmounts-agent-trace]',JSON.stringify(event))
}

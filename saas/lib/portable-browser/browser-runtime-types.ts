export const portableBrowserPortKinds = ['session','agent_loop','credential','policy','approval','evidence','telemetry','web_data','human_control','scheduler'] as const
export type PortableBrowserPortKind = typeof portableBrowserPortKinds[number]
export type PortableBrowserEnvironment = 'local'|'sandbox'|'preview'|'production'
export interface PortableBrowserConfigurationField { key:string; type:'string'|'number'|'boolean'|'url'|'opaque_reference'|'enum'; required:boolean; description:string; options?:readonly string[] }
export interface PortableBrowserTenantScope { tenantId:string; approvedOrigins:readonly string[]; readOnly:boolean; cancellationRequested:boolean; killSwitchEnabled:boolean }
export interface PortableBrowserSessionRef { sessionId:string }
export interface PortableBrowserOpaqueRef { referenceId:string }
export type PortableBrowserAction = { kind:'click'|'type'|'select_option'|'read_field'|'wait_for_selector'|'navigate_back'|'scroll'|'request_approval'|'request_human_takeover'|'complete'; selector?:string; valueReference?:string; option?:string; distance?:number }
export interface PortableBrowserObservation { origin:string; title?:string; allowedSelectors:readonly string[]; text?:string }
export interface PortableBrowserDecision { action:PortableBrowserAction; rationale?:string }
export const allowedPortableBrowserActions: readonly PortableBrowserAction['kind'][] = Object.freeze(['click','type','select_option','read_field','wait_for_selector','navigate_back','scroll','request_approval','request_human_takeover','complete'])
export function validatePortableBrowserAction(action:PortableBrowserAction):PortableBrowserAction { if (!allowedPortableBrowserActions.includes(action.kind) || (action.kind==='type'&&!action.valueReference) || (action.kind==='scroll'&&(!Number.isFinite(action.distance)||Math.abs(action.distance!)>2000))) throw new Error('invalid_structured_browser_action'); return Object.freeze({...action}) }

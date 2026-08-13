// Planning-only contract for the Autonomous COS Supervisor. Execution authority belongs to the Gateway.
export const SUPERVISOR_THINKER_SYSTEM_PROMPT = `You are the Autonomous Chief of Staff (COS) Diagnostic Supervisor for SignalBoost.

You receive normalized incident payloads from approved infrastructure monitors, including provider responses, application evidence, environment metadata, health checks, and host governance metadata.

Your responsibilities are to identify the most likely root cause, explain it clearly, produce a precise sequential repair plan, choose the appropriate execution method, identify missing evidence, and provide separate verification and rollback plans.

You are a diagnostic and planning component. You do not grant execution authority, claim a repair completed, or bypass the SignalBoost governance workflow. The Agent Gateway independently classifies and authorizes every action.

Rules:
- Copy incident_id exactly from the input payload.
- Base the diagnosis only on supplied evidence. Never invent logs, values, credentials, provider responses, or outcomes.
- Prefer official APIs and deterministic tools over browser actions.
- Never include secrets or recommend bypassing authentication, 2FA, CAPTCHA, security controls, or organizational policy.
- Clearly identify destructive, financial, security-sensitive, irreversible, or otherwise consequential actions.
- Each repair step must be one bounded action.
- Keep diagnosis, execution, verification, and rollback separate.
- Include rollback whenever a proposed repair changes configuration, code, infrastructure, billing, authentication, or data.
- Approval defaults to required for production-changing actions.
- A host-created incident may explicitly provide registeredRecoveryAction plus recoveryPreauthorized=true. Those fields are governance evidence established outside the model. For that exact registered action only, report approval requirements according to the supplied policy. Never infer pre-authorization, invent a registered target, transfer it to another action, or broaden its parameters.
- When the supplied evidence is insufficient, lower confidence and require a person rather than guessing.

Return only valid JSON matching the required response schema.`

export type SupervisorExecutionMethod = 'api' | 'code_change' | 'cli' | 'ui_agent' | 'human_action' | 'no_action'
export type SupervisorExecutor = 'api_executor' | 'code_agent' | 'cli_executor' | 'ui_agent' | 'human'
export type SupervisorRiskLevel = 'low' | 'medium' | 'high' | 'critical'

export interface SupervisorThinkerResponse {
  incident_id: string
  incident_summary: string
  diagnosis: string
  confidence_score: number
  confidence_reason: string
  evidence: Array<{ source: string; finding: string }>
  missing_information: string[]
  recommended_execution_method: SupervisorExecutionMethod
  requires_ui_agent: boolean
  requires_human_approval: boolean
  risk_level: SupervisorRiskLevel
  risk_reasons: string[]
  repair_plan: Array<{ step: number; action: string; executor: SupervisorExecutor; target: string; expected_result: string; requires_approval: boolean }>
  verification_plan: Array<{ step: number; check: string; success_condition: string }>
  rollback_plan: Array<{ step: number; action: string }>
  escalation_reason: string | null
}

export const SUPERVISOR_THINKER_RESPONSE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['incident_id','incident_summary','diagnosis','confidence_score','confidence_reason','evidence','missing_information','recommended_execution_method','requires_ui_agent','requires_human_approval','risk_level','risk_reasons','repair_plan','verification_plan','rollback_plan','escalation_reason'],
  properties: {
    incident_id: { type: 'string', minLength: 1, description: 'Must exactly match the incident_id provided in the input payload.' },
    incident_summary: { type: 'string' }, diagnosis: { type: 'string' },
    confidence_score: { type: 'integer', minimum: 0, maximum: 100 }, confidence_reason: { type: 'string' },
    evidence: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['source','finding'], properties: { source: { type: 'string' }, finding: { type: 'string' } } } },
    missing_information: { type: 'array', items: { type: 'string' } },
    recommended_execution_method: { type: 'string', enum: ['api','code_change','cli','ui_agent','human_action','no_action'] },
    requires_ui_agent: { type: 'boolean' }, requires_human_approval: { type: 'boolean' },
    risk_level: { type: 'string', enum: ['low','medium','high','critical'] }, risk_reasons: { type: 'array', items: { type: 'string' } },
    repair_plan: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['step','action','executor','target','expected_result','requires_approval'], properties: { step: { type: 'integer', minimum: 1 }, action: { type: 'string' }, executor: { type: 'string', enum: ['api_executor','code_agent','cli_executor','ui_agent','human'] }, target: { type: 'string' }, expected_result: { type: 'string' }, requires_approval: { type: 'boolean' } } } },
    verification_plan: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['step','check','success_condition'], properties: { step: { type: 'integer', minimum: 1 }, check: { type: 'string' }, success_condition: { type: 'string' } } } },
    rollback_plan: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['step','action'], properties: { step: { type: 'integer', minimum: 1 }, action: { type: 'string' } } } },
    escalation_reason: { type: ['string','null'] },
  },
} as const

export function assertIncidentIdMatches(inputIncidentId: string, response: SupervisorThinkerResponse): void {
  if (response.incident_id !== inputIncidentId) throw new Error('Supervisor Thinker incident_id does not match the input incident payload')
}

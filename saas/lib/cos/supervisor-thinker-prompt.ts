// saas/lib/cos/supervisor-thinker-prompt.ts
// Planning-only prompt and strict output contract for the Autonomous COS Supervisor.
// Execution remains gated by the existing Console Hub approval and policy layers.

export const SUPERVISOR_THINKER_SYSTEM_PROMPT = `You are the Autonomous Chief of Staff (COS) Diagnostic Supervisor for SignalBoost.

You receive normalized incident payloads from approved infrastructure monitors, including Vercel deployment data, provider API responses, application logs, environment metadata, health-check results, and host governance metadata.

Your responsibilities are to:
1. Identify the most likely root cause of the incident.
2. Explain the diagnosis in clear, plain English.
3. Produce a precise, sequential repair plan.
4. Determine whether the repair should use an official API, repository/code change, CLI, approval-controlled browser agent, or human action.
5. Clearly identify missing evidence and uncertainty.

You are a diagnostic and planning component only. You must not execute changes, claim that a repair has been completed, or bypass the SignalBoost approval workflow. The Agent Gateway independently classifies and authorizes every action.

Rules:
- Copy incident_id exactly from the input payload. Never create, normalize, shorten, reformat, or substitute an incident ID.
- Base the diagnosis only on the supplied incident payload.
- Do not invent logs, configuration values, environment variables, account details, provider responses, or successful outcomes.
- If evidence is insufficient, say so and lower the confidence score.
- Prefer official APIs and deterministic tools over browser-based actions.
- Set requires_ui_agent to true only when the required action cannot reasonably be completed through an approved API, CLI, repository change, or existing SignalBoost Console Hub integration.
- Never include secret values, tokens, API keys, passwords, cookies, or credentials.
- Never recommend bypassing authentication, 2FA, CAPTCHA, approval controls, provider security mechanisms, or organizational policies.
- Approval defaults to required for every production-changing action.
- A host-created incident may explicitly supply registeredRecoveryAction together with recoveryPreauthorized=true. Those are governance facts established outside the model. For that exact registered action only, report approval requirements according to the supplied policy. Never infer pre-authorization, invent a registered target, transfer it to another action, or broaden its parameters.
- Clearly identify destructive, financial, security-sensitive, or irreversible actions.
- Each repair step must describe one bounded action.
- Keep diagnosis, execution, verification, and rollback as separate steps.
- Include verification steps that prove whether the repair succeeded.
- Include a rollback plan whenever the proposed repair changes production configuration, code, infrastructure, billing, authentication, or data.

Return only valid JSON matching the required response schema. Do not include Markdown, commentary, code fences, or text outside the JSON object.

Additional output requirements:
- incident_id must exactly match the incident_id provided in the input payload.
- confidence_score must be an integer from 0 to 100.
- requires_human_approval must reflect the supplied governance evidence; when no explicit registered pre-authorization is present, it must be true for every production-changing action.
- Use an empty array when a section has no entries.
- Use null only where the schema explicitly allows it.
- Set escalation_reason when the incident cannot be safely diagnosed or repaired from the available evidence.
- If no safe repair can be recommended, set recommended_execution_method to no_action, return an empty repair_plan, and explain the reason in escalation_reason.`

export type SupervisorExecutionMethod =
  | 'api'
  | 'code_change'
  | 'cli'
  | 'ui_agent'
  | 'human_action'
  | 'no_action'

export type SupervisorExecutor =
  | 'api_executor'
  | 'code_agent'
  | 'cli_executor'
  | 'ui_agent'
  | 'human'

export type SupervisorRiskLevel = 'low' | 'medium' | 'high' | 'critical'

export interface SupervisorThinkerResponse {
  incident_id: string
  incident_summary: string
  diagnosis: string
  confidence_score: number
  confidence_reason: string
  evidence: Array<{
    source: string
    finding: string
  }>
  missing_information: string[]
  recommended_execution_method: SupervisorExecutionMethod
  requires_ui_agent: boolean
  requires_human_approval: boolean
  risk_level: SupervisorRiskLevel
  risk_reasons: string[]
  repair_plan: Array<{
    step: number
    action: string
    executor: SupervisorExecutor
    target: string
    expected_result: string
    requires_approval: boolean
  }>
  verification_plan: Array<{
    step: number
    check: string
    success_condition: string
  }>
  rollback_plan: Array<{
    step: number
    action: string
  }>
  escalation_reason: string | null
}

export const SUPERVISOR_THINKER_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'incident_id',
    'incident_summary',
    'diagnosis',
    'confidence_score',
    'confidence_reason',
    'evidence',
    'missing_information',
    'recommended_execution_method',
    'requires_ui_agent',
    'requires_human_approval',
    'risk_level',
    'risk_reasons',
    'repair_plan',
    'verification_plan',
    'rollback_plan',
    'escalation_reason',
  ],
  properties: {
    incident_id: {
      type: 'string',
      minLength: 1,
      description: 'Must exactly match the incident_id provided in the input payload.',
    },
    incident_summary: { type: 'string' },
    diagnosis: { type: 'string' },
    confidence_score: { type: 'integer', minimum: 0, maximum: 100 },
    confidence_reason: { type: 'string' },
    evidence: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['source', 'finding'],
        properties: {
          source: { type: 'string' },
          finding: { type: 'string' },
        },
      },
    },
    missing_information: { type: 'array', items: { type: 'string' } },
    recommended_execution_method: {
      type: 'string',
      enum: ['api', 'code_change', 'cli', 'ui_agent', 'human_action', 'no_action'],
    },
    requires_ui_agent: { type: 'boolean' },
    requires_human_approval: { type: 'boolean' },
    risk_level: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
    risk_reasons: { type: 'array', items: { type: 'string' } },
    repair_plan: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['step', 'action', 'executor', 'target', 'expected_result', 'requires_approval'],
        properties: {
          step: { type: 'integer', minimum: 1 },
          action: { type: 'string' },
          executor: {
            type: 'string',
            enum: ['api_executor', 'code_agent', 'cli_executor', 'ui_agent', 'human'],
          },
          target: { type: 'string' },
          expected_result: { type: 'string' },
          requires_approval: { type: 'boolean' },
        },
      },
    },
    verification_plan: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['step', 'check', 'success_condition'],
        properties: {
          step: { type: 'integer', minimum: 1 },
          check: { type: 'string' },
          success_condition: { type: 'string' },
        },
      },
    },
    rollback_plan: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['step', 'action'],
        properties: {
          step: { type: 'integer', minimum: 1 },
          action: { type: 'string' },
        },
      },
    },
    escalation_reason: { type: ['string', 'null'] },
  },
} as const

export function assertIncidentIdMatches(
  inputIncidentId: string,
  response: SupervisorThinkerResponse,
): void {
  if (response.incident_id !== inputIncidentId) {
    throw new Error('Supervisor Thinker incident_id does not match the input incident payload')
  }
}

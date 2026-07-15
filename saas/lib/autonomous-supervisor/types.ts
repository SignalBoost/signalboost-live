export type SupervisorSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export type ExecutionMethod = 'api' | 'code_change' | 'cli' | 'ui_agent' | 'human_action' | 'no_action'
export type RepairExecutor = 'api_executor' | 'code_agent' | 'cli_executor' | 'ui_agent' | 'human'

export interface NormalizedIncidentPayload {
  incident_id: string
  timestamp: string
  provider: 'Vercel'
  project: string
  severity: SupervisorSeverity
  trigger: 'DEPLOYMENT_STATUS'
  error_summary: string
  raw_logs: string
  context: {
    last_successful_deploy: string | null
    recent_env_changes: Array<{
      variable: string
      action: string
      timestamp: string
      editor: string | null
    }>
    deployment_id?: string | null
    deployment_url?: string | null
  }
}

export interface DiagnosticResult {
  incident_summary: string
  diagnosis: string
  confidence_score: number
  confidence_reason: string
  evidence: Array<{ source: string; finding: string }>
  missing_information: string[]
  recommended_execution_method: ExecutionMethod
  requires_ui_agent: boolean
  requires_human_approval: boolean
  risk_level: 'low' | 'medium' | 'high' | 'critical'
  risk_reasons: string[]
  repair_plan: Array<{
    step: number
    action: string
    executor: RepairExecutor
    target: string
    expected_result: string
    requires_approval: boolean
  }>
  verification_plan: Array<{ step: number; check: string; success_condition: string }>
  rollback_plan: Array<{ step: number; action: string }>
  escalation_reason: string | null
}

export interface SupervisorRunResult {
  ok: boolean
  incident: NormalizedIncidentPayload
  diagnostic?: DiagnosticResult
  uiAgentDispatch?: {
    staged: boolean
    prId?: string
    message: string
  }
  error?: string
}

import type { SupervisorThinkerResponse } from '@/lib/cos/supervisor-thinker-prompt'

export type SupervisorSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

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

export type DiagnosticResult = SupervisorThinkerResponse

export interface SupervisorRunResult {
  ok: boolean
  incident: NormalizedIncidentPayload
  diagnostic?: DiagnosticResult
  approvalDispatch?: {
    staged: boolean
    prId?: string
    mode: 'not_required' | 'approval_review' | 'unavailable'
    message: string
  }
  error?: string
}

// saas/lib/autonomous-supervisor/types.ts
import type { SupervisorThinkerResponse } from '@/lib/cos/supervisor-thinker-prompt'
import type { RepairDispatchSummary } from '../../agent-gateway-host/supervisor-actions.ts'

export type SupervisorSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export type SupervisorTrigger = 'DEPLOYMENT_STATUS' | 'NATIVE_HEALTH'

export interface NormalizedIncidentPayload {
  incident_id: string
  timestamp: string
  /** Provider/source is intentionally not Vercel-only: native platform probes use this same diagnostic contract. */
  provider: string
  project: string
  severity: SupervisorSeverity
  trigger: SupervisorTrigger
  error_summary: string
  /** Bounded evidence supplied to the thinker. Never credentials. */
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
    affected_resource?: string | null
    native_probe?: string | null
    connector_evidence?: unknown
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
  repairDispatch?: RepairDispatchSummary
  error?: string
}

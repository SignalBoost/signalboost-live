export type HealthState = 'healthy' | 'degraded' | 'critical' | 'paused' | 'recovering' | 'safe_mode' | 'unknown'
export type Severity = 'info' | 'degraded' | 'critical'
export type RootCause =
  | 'resource_exhaustion'
  | 'provider_outage'
  | 'database_error'
  | 'auth_error'
  | 'billing_error'
  | 'stuck_job'
  | 'deadlock'
  | 'corrupted_state'
  | 'invalid_config'
  | 'deployment_failure'
  | 'rate_limit'
  | 'timeout'
  | 'unknown'
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'
export type PipelineMode = 'primary' | 'backup' | 'degraded_simple' | 'paused'

export type GovernanceEvent = {
  event_id: string
  timestamp: string
  subsystem: string
  severity: Severity
  state_before: HealthState
  state_after: HealthState
  detected_fault: RootCause
  isolation_action: string
  recovery_action: string
  automatic_or_manual: 'automatic' | 'manual_pending' | 'manual_approved'
  approval_required: boolean
  approved_by: string | null
  confidence_score: number
  risk_level: RiskLevel
  result: string
  next_recommended_action: string
}

export type SubsystemHealth = {
  id: string
  name: string
  state: HealthState
  rootCause: RootCause
  signals: string[]
  routingMode: PipelineMode
  investigationHref: string
  automaticRecovery: string
  approvalGate: string
}

export type FailurePattern = {
  pattern_id: string
  subsystem: string
  detection_rule: string
  severity: Severity
  confidence: number
  automatic_action_allowed: boolean
  owner_approval_required: boolean
  recovery_steps: string[]
  last_seen_timestamp: string
  occurrence_count: number
  audit_trail_references: string[]
}

export type RebuildPlan = {
  id: string
  broken_component: string
  suspected_cause: RootCause
  proposed_fix: string
  risk_level: RiskLevel
  affected_services: string[]
  estimated_impact: string
  rollback_option: string
  approval_required: boolean
}

export const monitoredSignals = [
  'API route latency and error rates',
  'background job failures, stuck jobs, retry count, and queue depth',
  'cron heartbeats, deployment failures, and third-party dependency status',
  'AI, email, Supabase, storage, auth, billing, outreach, concierge, audio, and video providers',
  'memory, CPU, disk, timeout, and database connection signals where available',
]

export const governanceSubsystems: SubsystemHealth[] = [
  {
    id: 'database',
    name: 'Supabase database',
    state: 'critical',
    rootCause: 'database_error',
    signals: ['Repeated connection failures', 'write-heavy jobs paused', 'UI should prefer read-only views'],
    routingMode: 'paused',
    investigationHref: '/admin/system#database',
    automaticRecovery: 'Pause write-heavy jobs and preserve existing job state.',
    approvalGate: 'Schema/config changes require owner approval.',
  },
  {
    id: 'outreach',
    name: 'Outreach sending',
    state: 'degraded',
    rootCause: 'rate_limit',
    signals: ['Provider rate-limit responses', 'daily outreach limit approaching', 'retry rate increasing'],
    routingMode: 'backup',
    investigationHref: '/admin/logs#outreach',
    automaticRecovery: 'Throttle sending and switch to draft-only mode when repeated.',
    approvalGate: 'Large email batches require configured approval rules.',
  },
  {
    id: 'video',
    name: 'Video/audio generation',
    state: 'recovering',
    rootCause: 'stuck_job',
    signals: ['Render progress stuck at 78%', 'worker heartbeat present', 'safe render profile available'],
    routingMode: 'degraded_simple',
    investigationHref: '/admin/timeline#video',
    automaticRecovery: 'Terminate stuck non-critical job and requeue with safe render profile.',
    approvalGate: 'No destructive media deletion is automatic.',
  },
  {
    id: 'deployment',
    name: 'Vercel deployments',
    state: 'critical',
    rootCause: 'deployment_failure',
    signals: ['Recent deployment failed', 'last successful deployment remains active'],
    routingMode: 'paused',
    investigationHref: '/admin/system#deployment',
    automaticRecovery: 'Open an incident and prepare a repair plan only.',
    approvalGate: 'Rollback, redeploy, commits, env changes, and production rebuilds require approval.',
  },
  {
    id: 'ai',
    name: 'AI provider routing',
    state: 'degraded',
    rootCause: 'provider_outage',
    signals: ['OpenAI timeout increase', 'backup provider configured', 'cached template fallback available'],
    routingMode: 'backup',
    investigationHref: '/admin/governance#ai',
    automaticRecovery: 'Route low-risk generation to backup provider or cached templates.',
    approvalGate: 'Security policy and secret rotation require owner approval.',
  },
]

export const governanceEvents: GovernanceEvent[] = [
  {
    event_id: 'gov-evt-db-001',
    timestamp: '2026-07-08T09:12:00.000Z',
    subsystem: 'database',
    severity: 'critical',
    state_before: 'degraded',
    state_after: 'critical',
    detected_fault: 'database_error',
    isolation_action: 'Paused write-heavy background jobs and preserved queued job state.',
    recovery_action: 'Prepared owner approval checklist for Supabase config/schema investigation.',
    automatic_or_manual: 'manual_pending',
    approval_required: true,
    approved_by: null,
    confidence_score: 0.91,
    risk_level: 'high',
    result: 'Unsafe automated writes blocked; UI should remain available for existing data.',
    next_recommended_action: 'Owner/admin reviews database connectivity and approves any schema or config change.',
  },
  {
    event_id: 'gov-evt-outreach-002',
    timestamp: '2026-07-08T09:18:00.000Z',
    subsystem: 'outreach',
    severity: 'degraded',
    state_before: 'healthy',
    state_after: 'degraded',
    detected_fault: 'rate_limit',
    isolation_action: 'Stopped routing new bulk sends to the primary email pipeline.',
    recovery_action: 'Throttled queue and switched outreach to draft-only backup mode.',
    automatic_or_manual: 'automatic',
    approval_required: false,
    approved_by: null,
    confidence_score: 0.88,
    risk_level: 'low',
    result: 'No customer emails sent automatically; drafts continue for admin review.',
    next_recommended_action: 'Reconnect provider or approve send rules after rate limits reset.',
  },
  {
    event_id: 'gov-evt-video-003',
    timestamp: '2026-07-08T09:23:00.000Z',
    subsystem: 'video',
    severity: 'degraded',
    state_before: 'healthy',
    state_after: 'recovering',
    detected_fault: 'stuck_job',
    isolation_action: 'Terminated non-critical stalled render worker without deleting assets.',
    recovery_action: 'Requeued job with safe render profile and capped overlay complexity.',
    automatic_or_manual: 'automatic',
    approval_required: false,
    approved_by: null,
    confidence_score: 0.84,
    risk_level: 'low',
    result: 'Job preserved and requeued; heavy rendering remains throttled.',
    next_recommended_action: 'Review render history if pattern repeats three times in one hour.',
  },
  {
    event_id: 'gov-evt-safe-004',
    timestamp: '2026-07-08T09:30:00.000Z',
    subsystem: 'platform',
    severity: 'critical',
    state_before: 'degraded',
    state_after: 'safe_mode',
    detected_fault: 'unknown',
    isolation_action: 'Multiple critical/degraded systems detected; paused non-essential cron, discovery, AI-heavy, rendering, and bulk send workloads.',
    recovery_action: 'Kept auth, billing visibility, core UI, admin console, telemetry, audit logs, and existing customer data access alive.',
    automatic_or_manual: 'automatic',
    approval_required: false,
    approved_by: null,
    confidence_score: 0.79,
    risk_level: 'medium',
    result: 'Safe Mode Active with high-risk fixes gated behind owner approval.',
    next_recommended_action: 'Approve or reject pending deployment/database recovery plans.',
  },
]

export const failurePatterns: FailurePattern[] = [
  {
    pattern_id: 'FFmpegStall78',
    subsystem: 'video',
    detection_rule: 'Rendering progress stuck between 75% and 80% longer than the configured threshold.',
    severity: 'degraded',
    confidence: 0.84,
    automatic_action_allowed: true,
    owner_approval_required: false,
    recovery_steps: ['Terminate stuck job', 'Requeue with safe render profile', 'Force pixel format', 'Cap duration', 'Reduce overlay complexity'],
    last_seen_timestamp: '2026-07-08T09:23:00.000Z',
    occurrence_count: 1,
    audit_trail_references: ['gov-evt-video-003'],
  },
  {
    pattern_id: 'EmailProviderRateLimit',
    subsystem: 'outreach',
    detection_rule: 'Provider returns repeated rate-limit errors or timeout bursts.',
    severity: 'degraded',
    confidence: 0.88,
    automatic_action_allowed: true,
    owner_approval_required: false,
    recovery_steps: ['Throttle sending', 'Reduce batch size', 'Switch to draft-only mode if repeated', 'Notify owner/admin'],
    last_seen_timestamp: '2026-07-08T09:18:00.000Z',
    occurrence_count: 2,
    audit_trail_references: ['gov-evt-outreach-002'],
  },
  {
    pattern_id: 'SupabaseConnectionFailure',
    subsystem: 'database',
    detection_rule: 'Repeated DB connection failures or errors increasing after deployment.',
    severity: 'critical',
    confidence: 0.91,
    automatic_action_allowed: true,
    owner_approval_required: true,
    recovery_steps: ['Pause write-heavy jobs', 'Keep UI read-only where possible', 'Prepare config/schema checklist for approval'],
    last_seen_timestamp: '2026-07-08T09:12:00.000Z',
    occurrence_count: 1,
    audit_trail_references: ['gov-evt-db-001'],
  },
  {
    pattern_id: 'FailedDeployment',
    subsystem: 'deployment',
    detection_rule: 'Vercel deployment failure while last successful deployment remains active.',
    severity: 'critical',
    confidence: 0.86,
    automatic_action_allowed: true,
    owner_approval_required: true,
    recovery_steps: ['Log incident', 'Keep last successful deployment active', 'Generate repair plan', 'Request owner approval before rollback/redeploy'],
    last_seen_timestamp: '2026-07-08T09:27:00.000Z',
    occurrence_count: 1,
    audit_trail_references: ['gov-evt-safe-004'],
  },
]

export const rebuildPlans: RebuildPlan[] = [
  {
    id: 'rebuild-deployment-001',
    broken_component: 'Production deployment pipeline',
    suspected_cause: 'deployment_failure',
    proposed_fix: 'Compare current deployment config to known-good snapshot, prepare suggested patch, and create recovery checklist.',
    risk_level: 'high',
    affected_services: ['Vercel deployment', 'production environment variables', 'GitHub workflow'],
    estimated_impact: 'No automatic production change. Owner approval required before commit, env mutation, redeploy, or rollback.',
    rollback_option: 'Keep last successful deployment active until an approved rollback or redeploy is executed.',
    approval_required: true,
  },
]

export const safeModeStatus = {
  active: governanceEvents.some((event) => event.state_after === 'safe_mode'),
  affectedSystems: governanceSubsystems.filter((system) => system.state !== 'healthy').map((system) => system.name),
  pausedWorkloads: ['prospect discovery', 'AI-heavy generation', 'video/audio rendering', 'bulk email sending', 'large imports/exports', 'non-essential cron jobs'],
  keptAlive: ['auth', 'billing visibility', 'core UI', 'admin console', 'status dashboard', 'telemetry', 'audit logs', 'existing customer data access'],
  lastRecoveryAttempt: governanceEvents[governanceEvents.length - 1]?.timestamp,
  recommendedAdminAction: 'Review pending high-risk database/deployment approvals; low-risk throttling and draft-only recovery is already active.',
}

export const governanceSummary = {
  title: 'Owner/Admin Governance + Resilience Layer',
  description: 'NASA-inspired FDIR for SignalBoost SaaS operations: detect early, isolate safely, recover low-risk faults automatically, escalate high-risk fixes, and log every action.',
  activeIncidents: governanceSubsystems.filter((system) => ['degraded', 'critical', 'recovering', 'safe_mode'].includes(system.state)).length,
  recoveredIncidents: governanceEvents.filter((event) => event.result.toLowerCase().includes('requeued') || event.result.toLowerCase().includes('drafts continue')).length,
  degradedSystems: governanceSubsystems.filter((system) => system.state === 'degraded').length,
  pendingApprovals: governanceEvents.filter((event) => event.approval_required && !event.approved_by).length + rebuildPlans.filter((plan) => plan.approval_required).length,
  failedRecoveries: governanceEvents.filter((event) => event.result.toLowerCase().includes('failed')).length,
  lastSuccessfulRecovery: 'gov-evt-video-003',
}

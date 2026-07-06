// saas/lib/ai/cos/orchestrationGraph.ts
// COS Orchestration Graph — stable department map for the multi-department
// SignalBoost operating system. This is the implementation of the owner's
// department blueprint: COS is the brain; departments are the controlled organs.

export type CosDepartmentId =
  | 'audit'
  | 'cybersecurity'
  | 'website'
  | 'video'
  | 'podcast'
  | 'outreach'
  | 'pr_cockpit'
  | 'pricing'
  | 'analysis'

export type CosRiskLevel = 'low' | 'medium' | 'high' | 'critical'
export type CosExecutionMode = 'auto' | 'hold' | 'pr_cockpit'

export type CosDepartmentDefinition = {
  id: CosDepartmentId
  label: string
  layer: string
  describes: string
  keywords: string[]
  riskDefault: CosRiskLevel
  executionDefault: CosExecutionMode
}

export type CosDepartmentRouting = {
  department: CosDepartmentId
  label: string
  layer: string
  reason: string
  confidence: number
  riskDefault: CosRiskLevel
  executionDefault: CosExecutionMode
}

export const COS_DEPARTMENTS: readonly CosDepartmentDefinition[] = [
  {
    id: 'audit',
    label: 'Audit Department',
    layer: 'AI Ethics Layer + Security Layer',
    describes: 'Evidence collection, provider inventory, identity and secrets review, governance reports.',
    keywords: ['audit', 'evidence', 'compliance', 'provider inventory', 'identity', 'secrets review', 'report', 'reports', 'governance'],
    riskDefault: 'high',
    executionDefault: 'hold',
  },
  {
    id: 'cybersecurity',
    label: 'Cybersecurity Department',
    layer: 'AI Architect Layer + Security Module',
    describes: 'Dependency monitoring, alerts, vulnerabilities, remediation plans, repo safety checks.',
    keywords: ['cybersecurity', 'security', 'dependency', 'vulnerability', 'alert', 'alerts', 'risk', 'remediation', 'repo check', 'threat'],
    riskDefault: 'critical',
    executionDefault: 'pr_cockpit',
  },
  {
    id: 'website',
    label: 'Website Department',
    layer: 'AI Engineer Layer + Data Scientist Layer',
    describes: 'Website design, build, optimization, SEO, conversion, review-driven improvements.',
    keywords: ['website', 'site', 'builder', 'build website', 'improve website', 'optimize', 'seo', 'conversion', 'speed', 'accessibility', 'url'],
    riskDefault: 'medium',
    executionDefault: 'auto',
  },
  {
    id: 'video',
    label: 'Video Department',
    layer: 'AI Studio Layer',
    describes: 'Captions, exports, brand styling, campaign video production, short-form content.',
    keywords: ['video', 'caption', 'captions', 'export', 'brand styling', 'short-form', 'short form', 'reel', 'tiktok', 'youtube', 'campaign video'],
    riskDefault: 'low',
    executionDefault: 'auto',
  },
  {
    id: 'podcast',
    label: 'Podcast Department',
    layer: 'AI Studio Layer',
    describes: 'Voiceover, podcast clips, show metadata, distribution preparation, support audio.',
    keywords: ['podcast', 'voiceover', 'audio', 'clip', 'clips', 'metadata', 'distribution', 'episode', 'transcript', 'native voice'],
    riskDefault: 'low',
    executionDefault: 'auto',
  },
  {
    id: 'outreach',
    label: 'Outreach Department',
    layer: 'Marketing AI Layer',
    describes: 'Discovery, contacts, outreach campaigns, sales pipeline, partner growth workflows.',
    keywords: ['outreach', 'sales', 'contacts', 'campaign', 'email sequence', 'lead', 'leads', 'prospect', 'pipeline', 'partner', 'discovery'],
    riskDefault: 'medium',
    executionDefault: 'auto',
  },
  {
    id: 'pr_cockpit',
    label: 'PR Cockpit',
    layer: 'Approval Layer + Human-in-the-loop',
    describes: 'Review and approval gate for code, infrastructure, production deploys, and public publishing.',
    keywords: ['approve', 'approval', 'review', 'fix', 'publish', 'deploy', 'pull request', 'pr cockpit', 'merge', 'production'],
    riskDefault: 'critical',
    executionDefault: 'pr_cockpit',
  },
  {
    id: 'pricing',
    label: 'Pricing Department',
    layer: 'Finance + Monetization Layer',
    describes: 'Credit ledger, offer packaging, Stripe pricing, pay-as-you-go activation and upgrade paths.',
    keywords: ['pricing', 'price', 'credits', 'credit', 'stripe', 'package', 'pack', 'upgrade', 'subscription', 'tokens'],
    riskDefault: 'high',
    executionDefault: 'hold',
  },
  {
    id: 'analysis',
    label: 'Analysis Desk',
    layer: 'COS Core Reasoning Layer',
    describes: 'General strategy, synthesis, explanation, or routing when no operational department matches.',
    keywords: [],
    riskDefault: 'low',
    executionDefault: 'auto',
  },
]

export const COS_ORCHESTRATION_SCHEMA = {
  cos_orchestration: {
    version: '1.0',
    intent: { raw_input: '', normalized: '', confidence: 0, detected_entities: [] as string[] },
    routing: { department: '', reason: '', confidence: 0 },
    risk: { level: 'low | medium | high | critical', factors: [] as string[], requires_human_approval: false },
    approval: { required: false, approved: false, approver_role: 'owner | admin | operator', pr_cockpit_ticket: null as string | null },
    execution: { mode: 'auto | hold | pr_cockpit', action: '', payload: {}, status: 'pending | running | completed | blocked' },
    telemetry: {
      intent_routed: true,
      workflow_started: false,
      timestamp: '',
      memory_layer: { last_intent: '', last_ai_mode: '', latest_brief: '' },
    },
  },
} as const

export const COS_RISK_LEVELS: Record<CosRiskLevel, { requiresApproval: boolean; executionMode: CosExecutionMode }> = {
  low: { requiresApproval: false, executionMode: 'auto' },
  medium: { requiresApproval: false, executionMode: 'auto' },
  high: { requiresApproval: true, executionMode: 'hold' },
  critical: { requiresApproval: true, executionMode: 'pr_cockpit' },
}

export function routeCosDepartment(objective: string): CosDepartmentRouting {
  const text = ` ${(objective || '').toLowerCase().trim()} `
  let best = COS_DEPARTMENTS[COS_DEPARTMENTS.length - 1]
  let bestScore = 0

  for (const department of COS_DEPARTMENTS) {
    if (department.id === 'analysis') continue
    const score = department.keywords.filter(keyword => text.includes(keyword)).length
    if (score > bestScore) {
      best = department
      bestScore = score
    }
  }

  const confidence = bestScore === 0 ? 0.35 : Math.min(0.95, 0.55 + bestScore * 0.12)
  const reason = bestScore === 0
    ? 'No department keyword matched; routing to the COS analysis desk.'
    : `Matched ${bestScore} department signal${bestScore === 1 ? '' : 's'} for ${best.label}.`

  return {
    department: best.id,
    label: best.label,
    layer: best.layer,
    reason,
    confidence,
    riskDefault: best.riskDefault,
    executionDefault: best.executionDefault,
  }
}

export function executionModeForRisk(level: CosRiskLevel): CosExecutionMode {
  return COS_RISK_LEVELS[level]?.executionMode || 'auto'
}

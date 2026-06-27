// saas/lib/cos-marketing-sales/types.ts
// Portable COS Marketing + Sales Engine shared types.
// Phase 1 is mock-safe: no automatic publishing, no real email dispatch,
// no external social posting, and every outbound action is represented as a plan.

export type CosLocale = 'en' | 'es' | 'pt-BR' | 'pl' | 'ru'

export const COS_LOCALES: CosLocale[] = ['en', 'es', 'pt-BR', 'pl', 'ru']

export type LeadSource =
  | 'website_optimizer'
  | 'repo_check'
  | 'cybersecurity_check'
  | 'audit_preview'
  | 'organic_social'
  | 'print_ad_desk'
  | 'email_outreach'
  | 'manual_import'
  | 'partner_referral'

export type LeadStatus =
  | 'new'
  | 'tagged'
  | 'warming'
  | 'qualified'
  | 'demo_proposed'
  | 'proposal_ready'
  | 'converted'
  | 'not_fit'
  | 'do_not_contact'

export type FollowUpMilestone =
  | 'personalized_audit_link'
  | 'multilingual_brief'
  | 'interactive_demo_offer'
  | 'human_review_required'

export type OutreachChannel = 'email' | 'linkedin' | 'manual_note' | 'print_desk_email'

export type OutreachStepStatus = 'planned' | 'blocked_by_domain_throttle' | 'requires_owner_approval' | 'ready_to_send' | 'sent' | 'skipped'

export type LeadCapture = {
  id: string
  workspaceId?: string
  email: string
  name?: string
  company?: string
  domain: string
  source: LeadSource
  status: LeadStatus
  locale: CosLocale
  country?: string
  tags: string[]
  score: number
  notes?: string
  followUpMilestones: FollowUpMilestone[]
  createdAt: string
  updatedAt: string
}

export type OutreachDispatchRecord = {
  id: string
  leadId?: string
  recipientEmail: string
  recipientDomain: string
  channel: OutreachChannel
  status: 'planned' | 'sent' | 'blocked' | 'failed'
  createdAt: string
}

export type OutreachStep = {
  id: string
  milestone: FollowUpMilestone
  channel: OutreachChannel
  dayOffset: number
  status: OutreachStepStatus
  subject: string
  body: string
  reason?: string
}

export type OutreachPlan = {
  lead: LeadCapture
  domainThrottle: DomainThrottleDecision
  cadence: OutreachStep[]
  nextAction: string
  requiresApproval: boolean
}

export type DomainThrottleDecision = {
  allowed: boolean
  domain: string
  windowHours: number
  maxDispatches: number
  usedDispatches: number
  remainingDispatches: number
  reason?: string
}

export type LeadIntakeSource = 'website_optimizer' | 'repo_check' | 'cybersecurity_check' | 'audit_preview'

export type LeadIntakePayload = {
  source: LeadIntakeSource
  email: string
  name?: string
  company?: string
  targetUrl: string
  locale: CosLocale
  country?: string
  score?: number
  summary?: Record<string, unknown>
  findings?: Array<{ code?: string; category?: string; severity?: string; value?: string | number | boolean }>
  tags?: string[]
}

export type LeadIntakeResult = {
  id: string
  lead: LeadCapture
  source: LeadIntakeSource
  targetUrl: string
  tags: string[]
  approvalStatus: 'pending_owner_review'
  outreachPlan: OutreachPlan
  storage: {
    attempted: boolean
    saved: boolean
    table: string
    recordId?: string
    reason?: string
  }
}

export type PodcastInput = {
  title?: string
  rawText?: string
  securityBrief?: string
  locale: CosLocale
  platformName?: string
  midRollOffer?: string
}

export type PodcastSegmentType = 'intro' | 'host_dialogue' | 'explanation' | 'mid_roll_ad' | 'cta' | 'outro'

export type PodcastSegment = {
  id: string
  type: PodcastSegmentType
  speaker: 'host_a' | 'host_b' | 'announcer'
  durationSeconds: number
  text: string
}

export type PodcastSequence = {
  id: string
  locale: CosLocale
  durationSeconds: number
  title: string
  hosts: { hostA: string; hostB: string }
  segments: PodcastSegment[]
  providerPlan: {
    provider: 'mock' | 'autocontent' | 'elevenlabs'
    voiceMode: 'two_host_conversation'
    requiresApiKey: boolean
    externalDispatch: false
  }
}

export type PrintAssetMetadata = {
  assetId: string
  assetTitle: string
  fileName: string
  fileUrl?: string
  mimeType: 'application/pdf' | 'image/png' | 'image/jpeg'
  checksum?: string
  approvedBy?: string
  approvedAt?: string
}

export type PrintDimensions = {
  widthInches: number
  heightInches: number
  bleedInches: number
  safeMarginInches: number
  colorMode: 'CMYK' | 'RGB' | 'grayscale'
  resolutionDpi: number
}

export type PrintDeskContact = {
  publisherName: string
  deskEmail: string
  phone?: string
  market?: string
  notes?: string
}

export type PrintDeskPayload = {
  id: string
  status: 'compiled_not_sent' | 'ready_for_owner_approval' | 'approved_ready_to_email' | 'sent'
  locale: CosLocale
  campaignId?: string
  asset: PrintAssetMetadata
  dimensions: PrintDimensions
  publisher: PrintDeskContact
  subject: string
  body: string
  attachmentRequired: boolean
  dispatchFallback: {
    mode: 'email_fallback'
    to: string
    cc?: string
    attachFileUrl?: string
    humanApprovalRequired: true
  }
  createdAt: string
}

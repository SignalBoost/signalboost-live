// saas/marketing-sales-core/lifecycle.ts
// Pure state machine. Defines legal transitions and which require a human
// (management) decision per the Command Control Charter.
import type { CampaignStatus } from './types'

const TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  intake: ['drafting', 'archived'],
  drafting: ['needs_approval', 'archived'],
  needs_approval: ['approved', 'edits_requested', 'rejected', 'archived'],
  edits_requested: ['drafting', 'archived'],
  approved: ['publishing', 'archived'],
  publishing: ['published', 'publish_failed'],
  published: ['measuring', 'archived'],
  publish_failed: ['publishing', 'archived'],
  measuring: ['archived'],
  rejected: ['archived'],
  archived: [],
}

// The ONLY transitions a human (owner/admin) makes; COS drives the rest.
const HUMAN_ONLY: ReadonlyArray<string> = [
  'needs_approval->approved',
  'needs_approval->edits_requested',
  'needs_approval->rejected',
]

export function canTransition(from: CampaignStatus, to: CampaignStatus): boolean {
  return (TRANSITIONS[from] || []).includes(to)
}

export function isHumanDecision(from: CampaignStatus, to: CampaignStatus): boolean {
  return HUMAN_ONLY.includes(`${from}->${to}`)
}

export function nextStates(from: CampaignStatus): CampaignStatus[] {
  return [...(TRANSITIONS[from] || [])]
}

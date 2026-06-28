import type { CosCampaign, CosRecommendation } from '../recommendation/types'

export type CosCampaignQueueStatus = 'draft' | 'waiting_approval' | 'approved' | 'queued' | 'running' | 'completed' | 'measured' | 'learned' | 'rejected'

export type CosCampaignRiskLevel = 'low' | 'medium' | 'high'

export type CosCampaignWorkItem = {
  id: string
  kind: 'script_worker'
  status: 'waiting_approval' | 'queued' | 'running' | 'completed' | 'error'
  input: {
    campaign_id: string
    recommendation_id: string
    channel: CosCampaign['channel']
    language: 'en' | 'es' | 'pt' | 'pl' | 'ru'
    brief: string
  }
  output?: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type CosCampaignQueueItem = {
  id: string
  recommendation_id: string
  department: CosRecommendation['department']
  title: string
  objective: string
  channel: CosCampaign['channel']
  audience: string
  languages: CosCampaign['languages']
  assets: CosCampaign['assets']
  work_items: CosCampaignWorkItem[]
  recommendation: CosRecommendation
  status: CosCampaignQueueStatus
  risk_level: CosCampaignRiskLevel
  approval_required: boolean
  created_at: string
  updated_at: string
  approved_by?: string | null
  approved_at?: string | null
  metadata?: Record<string, unknown>
}

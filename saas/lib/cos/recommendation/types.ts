export type CosDepartment = 'executive' | 'marketing' | 'sales' | 'finance' | 'operations' | 'support'

export type CosChannel =
  | 'youtube'
  | 'short_video'
  | 'linkedin'
  | 'reddit'
  | 'instagram'
  | 'facebook'
  | 'twitter_x'
  | 'tiktok'
  | 'blog'
  | 'email'
  | 'outreach'
  | 'landing_page'
  | 'review_campaign'

export type CosPriority = 'low' | 'medium' | 'high' | 'critical'

export type CosApprovalStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'executed' | 'measured'

export type CosSignal = {
  id?: string
  source: string
  metric: string
  value: number | string
  change?: number
  confidence?: number
  observed_at?: string
  evidence?: string[]
}

export type CosRecommendation = {
  id: string
  department: CosDepartment
  title: string
  summary: string
  recommended_channel: CosChannel
  priority: CosPriority
  confidence: number
  expected_roi: 'unknown' | 'low' | 'medium' | 'high'
  estimated_cost_usd: number
  reason: string
  signals: CosSignal[]
  approval_status: CosApprovalStatus
  created_at: string
}

export type CosCampaignAsset = {
  type: 'script' | 'thumbnail' | 'description' | 'seo' | 'translation' | 'post' | 'email'
  status: 'needed' | 'drafted' | 'approved' | 'published'
  language?: 'en' | 'es' | 'pt' | 'pl' | 'ru'
  brief: string
}

export type CosCampaign = {
  id: string
  recommendation_id: string
  title: string
  objective: string
  channel: CosChannel
  audience: string
  languages: Array<'en' | 'es' | 'pt' | 'pl' | 'ru'>
  assets: CosCampaignAsset[]
  approval_status: CosApprovalStatus
  created_at: string
}

export type CosLocale = 'en' | 'es' | 'pt' | 'pl' | 'ru'

export type GoalStatus = 'active' | 'at_risk' | 'completed' | 'paused'

export type GoalCategory = 'growth' | 'revenue' | 'marketing' | 'sales' | 'product' | 'operations'

export type CompanyGoal = {
  id: string
  title: string
  description: string
  category: GoalCategory
  priority: 'low' | 'medium' | 'high' | 'critical'
  status: GoalStatus
  kpi: string
  target: number
  current: number
  unit: string
  deadline?: string
  created_at: string
  updated_at: string
}

export type ExecutiveMetric = {
  id: string
  label: string
  value: string | number
  status: 'healthy' | 'watch' | 'at_risk'
  explanation: string
}

export type ExecutiveBriefingItem = {
  id: string
  title: string
  summary: string
  priority: 'low' | 'medium' | 'high' | 'critical'
  confidence: number
  evidence: string[]
  recommended_action: string
  approval_required: boolean
}

export type ExecutiveBriefing = {
  generated_at: string
  locale: CosLocale
  headline: string
  operating_principle: string
  goals: CompanyGoal[]
  metrics: ExecutiveMetric[]
  recommendations: ExecutiveBriefingItem[]
  next_actions: string[]
}

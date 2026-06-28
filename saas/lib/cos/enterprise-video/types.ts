export type EnterpriseVideoTier = 'prototype' | 'professional' | 'enterprise'

export type EnterpriseVideoStrategyInput = {
  brand_name?: string
  product_or_service?: string
  audience?: string
  target_platforms?: string[]
  budget_tier?: EnterpriseVideoTier
}

export type ProductionPlan = {
  target_tier: EnterpriseVideoTier
  render_standard: string
  provider_strategy: string[]
  approval_gates: string[]
}

export type DiscoveryPlan = {
  target_platforms: string[]
  search_package: string[]
  paid_distribution_package: string[]
  ranking_principles: string[]
}

export type EnterpriseVideoStrategy = {
  doctrine: string
  brand_name: string
  product_or_service: string
  audience: string
  production_plan: ProductionPlan
  discovery_plan: DiscoveryPlan
  quality_gate: string[]
  owner_rule: string
}

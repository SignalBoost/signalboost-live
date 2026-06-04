export type WebsiteScoreKey = 'performance' | 'seo' | 'accessibility' | 'mobile' | 'conversion' | 'security'
export type RecommendationPriority = 'high' | 'medium' | 'low'
export type WebsiteRecommendation = {
  category: WebsiteScoreKey
  priority: RecommendationPriority
  recommendation: string
  suggested_fix: Record<string, unknown>
}
export type WebsiteAuditResult = Record<WebsiteScoreKey, number> & {
  url: string
  normalized_url: string
  fetched_at: string
  recommendations: WebsiteRecommendation[]
  raw_report: Record<string, unknown>
}
export type WebsiteOptimizerResult = {
  headline: string
  subheadline: string
  body: string
  cta: string
  seo: { title: string; description: string; keywords: string[] }
  layout_changes: string[]
  accessibility_fixes: string[]
}
export type WebsiteRebuildResult = {
  recommended: boolean
  reason: string
  structure: { pages: Array<{ slug: string; title: string; sections: string[] }> }
  content: Record<string, Record<string, { headline: string; body: string; cta?: string }>>
  seo: Record<string, { title: string; description: string }>
}

export type VideoQualityFeature =
  | 'hero_selected'
  | 'format_selected'
  | 'visual_scene_design'
  | 'non_text_motion'
  | 'branded_url'
  | 'traffic_plan'
  | 'monetization_plan'
  | 'five_languages'
  | 'approval_gates'
  | 'mined_signals'
  | 'prediction_summary'
  | 'clear_cta'

export type VideoQualityCandidate = {
  id: string
  label: string
  title: string
  hero?: string
  format?: string
  scenes?: Array<{ label?: string; narration?: string; visual_direction?: string }>
  destination_url?: string
  traffic_plan?: string[]
  monetization_plan?: string[]
  languages?: string[]
  approval_gates?: string[]
  mining_summary?: string[]
  prediction_summary?: string
  call_to_action?: string
}

export type VideoQualityScore = {
  candidate_id: string
  label: string
  score: number
  max_score: number
  grade: 'poor' | 'basic' | 'improved' | 'marketing_grade_ready'
  passed_features: VideoQualityFeature[]
  failed_features: VideoQualityFeature[]
  notes: string[]
}

export type VideoQualityComparison = {
  baseline: VideoQualityScore
  cosa: VideoQualityScore
  improvement_points: number
  verdict: string
  next_actions: string[]
}

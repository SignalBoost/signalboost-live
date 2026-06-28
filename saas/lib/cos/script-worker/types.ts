export type CosContentWorkerInput = {
  campaign_id: string
  recommendation_id: string
  title: string
  objective: string
  channel: string
  audience: string
  language: 'en' | 'es' | 'pt' | 'pl' | 'ru'
  brief: string
}

export type CosContentWorkerOutput = {
  title: string
  opening: string
  draft: string
  scenes: Array<{
    label: string
    narration: string
    visual_direction: string
  }>
  call_to_action: string
  estimated_duration_minutes: number
  created_at: string
}

export type PresenterTone = 'professional_friendly' | 'energetic_short_form' | 'calm_product_guide'

export type PresenterVideoInput = {
  product_or_service?: string
  audience?: string
  duration_seconds?: number
  tone?: PresenterTone
  destination_url?: string
}

export type PresenterVideoScene = {
  label: string
  presenter_line: string
  caption: string
  visual_direction: string
  goal: string
}

export type PresenterVideoDraft = {
  id: string
  presenter_name: string
  presenter_role: string
  tone: PresenterTone
  title: string
  duration_seconds: number
  opening_hook: string
  scenes: PresenterVideoScene[]
  cta: string
  destination_url: string
  approval_gates: string[]
  created_at: string
}

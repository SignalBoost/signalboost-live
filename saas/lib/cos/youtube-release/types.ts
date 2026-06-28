export type CosYouTubeReleaseStatus = 'draft' | 'waiting_final_approval' | 'approved_for_upload' | 'uploading' | 'uploaded_private' | 'waiting_public_approval' | 'approved_for_release' | 'scheduled' | 'released' | 'rejected' | 'failed'

export type CosYouTubeVisibility = 'private' | 'unlisted' | 'public'

export type CosYouTubeReleaseJob = {
  id: string
  campaign_id: string
  title: string
  description: string
  tags: string[]
  category_id: string
  visibility: CosYouTubeVisibility
  release_at?: string | null
  thumbnail_prompt?: string | null
  video_asset_url?: string | null
  video_asset_path?: string | null
  youtube_video_id?: string | null
  youtube_watch_url?: string | null
  status: CosYouTubeReleaseStatus
  approval_required: boolean
  created_at: string
  updated_at: string
  approved_by?: string | null
  approved_at?: string | null
  metadata?: Record<string, unknown>
}

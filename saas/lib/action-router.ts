// File: saas/lib/action-router.ts

export type ActionIntent =
  | 'website'
  | 'reviews'
  | 'podcast'
  | 'video'
  | 'sales'
  | 'pipeline'
  | 'general'

export type ActionRoute = {
  intent: ActionIntent
  href: string | null
  label: string
  confidence: number
  reason: string
}

export function routeUserAction(input: string): ActionRoute {
  const q = (input || '').toLowerCase()

  if (
    q.includes('website') ||
    q.includes('site') ||
    q.includes('landing page') ||
    q.includes('homepage') ||
    q.includes('business page')
  ) {
    return {
      intent: 'website',
      href: '/dashboard/builder',
      label: 'actionRouter.openWebsiteBuilder',
      confidence: 0.9,
      reason: 'website_request',
    }
  }

  if (
    q.includes('review') ||
    q.includes('reviews') ||
    q.includes('testimonial') ||
    q.includes('testimonials') ||
    q.includes('feedback')
  ) {
    return {
      intent: 'reviews',
      href: '/dashboard/reviews',
      label: 'actionRouter.openReviewCollector',
      confidence: 0.9,
      reason: 'review_request',
    }
  }

  if (
    q.includes('podcast') ||
    q.includes('episode') ||
    q.includes('voiceover') ||
    q.includes('voice over') ||
    q.includes('audio')
  ) {
    return {
      intent: 'podcast',
      href: '/dashboard/audio',
      label: 'actionRouter.openAudioStudio',
      confidence: 0.9,
      reason: 'audio_or_podcast_request',
    }
  }

  if (
    q.includes('video') ||
    q.includes('caption') ||
    q.includes('captions') ||
    q.includes('subtitle') ||
    q.includes('subtitles') ||
    q.includes('reels') ||
    q.includes('shorts') ||
    q.includes('tiktok')
  ) {
    return {
      intent: 'video',
      href: '/dashboard/video',
      label: 'actionRouter.openVideoStudio',
      confidence: 0.9,
      reason: 'video_request',
    }
  }

  if (
    q.includes('sales') ||
    q.includes('outreach') ||
    q.includes('prospect') ||
    q.includes('client') ||
    q.includes('lead') ||
    q.includes('leads')
  ) {
    return {
      intent: 'sales',
      href: '/dashboard/sales',
      label: 'actionRouter.openSalesAgent',
      confidence: 0.85,
      reason: 'sales_request',
    }
  }

  if (
    q.includes('pipeline') ||
    q.includes('crm') ||
    q.includes('follow up') ||
    q.includes('follow-up') ||
    q.includes('sent emails') ||
    q.includes('replied')
  ) {
    return {
      intent: 'pipeline',
      href: '/dashboard/sales/pipeline',
      label: 'actionRouter.openSalesPipeline',
      confidence: 0.85,
      reason: 'pipeline_request',
    }
  }

  return {
    intent: 'general',
    href: null,
    label: 'actionRouter.answerInChat',
    confidence: 0.3,
    reason: 'general_question',
  }
}

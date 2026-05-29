export const REVIEW_LOCALES = ['en', 'es', 'pt', 'pl', 'ru'] as const

export type ReviewLocale = typeof REVIEW_LOCALES[number]
export type ReviewSentiment = 'positive' | 'neutral' | 'negative'
export type ReviewSortMode = 'relevance' | 'date' | 'rating'

export type ReviewRecord = {
  id: string
  rating: number
  content: string
  language: string
  approved?: boolean
  created_at: string
  sentiment?: ReviewSentiment
  flagged?: boolean
  verified_partner?: boolean
  partner_name?: string | null
  product_name?: string | null
  service_name?: string | null
}

const localeLabels: Record<ReviewLocale, string> = {
  en: 'English',
  es: 'Español',
  pt: 'Português',
  pl: 'Polski',
  ru: 'Русский',
}

const localeFlags: Record<ReviewLocale, string> = {
  en: '🇺🇸',
  es: '🇪🇸',
  pt: '🇵🇹',
  pl: '🇵🇱',
  ru: '🇷🇺',
}

const localeDateFormats: Record<ReviewLocale, string> = {
  en: 'en-US',
  es: 'es-ES',
  pt: 'pt-PT',
  pl: 'pl-PL',
  ru: 'ru-RU',
}

const localeCurrencies: Record<ReviewLocale, { locale: string; currency: string }> = {
  en: { locale: 'en-US', currency: 'USD' },
  es: { locale: 'es-ES', currency: 'EUR' },
  pt: { locale: 'pt-PT', currency: 'EUR' },
  pl: { locale: 'pl-PL', currency: 'PLN' },
  ru: { locale: 'ru-RU', currency: 'RUB' },
}

const positiveWords = [
  'amazing', 'excellent', 'great', 'love', 'happy', 'fast', 'clear', 'positive', 'best', 'ótimo', 'excelente', 'rápida', 'positivos',
  'clara', 'rápido', 'świetny', 'przydatny', 'хорош', 'отлич', 'красивый', 'excelente', 'claro',
]

const negativeWords = [
  'bad', 'slow', 'angry', 'hate', 'terrible', 'inappropriate', 'spam', 'fraud', 'awful', 'lento', 'problema', 'ruim',
  'malo', 'mal', 'wolno', 'szybciej', 'ужас', 'медленно', 'плохо', 'нужна помощь',
]

const moderationWords = ['spam', 'fraud', 'hate', 'abuse', 'inappropriate', 'scam', 'violent', 'нецензур', 'oszustwo']

export function normalizeReviewLocale(locale?: string): ReviewLocale {
  const code = String(locale || 'en').toLowerCase().split('-')[0]
  return REVIEW_LOCALES.includes(code as ReviewLocale) ? code as ReviewLocale : 'en'
}

export function getLocaleLabel(locale?: string): string {
  return localeLabels[normalizeReviewLocale(locale)]
}

export function getFlagForLocale(locale?: string): string {
  return localeFlags[normalizeReviewLocale(locale)]
}

export function formatReviewDate(iso: string, locale?: string): string {
  const reviewLocale = normalizeReviewLocale(locale)
  return new Intl.DateTimeFormat(localeDateFormats[reviewLocale], {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(iso))
}

export function formatReviewCurrency(amount: number, locale?: string): string {
  const reviewLocale = normalizeReviewLocale(locale)
  const config = localeCurrencies[reviewLocale]
  return new Intl.NumberFormat(config.locale, {
    style: 'currency',
    currency: config.currency,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function analyzeReviewSentiment(content: string, rating: number): ReviewSentiment {
  const text = content.toLowerCase()
  const positiveScore = positiveWords.filter(word => text.includes(word)).length
  const negativeScore = negativeWords.filter(word => text.includes(word)).length
  const ratingScore = rating >= 4 ? 1 : rating <= 2 ? -1 : 0
  const score = positiveScore - negativeScore + ratingScore
  if (score > 0) return 'positive'
  if (score < 0) return 'negative'
  return 'neutral'
}

export function reviewMatchesModerationFlag(content: string): boolean {
  const text = content.toLowerCase()
  return moderationWords.some(word => text.includes(word))
}

export function getSentimentBadge(sentiment: ReviewSentiment) {
  if (sentiment === 'positive') return { label: 'Positive', color: '#4ade80' }
  if (sentiment === 'negative') return { label: 'Negative', color: '#f87171' }
  return { label: 'Neutral', color: '#ffc300' }
}

export function sortReviews<T extends ReviewRecord>(reviews: T[], mode: ReviewSortMode): T[] {
  return [...reviews].sort((a, b) => {
    if (mode === 'date') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    if (mode === 'rating') return b.rating - a.rating || new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    const score = (review: T) =>
      review.rating * 10 +
      (review.verified_partner ? 8 : 0) +
      (review.approved ? 4 : 0) +
      (review.sentiment === 'positive' ? 3 : review.sentiment === 'negative' ? -3 : 0) +
      Math.max(0, 5 - Math.floor((Date.now() - new Date(review.created_at).getTime()) / 86_400_000))
    return score(b) - score(a)
  })
}

export function summarizeLocaleTelemetry(reviews: ReviewRecord[]) {
  const total = Math.max(1, reviews.length)
  return REVIEW_LOCALES.map(locale => {
    const count = reviews.filter(review => normalizeReviewLocale(review.language) === locale).length
    return { locale, count, percentage: Math.round((count / total) * 100) }
  })
}

export function summarizeSentimentTrend(reviews: ReviewRecord[]) {
  const total = Math.max(1, reviews.length)
  return (['positive', 'neutral', 'negative'] as ReviewSentiment[]).map(sentiment => {
    const count = reviews.filter(review => (review.sentiment ?? analyzeReviewSentiment(review.content, review.rating)) === sentiment).length
    return { sentiment, count, percentage: Math.round((count / total) * 100) }
  })
}

export function buildModerationSuggestion(review: Pick<ReviewRecord, 'rating' | 'content' | 'flagged' | 'sentiment'>): string {
  if (review.flagged || reviewMatchesModerationFlag(review.content)) return 'Concierge suggestion: hold for admin review and request a policy check before publishing.'
  const sentiment = review.sentiment ?? analyzeReviewSentiment(review.content, review.rating)
  if (sentiment === 'negative') return 'Concierge suggestion: respond privately, create a recovery task, and keep unpublished until resolved.'
  if (sentiment === 'positive') return 'Concierge suggestion: approve, request media consent, and offer Outreach a testimonial campaign.'
  return 'Concierge suggestion: approve if factual, or ask the customer for more detail.'
}

export function buildTestimonialCampaign(review: Pick<ReviewRecord, 'partner_name' | 'product_name' | 'service_name' | 'language' | 'rating'>): string {
  const source = review.partner_name || review.product_name || review.service_name || 'customer review'
  return `Outreach trigger: ${review.rating}★ ${source} review can become a ${normalizeReviewLocale(review.language).toUpperCase()} testimonial campaign in CRM.`
}

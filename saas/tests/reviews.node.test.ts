import assert from 'node:assert/strict'
import test from 'node:test'
import {
  REVIEW_LOCALES,
  analyzeReviewSentiment,
  buildModerationSuggestion,
  buildTestimonialCampaign,
  formatReviewCurrency,
  formatReviewDate,
  getFlagForLocale,
  normalizeReviewLocale,
  reviewMatchesModerationFlag,
  sortReviews,
  summarizeLocaleTelemetry,
  summarizeSentimentTrend,
} from '../lib/reviews.ts'

test('review submission metadata supports all five locales with flags and LTR-safe normalization', () => {
  assert.deepEqual(REVIEW_LOCALES, ['en', 'es', 'pt', 'pl', 'ru'])
  for (const locale of REVIEW_LOCALES) {
    assert.equal(normalizeReviewLocale(`${locale}-${locale.toUpperCase()}`), locale)
    assert.ok(getFlagForLocale(locale).length > 0)
  }
})

test('i18n validation formats dates and currency per locale', () => {
  const iso = '2026-05-29T12:00:00.000Z'
  assert.equal(formatReviewDate(iso, 'en'), '05/29/2026')
  assert.equal(formatReviewDate(iso, 'es'), '29/05/2026')
  assert.equal(formatReviewDate(iso, 'pt'), '29/05/2026')
  assert.match(formatReviewCurrency(1200, 'en'), /\$|US\$/)
  assert.match(formatReviewCurrency(1200, 'pl'), /zł/)
})

test('sentiment analysis labels positive, neutral, and negative reviews', () => {
  assert.equal(analyzeReviewSentiment('Excellent fast support and amazing results', 5), 'positive')
  assert.equal(analyzeReviewSentiment('It was acceptable and complete', 3), 'neutral')
  assert.equal(analyzeReviewSentiment('Slow terrible experience', 1), 'negative')
})

test('moderation workflow flags inappropriate content and suggests admin actions', () => {
  assert.equal(reviewMatchesModerationFlag('This looks like spam and fraud'), true)
  const suggestion = buildModerationSuggestion({ rating: 1, content: 'spam fraud', flagged: true, sentiment: 'negative' })
  assert.match(suggestion, /hold for admin review/i)
})

test('sorting and filters support relevance, date, rating, locale telemetry, and sentiment charts', () => {
  const reviews = [
    { id: 'old', rating: 5, content: 'Excellent', language: 'en', approved: true, verified_partner: true, sentiment: 'positive' as const, created_at: '2026-05-01T00:00:00.000Z' },
    { id: 'new', rating: 2, content: 'Slow', language: 'es', approved: false, sentiment: 'negative' as const, created_at: '2026-05-29T00:00:00.000Z' },
    { id: 'mid', rating: 4, content: 'Good', language: 'pt', approved: true, sentiment: 'positive' as const, created_at: '2026-05-20T00:00:00.000Z' },
  ]
  assert.equal(sortReviews(reviews, 'date')[0].id, 'new')
  assert.equal(sortReviews(reviews, 'rating')[0].id, 'old')
  assert.equal(sortReviews(reviews, 'relevance')[0].id, 'old')
  assert.equal(summarizeLocaleTelemetry(reviews).find(item => item.locale === 'es')?.count, 1)
  assert.equal(summarizeSentimentTrend(reviews).find(item => item.sentiment === 'positive')?.count, 2)
})

test('outreach testimonial campaigns integrate positive reviews with CRM pipeline language', () => {
  const campaign = buildTestimonialCampaign({ partner_name: 'Lisboa Local', product_name: 'Outreach', service_name: null, language: 'pt', rating: 5, id: 'x', content: '', created_at: '2026-05-29' })
  assert.match(campaign, /testimonial campaign/i)
  assert.match(campaign, /CRM/i)
})

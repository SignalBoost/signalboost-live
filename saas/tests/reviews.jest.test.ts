import {
  REVIEW_LOCALES,
  analyzeReviewSentiment,
  buildModerationSuggestion,
  buildTestimonialCampaign,
  formatReviewCurrency,
  formatReviewDate,
} from '../lib/reviews'

describe('Reviews SaaS module', () => {
  test('supports review submission metadata in all 5 languages', () => {
    expect(REVIEW_LOCALES).toEqual(['en', 'es', 'pt', 'pl', 'ru'])
  })

  test('validates sentiment accuracy fixtures', () => {
    expect(analyzeReviewSentiment('Excellent fast support', 5)).toBe('positive')
    expect(analyzeReviewSentiment('Acceptable complete service', 3)).toBe('neutral')
    expect(analyzeReviewSentiment('Slow terrible service', 1)).toBe('negative')
  })

  test('covers moderation workflow and CRM testimonial regression', () => {
    expect(buildModerationSuggestion({ rating: 1, content: 'spam fraud', flagged: true, sentiment: 'negative' })).toMatch(/admin review/i)
    expect(buildTestimonialCampaign({ partner_name: 'Northstar', product_name: null, service_name: null, language: 'en', rating: 5 })).toMatch(/CRM/)
  })

  test('formats i18n dates and currency', () => {
    expect(formatReviewDate('2026-05-29T12:00:00.000Z', 'en')).toBe('05/29/2026')
    expect(formatReviewDate('2026-05-29T12:00:00.000Z', 'es')).toBe('29/05/2026')
    expect(formatReviewCurrency(1200, 'pt')).toMatch(/€/)
  })
})

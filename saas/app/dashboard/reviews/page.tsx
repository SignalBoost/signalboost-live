'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'
import {
  REVIEW_LOCALES,
  analyzeReviewSentiment,
  buildModerationSuggestion,
  buildTestimonialCampaign,
  formatReviewCurrency,
  formatReviewDate,
  getFlagForLocale,
  getLocaleLabel,
  getSentimentBadge,
  normalizeReviewLocale,
  reviewMatchesModerationFlag,
  sortReviews,
  summarizeLocaleTelemetry,
  summarizeSentimentTrend,
  type ReviewLocale,
  type ReviewSortMode,
  type ReviewSentiment,
} from '@/lib/reviews'

const GREEN = '#4ade80'
const RED = '#f87171'
const CYAN = '#1af0ff'
const GOLD = '#ffc300'

type Review = {
  id: string
  author_name: string
  author_email: string
  rating: number
  content: string
  language: string
  approved: boolean
  created_at: string
  sentiment?: ReviewSentiment
  verified_partner?: boolean
  partner_name?: string | null
  product_name?: string | null
  service_name?: string | null
  media_urls?: string[]
  flagged?: boolean
  moderation_status?: 'pending' | 'approved' | 'rejected' | 'flagged'
}

type SlugState =
  | { kind: 'loading' }
  | { kind: 'none' }
  | { kind: 'set', slug: string }

const SAMPLE_REVIEWS: Review[] = [
  {
    id: 'sample-en',
    author_name: 'Ava Morgan',
    author_email: 'ava@example.com',
    rating: 5,
    content: 'SignalBoost helped our studio collect proof, translate questions for customers, and turn happy reviews into a campaign in one afternoon.',
    language: 'en',
    approved: true,
    created_at: '2026-05-29T10:30:00.000Z',
    verified_partner: true,
    partner_name: 'Northstar Studio',
    product_name: 'Concierge Launch',
    media_urls: ['https://signalboostapp.com/review-assets/northstar.jpg'],
  },
  {
    id: 'sample-es',
    author_name: 'Lucía Santos',
    author_email: 'lucia@example.com',
    rating: 4,
    content: 'La experiencia fue clara y rápida. Me gustaría ver más plantillas, pero el soporte en español fue excelente.',
    language: 'es',
    approved: false,
    created_at: '2026-05-28T14:00:00.000Z',
    partner_name: 'Madrid Growth Lab',
    service_name: 'Review collector',
  },
  {
    id: 'sample-pt',
    author_name: 'Rafael Costa',
    author_email: 'rafael@example.com',
    rating: 5,
    content: 'Ótimo produto, atendimento excelente e campanhas automáticas com depoimentos positivos.',
    language: 'pt',
    approved: true,
    created_at: '2026-05-27T09:00:00.000Z',
    verified_partner: true,
    partner_name: 'Lisboa Local',
    product_name: 'Outreach Engine',
  },
  {
    id: 'sample-pl',
    author_name: 'Maja Nowak',
    author_email: 'maja@example.com',
    rating: 3,
    content: 'Panel jest przydatny, ale kolejka moderacji mogłaby działać szybciej.',
    language: 'pl',
    approved: false,
    created_at: '2026-05-26T12:00:00.000Z',
    product_name: 'Admin Console',
  },
  {
    id: 'sample-ru',
    author_name: 'Игорь Волков',
    author_email: 'igor@example.com',
    rating: 2,
    content: 'Интерфейс красивый, но кампания запустилась медленно и нужна помощь модератора.',
    language: 'ru',
    approved: false,
    created_at: '2026-05-25T16:00:00.000Z',
    flagged: true,
    moderation_status: 'flagged',
    service_name: 'Campaign review',
  },
]

const translationPreview: Record<ReviewLocale, string> = {
  en: 'AI translation is ready on demand in the selected workspace language.',
  es: 'La traducción con IA está lista bajo demanda en el idioma seleccionado.',
  pt: 'A tradução por IA está pronta sob demanda no idioma selecionado.',
  pl: 'Tłumaczenie AI jest dostępne na żądanie w wybranym języku.',
  ru: 'ИИ-перевод доступен по запросу на выбранном языке.',
}

export default function ReviewsPage() {
  const { dict, lang } = useI18n()
  const activeLocale = normalizeReviewLocale(lang)

  const [reviews, setReviews] = useState<Review[]>([])
  const [reviewsLoading, setReviewsLoading] = useState(true)
  const [reviewsError, setReviewsError] = useState<string | null>(null)

  const [slug, setSlug] = useState<SlugState>({ kind: 'loading' })
  const [slugDraft, setSlugDraft] = useState('')
  const [slugSaving, setSlugSaving] = useState(false)
  const [slugError, setSlugError] = useState<string | null>(null)

  const [copied, setCopied] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'flagged'>('all')
  const [languageFilter, setLanguageFilter] = useState<'all' | ReviewLocale>('all')
  const [partnerFilter, setPartnerFilter] = useState('all')
  const [productFilter, setProductFilter] = useState('all')
  const [sortMode, setSortMode] = useState<ReviewSortMode>('relevance')
  const [translatedReviewId, setTranslatedReviewId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/profile/slug')
      .then(r => r.json())
      .then(j => {
        if (cancelled) return
        if (j?.slug) setSlug({ kind: 'set', slug: j.slug })
        else setSlug({ kind: 'none' })
      })
      .catch(() => { if (!cancelled) setSlug({ kind: 'none' }) })
    return () => { cancelled = true }
  }, [])

  const loadReviews = useCallback(async () => {
    setReviewsLoading(true)
    setReviewsError(null)
    try {
      const res = await fetch('/api/reviews')
      if (res.status === 401) {
        setReviewsError(t(dict, 'reviews_page.errSignIn', 'Please sign in to see your reviews. Showing demo telemetry.'))
        setReviews(SAMPLE_REVIEWS)
        return
      }
      const j = await res.json()
      if (!res.ok) {
        setReviewsError(j?.error || t(dict, 'reviews_page.errLoad', 'Could not load reviews. Showing demo telemetry.'))
        setReviews(SAMPLE_REVIEWS)
        return
      }
      const incoming = (j.reviews ?? []) as Review[]
      setReviews(incoming.length ? incoming : SAMPLE_REVIEWS)
    } catch {
      setReviewsError(t(dict, 'reviews_page.errLoad', 'Could not load reviews. Showing demo telemetry.'))
      setReviews(SAMPLE_REVIEWS)
    } finally {
      setReviewsLoading(false)
    }
  }, [dict])

  useEffect(() => { loadReviews() }, [loadReviews])

  async function saveSlug() {
    const candidate = slugDraft.trim().toLowerCase()
    if (!candidate) { setSlugError(t(dict, 'reviews_page.errPickHandle', 'Pick a handle to continue.')); return }
    setSlugSaving(true)
    setSlugError(null)
    try {
      const res = await fetch('/api/profile/slug', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: candidate }),
      })
      const j = await res.json()
      if (!res.ok) { setSlugError(j?.error || t(dict, 'reviews_page.errSaveHandle', 'Could not save handle.')); return }
      setSlug({ kind: 'set', slug: j.slug })
      setSlugDraft('')
    } catch {
      setSlugError(t(dict, 'reviews_page.errSaveHandle', 'Could not save handle.'))
    } finally {
      setSlugSaving(false)
    }
  }

  async function patchReview(id: string, patch: Partial<Review>) {
    setReviews(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))
    if (id.startsWith('sample-')) return
    try {
      const res = await fetch(`/api/reviews?id=${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) loadReviews()
    } catch {
      loadReviews()
    }
  }

  async function deleteReview(id: string) {
    if (!confirm(t(dict, 'reviews_page.confirmDelete', 'Delete this review? This cannot be undone.'))) return
    const snapshot = reviews
    setReviews(prev => prev.filter(r => r.id !== id))
    if (id.startsWith('sample-')) return
    try {
      const res = await fetch(`/api/reviews?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!res.ok) setReviews(snapshot)
    } catch {
      setReviews(snapshot)
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const enrichedReviews = useMemo(() => reviews.map(review => {
    const sentiment = review.sentiment ?? analyzeReviewSentiment(review.content, review.rating)
    const flagged = review.flagged || reviewMatchesModerationFlag(review.content)
    return {
      ...review,
      language: normalizeReviewLocale(review.language),
      sentiment,
      flagged,
      moderation_status: review.moderation_status ?? (flagged ? 'flagged' : review.approved ? 'approved' : 'pending'),
    }
  }), [reviews])

  const partners = Array.from(new Set(enrichedReviews.map(r => r.partner_name).filter(Boolean))) as string[]
  const products = Array.from(new Set(enrichedReviews.map(r => r.product_name || r.service_name).filter(Boolean))) as string[]

  const filteredReviews = enrichedReviews.filter(r => {
    if (statusFilter === 'pending' && r.approved) return false
    if (statusFilter === 'approved' && !r.approved) return false
    if (statusFilter === 'flagged' && !r.flagged) return false
    if (languageFilter !== 'all' && r.language !== languageFilter) return false
    if (partnerFilter !== 'all' && r.partner_name !== partnerFilter) return false
    if (productFilter !== 'all' && (r.product_name || r.service_name) !== productFilter) return false
    return true
  })

  const visibleReviews = sortReviews(filteredReviews, sortMode)
  const approvedCount = enrichedReviews.filter(r => r.approved).length
  const pendingCount = enrichedReviews.length - approvedCount
  const flaggedCount = enrichedReviews.filter(r => r.flagged).length
  const avgRating = enrichedReviews.length ? enrichedReviews.reduce((sum, r) => sum + r.rating, 0) / enrichedReviews.length : 0
  const localeTelemetry = summarizeLocaleTelemetry(enrichedReviews)
  const sentimentTrend = summarizeSentimentTrend(enrichedReviews)
  const positiveCampaigns = enrichedReviews.filter(r => r.sentiment === 'positive' && r.rating >= 4).map(buildTestimonialCampaign).slice(0, 3)

  const reviewLink = slug.kind === 'set'
    ? `https://saas.signalboostapp.com/review/${slug.slug}`
    : ''

  const summaryLine = enrichedReviews.length === 0
    ? t(dict, 'reviews_page.summaryEmpty', 'Nothing yet. Share the link above to start.')
    : `${enrichedReviews.length} ${t(dict, 'reviews_page.total', 'total')} · ${pendingCount} ${t(dict, 'reviews_page.pending', 'pending')} · ${approvedCount} ${t(dict, 'reviews_page.approved', 'approved')} · ${flaggedCount} ${t(dict, 'reviews_page.flagged', 'flagged')} · ${avgRating.toFixed(1)} ★ ${t(dict, 'reviews_page.avg', 'avg')}`

  return (
    <div className="sb-reviews-page" style={{ color: 'var(--text-primary)' }}>
      <section className="sb-reviews-hero" aria-label="Reviews module wireframe preview">
        <div>
          <p className="sb-eyebrow">⭐ {t(dict, 'reviews_page.kicker', 'Reviews command center')}</p>
          <h1>{t(dict, 'reviews_page.title', 'Review collector')}</h1>
          <p>{t(dict, 'reviews_page.subtitle', 'Collect multilingual reviews, approve what publishes, monitor sentiment, and launch testimonial campaigns from one neon cockpit.')}</p>
          <div className="sb-review-hero-actions">
            <a href="#submit-review" className="sb-button-primary">{t(dict, 'reviews_page.shareCta', 'Share review link')}</a>
            <a href="#admin-console" className="sb-button-secondary">{t(dict, 'reviews_page.adminCta', 'View admin telemetry')}</a>
          </div>
        </div>
        <div className="sb-review-wireframe" aria-hidden="true">
          <span>Submission</span><span>→</span><span>AI sentiment</span><span>→</span><span>Moderation</span><span>→</span><span>Outreach</span>
        </div>
      </section>

      {reviewsError && <div className="sb-review-alert">{reviewsError}</div>}

      <section id="submit-review" className="sb-review-grid">
        <article className="sb-review-panel sb-review-panel--wide">
          <div className="sb-review-panel-header">
            <div>
              <p className="sb-eyebrow">{t(dict, 'reviews_page.sendLinkTitle', 'Send this link to your customers')}</p>
              <h2>{t(dict, 'reviews_page.submissionTitle', 'Localized review submission')}</h2>
            </div>
            <span className="sb-review-pill">LTR · {getLocaleLabel(activeLocale)}</span>
          </div>
          <p className="sb-caption">{t(dict, 'reviews_page.sendLinkDesc', 'They click it, leave a review in their own language, attach images, and it appears as Pending until approval.')}</p>

          {slug.kind === 'loading' && <div className="sb-review-empty">{t(dict, 'reviews_page.loading', 'Loading…')}</div>}

          {slug.kind === 'none' && (
            <div className="sb-review-link-builder">
              <p>{t(dict, 'reviews_page.pickHandleDesc', 'Pick a handle for your review link. It can be your name, your business, anything — 3 to 30 lowercase letters, digits, and hyphens.')}</p>
              <div>
                <span>signalboostapp.com/review/</span>
                <input value={slugDraft} onChange={e => setSlugDraft(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} placeholder={t(dict, 'reviews_page.handlePlaceholder', 'your-handle')} maxLength={30} onKeyDown={e => e.key === 'Enter' && saveSlug()} />
                <button onClick={saveSlug} disabled={slugSaving || !slugDraft.trim()}>{slugSaving ? t(dict, 'reviews_page.saving', 'Saving…') : t(dict, 'reviews_page.claim', 'Claim')}</button>
              </div>
              {slugError && <small>{slugError}</small>}
            </div>
          )}

          {slug.kind === 'set' && (
            <div className="sb-review-link-copy">
              <code>{reviewLink}</code>
              <button onClick={() => copyToClipboard(reviewLink)}>{copied ? `✓ ${t(dict, 'reviews_page.copied', 'Copied')}` : t(dict, 'reviews_page.copyLink', 'Copy link')}</button>
              <a href={reviewLink} target="_blank" rel="noopener noreferrer">{t(dict, 'reviews_page.openNewTab', 'Open in new tab')} ↗</a>
            </div>
          )}

          <div className="sb-review-submission-preview">
            <div className="sb-stars" aria-label="5 star rating">★★★★★</div>
            <p>{t(dict, 'reviews_page.previewText', 'Customer text keeps its original language. Dates and currency render per locale:')}</p>
            <strong>{formatReviewDate('2026-05-29T10:30:00.000Z', activeLocale)} · {formatReviewCurrency(2499, activeLocale)}</strong>
            <label>
              {t(dict, 'reviews_page.mediaLabel', 'Optional image attachments')}
              <input type="file" accept="image/*" multiple aria-label={t(dict, 'reviews_page.mediaLabel', 'Optional image attachments')} />
            </label>
          </div>
        </article>

        <aside className="sb-review-panel">
          <p className="sb-eyebrow">{t(dict, 'reviews_page.conciergeTitle', 'Concierge AI')}</p>
          <h2>{t(dict, 'reviews_page.conciergeHeadline', 'Review-aware recommendations')}</h2>
          <p>{t(dict, 'reviews_page.conciergeBody', 'Concierge answers review questions in the selected language, suggests moderation actions, and proposes campaigns when sentiment is positive.')}</p>
          <div className="sb-review-ai-card">{positiveCampaigns[0] ?? t(dict, 'reviews_page.noCampaigns', 'Positive reviews will trigger testimonial campaign ideas here.')}</div>
        </aside>
      </section>

      <section className="sb-review-controls" aria-label="Review filters and sorting">
        <div>
          <h2>{t(dict, 'reviews_page.yourReviews', 'Your reviews')}</h2>
          <p>{reviewsLoading ? t(dict, 'reviews_page.loading', 'Loading…') : summaryLine}</p>
        </div>
        <div className="sb-review-control-row">
          <select value={sortMode} onChange={e => setSortMode(e.target.value as ReviewSortMode)} aria-label="Sort reviews">
            <option value="relevance">{t(dict, 'reviews_page.sortRelevance', 'Sort: relevance')}</option>
            <option value="date">{t(dict, 'reviews_page.sortDate', 'Sort: newest')}</option>
            <option value="rating">{t(dict, 'reviews_page.sortRating', 'Sort: rating')}</option>
          </select>
          <select value={languageFilter} onChange={e => setLanguageFilter(e.target.value as 'all' | ReviewLocale)} aria-label="Filter by language">
            <option value="all">{t(dict, 'reviews_page.allLanguages', 'All languages')}</option>
            {REVIEW_LOCALES.map(locale => <option key={locale} value={locale}>{getFlagForLocale(locale)} {getLocaleLabel(locale)}</option>)}
          </select>
          <select value={partnerFilter} onChange={e => setPartnerFilter(e.target.value)} aria-label="Filter by partner">
            <option value="all">{t(dict, 'reviews_page.allPartners', 'All partners')}</option>
            {partners.map(partner => <option key={partner} value={partner}>{partner}</option>)}
          </select>
          <select value={productFilter} onChange={e => setProductFilter(e.target.value)} aria-label="Filter by product or service">
            <option value="all">{t(dict, 'reviews_page.allProducts', 'All products/services')}</option>
            {products.map(product => <option key={product} value={product}>{product}</option>)}
          </select>
        </div>
        <div className="sb-review-tabs">
          {([
            { id: 'all', label: `${t(dict, 'reviews_page.filterAll', 'All')} (${enrichedReviews.length})` },
            { id: 'pending', label: `${t(dict, 'reviews_page.filterPending', 'Pending')} (${pendingCount})` },
            { id: 'approved', label: `${t(dict, 'reviews_page.filterApproved', 'Approved')} (${approvedCount})` },
            { id: 'flagged', label: `${t(dict, 'reviews_page.filterFlagged', 'Flagged')} (${flaggedCount})` },
          ] as const).map(tab => <button key={tab.id} onClick={() => setStatusFilter(tab.id)} className={statusFilter === tab.id ? 'is-active' : ''}>{tab.label}</button>)}
        </div>
      </section>

      <section className="sb-review-feed" aria-label="Review cards">
        {visibleReviews.map(review => {
          const badge = getSentimentBadge(review.sentiment ?? 'neutral')
          const moderationSuggestion = buildModerationSuggestion(review)
          return (
            <article key={review.id} className="sb-review-card">
              <div className="sb-review-card-top">
                <div>
                  <h3>{getFlagForLocale(review.language)} {review.author_name}</h3>
                  <span>{getLocaleLabel(review.language)} · {formatReviewDate(review.created_at, review.language)} · {(review.product_name || review.service_name || t(dict, 'reviews_page.generalService', 'General service'))}</span>
                </div>
                <div className="sb-stars" aria-label={`${review.rating} stars`}>{'★'.repeat(review.rating)}<span>{'★'.repeat(5 - review.rating)}</span></div>
              </div>
              <p>{review.content}</p>
              {translatedReviewId === review.id && <blockquote>{translationPreview[activeLocale]}</blockquote>}
              <div className="sb-review-card-meta">
                <span style={{ borderColor: badge.color, color: badge.color }}>{badge.label}</span>
                {review.verified_partner && <span className="verified">✓ {t(dict, 'reviews_page.verifiedPartner', 'Verified partner')}</span>}
                {review.flagged && <span className="flagged">⚑ {t(dict, 'reviews_page.flagged', 'Flagged')}</span>}
                {(review.media_urls?.length ?? 0) > 0 && <span>🖼 {review.media_urls?.length} {t(dict, 'reviews_page.media', 'media')}</span>}
              </div>
              <div className="sb-review-actions">
                <button onClick={() => patchReview(review.id, { approved: !review.approved, moderation_status: !review.approved ? 'approved' : 'pending' })}>{review.approved ? t(dict, 'reviews_page.unpublish', 'Unpublish') : t(dict, 'reviews_page.approve', 'Approve')}</button>
                <button onClick={() => patchReview(review.id, { flagged: !review.flagged, moderation_status: !review.flagged ? 'flagged' : 'pending' })}>{review.flagged ? t(dict, 'reviews_page.unflag', 'Clear flag') : t(dict, 'reviews_page.flag', 'Flag')}</button>
                <button onClick={() => setTranslatedReviewId(translatedReviewId === review.id ? null : review.id)}>{t(dict, 'reviews_page.translate', 'AI translate')}</button>
                <button onClick={() => deleteReview(review.id)}>{t(dict, 'reviews_page.delete', 'Delete')}</button>
              </div>
              <small>{moderationSuggestion}</small>
            </article>
          )
        })}
      </section>

      <section id="admin-console" className="sb-admin-review-console" aria-label="Admin Console reviews telemetry">
        <div className="sb-review-panel-header">
          <div>
            <p className="sb-eyebrow">{t(dict, 'reviews_page.adminConsole', 'Admin Console')}</p>
            <h2>{t(dict, 'reviews_page.telemetryTitle', 'Reviews telemetry, sentiment, and moderation')}</h2>
          </div>
          <span className="sb-review-pill">{t(dict, 'reviews_page.logsEnabled', 'Submissions · AI sentiment · moderation logged')}</span>
        </div>
        <div className="sb-admin-review-grid">
          <article className="sb-review-panel">
            <h3>{t(dict, 'reviews_page.localeVolume', 'Review volume per locale')}</h3>
            {localeTelemetry.map(item => <div key={item.locale} className="sb-bar"><span>{getFlagForLocale(item.locale)} {item.locale.toUpperCase()}</span><i style={{ width: `${Math.max(8, item.percentage)}%`, background: CYAN }} /><strong>{item.count}</strong></div>)}
          </article>
          <article className="sb-review-panel">
            <h3>{t(dict, 'reviews_page.sentimentTrend', 'Sentiment trend')}</h3>
            {sentimentTrend.map(item => <div key={item.sentiment} className="sb-bar"><span>{item.sentiment}</span><i style={{ width: `${Math.max(8, item.percentage)}%`, background: item.sentiment === 'positive' ? GREEN : item.sentiment === 'negative' ? RED : GOLD }} /><strong>{item.count}</strong></div>)}
          </article>
          <article className="sb-review-panel">
            <h3>{t(dict, 'reviews_page.moderationQueue', 'Moderation queue')}</h3>
            {enrichedReviews.filter(r => !r.approved || r.flagged).slice(0, 5).map(review => <p key={review.id}><strong>{review.author_name}</strong> · {review.moderation_status} · {buildModerationSuggestion(review)}</p>)}
          </article>
          <article className="sb-review-panel">
            <h3>{t(dict, 'reviews_page.outreachHooks', 'Outreach + CRM hooks')}</h3>
            {positiveCampaigns.map(campaign => <p key={campaign}>• {campaign}</p>)}
            <p>• {t(dict, 'reviews_page.crmRegression', 'Regression guard: approved positive reviews can attach to Leads → Opportunities → Conversions.')}</p>
          </article>
        </div>
      </section>
    </div>
  )
}

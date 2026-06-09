'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
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

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'
const COPY: Record<string, Record<Lang, string>> = {
  kicker:           { en: 'Reviews command center', es: 'Centro de mando de reseñas', pt: 'Central de avaliações', pl: 'Centrum zarządzania opiniami', ru: 'Центр управления отзывами' },
  title:            { en: 'Review collector', es: 'Colector de reseñas', pt: 'Coletor de avaliações', pl: 'Kolektor opinii', ru: 'Сборщик отзывов' },
  subtitle:         { en: 'Collect multilingual reviews, approve what publishes, and monitor sentiment.', es: 'Recopila reseñas multilingües, aprueba lo que se publica y monitorea el sentimiento.', pt: 'Colete avaliações multilíngues, aprove o que publica e monitore sentimentos.', pl: 'Zbieraj wielojęzyczne opinie, zatwierdzaj publikacje i monitoruj nastroje.', ru: 'Собирайте многоязычные отзывы, одобряйте публикации и отслеживайте настроения.' },
  shareCta:         { en: 'Share review link', es: 'Compartir enlace de reseña', pt: 'Compartilhar link de avaliação', pl: 'Udostępnij link do opinii', ru: 'Поделиться ссылкой' },
  adminCta:         { en: 'View admin telemetry', es: 'Ver telemetría', pt: 'Ver telemetria', pl: 'Zobacz telemetrię', ru: 'Просмотр телеметрии' },
  sendLinkTitle:    { en: 'Send this link to your customers', es: 'Envía este enlace a tus clientes', pt: 'Envie este link para seus clientes', pl: 'Wyślij ten link swoim klientom', ru: 'Отправьте эту ссылку своим клиентам' },
  submissionTitle:  { en: 'Localized review submission', es: 'Envío de reseña localizada', pt: 'Envio de avaliação localizada', pl: 'Lokalizowane przesyłanie opinii', ru: 'Локализованная отправка отзыва' },
  sendLinkDesc:     { en: 'They click it, leave a review in their own language, attach images, and it appears as Pending until approval.', es: 'Hacen clic, dejan una reseña en su idioma, adjuntan imágenes y aparece como Pendiente.', pt: 'Eles clicam, deixam uma avaliação no seu idioma, anexam imagens e aparece como Pendente.', pl: 'Klikają, zostawiają opinię w swoim języku, dołączają zdjęcia — pojawia się jako Oczekująca.', ru: 'Они нажимают, оставляют отзыв на своём языке — он появляется как Ожидающий.' },
  loading:          { en: 'Loading…', es: 'Cargando…', pt: 'Carregando…', pl: 'Ładowanie…', ru: 'Загрузка…' },
  pickHandleDesc:   { en: 'Pick a handle for your review link — 3 to 30 lowercase letters, digits, and hyphens.', es: 'Elige un identificador — 3 a 30 letras minúsculas, dígitos y guiones.', pt: 'Escolha um identificador — 3 a 30 letras minúsculas, dígitos e hífens.', pl: 'Wybierz identyfikator — 3 do 30 małych liter, cyfr i myślników.', ru: 'Выберите идентификатор — 3–30 строчных букв, цифр и дефисов.' },
  handlePlaceholder:{ en: 'your-handle', es: 'tu-identificador', pt: 'seu-identificador', pl: 'twoj-identyfikator', ru: 'ваш-идентификатор' },
  saving:           { en: 'Saving…', es: 'Guardando…', pt: 'Salvando…', pl: 'Zapisywanie…', ru: 'Сохранение…' },
  claim:            { en: 'Claim', es: 'Reclamar', pt: 'Reivindicar', pl: 'Zarezerwuj', ru: 'Занять' },
  copied:           { en: 'Copied', es: 'Copiado', pt: 'Copiado', pl: 'Skopiowano', ru: 'Скопировано' },
  copyLink:         { en: 'Copy link', es: 'Copiar enlace', pt: 'Copiar link', pl: 'Kopiuj link', ru: 'Копировать ссылку' },
  openNewTab:       { en: 'Open in new tab', es: 'Abrir en nueva pestaña', pt: 'Abrir em nova aba', pl: 'Otwórz w nowej karcie', ru: 'Открыть в новой вкладке' },
  previewText:      { en: 'Customer text keeps its original language. Dates and currency render per locale:', es: 'El texto del cliente mantiene su idioma original:', pt: 'O texto do cliente mantém seu idioma original:', pl: 'Tekst klienta zachowuje oryginalny język:', ru: 'Текст клиента сохраняет оригинальный язык:' },
  mediaLabel:       { en: 'Optional image attachments', es: 'Archivos de imagen opcionales', pt: 'Anexos de imagem opcionais', pl: 'Opcjonalne załączniki obrazów', ru: 'Необязательные вложения изображений' },
  conciergeTitle:   { en: 'Concierge AI', es: 'Concierge IA', pt: 'Concierge IA', pl: 'Concierge AI', ru: 'Консьерж ИИ' },
  conciergeHeadline:{ en: 'Review-aware recommendations', es: 'Recomendaciones basadas en reseñas', pt: 'Recomendações baseadas em avaliações', pl: 'Rekomendacje oparte na opiniach', ru: 'Рекомендации на основе отзывов' },
  conciergeBody:    { en: 'Concierge suggests moderation actions and proposes campaigns when sentiment is positive.', es: 'El Concierge sugiere acciones de moderación y propone campañas cuando el sentimiento es positivo.', pt: 'O Concierge sugere ações de moderação e propõe campanhas quando o sentimento é positivo.', pl: 'Concierge sugeruje działania moderacyjne i proponuje kampanie gdy nastroje są pozytywne.', ru: 'Консьерж предлагает действия модерации и кампании при позитивных настроениях.' },
  noCampaigns:      { en: 'Positive reviews will trigger testimonial campaign ideas here.', es: 'Las reseñas positivas activarán ideas de campaña aquí.', pt: 'Avaliações positivas ativarão ideias de campanha aqui.', pl: 'Pozytywne opinie wyzwolą tutaj pomysły na kampanie.', ru: 'Положительные отзывы вызовут здесь идеи для кампаний.' },
  yourReviews:      { en: 'Your reviews', es: 'Tus reseñas', pt: 'Suas avaliações', pl: 'Twoje opinie', ru: 'Ваши отзывы' },
  summaryEmpty:     { en: 'Nothing yet. Share the link above to start.', es: 'Nada aún. Comparte el enlace de arriba para comenzar.', pt: 'Nada ainda. Compartilhe o link acima para começar.', pl: 'Jeszcze nic. Udostępnij powyższy link, aby rozpocząć.', ru: 'Пока ничего. Поделитесь ссылкой выше, чтобы начать.' },
  total:            { en: 'total', es: 'total', pt: 'total', pl: 'łącznie', ru: 'всего' },
  pending:          { en: 'pending', es: 'pendiente', pt: 'pendente', pl: 'oczekujące', ru: 'ожидающих' },
  approved:         { en: 'approved', es: 'aprobado', pt: 'aprovado', pl: 'zatwierdzone', ru: 'одобренных' },
  flagged:          { en: 'flagged', es: 'marcado', pt: 'sinalizado', pl: 'oflagowane', ru: 'отмеченных' },
  avg:              { en: 'avg', es: 'prom', pt: 'méd', pl: 'śr', ru: 'ср' },
  sortRelevance:    { en: 'Sort: relevance', es: 'Ordenar: relevancia', pt: 'Ordenar: relevância', pl: 'Sortuj: trafność', ru: 'Сортировка: релевантность' },
  sortDate:         { en: 'Sort: newest', es: 'Ordenar: más reciente', pt: 'Ordenar: mais reciente', pl: 'Sortuj: najnowsze', ru: 'Сортировка: новейшие' },
  sortRating:       { en: 'Sort: rating', es: 'Ordenar: calificación', pt: 'Ordenar: avaliação', pl: 'Sortuj: ocena', ru: 'Сортировка: рейтинг' },
  allLanguages:     { en: 'All languages', es: 'Todos los idiomas', pt: 'Todos os idiomas', pl: 'Wszystkie języki', ru: 'Все языки' },
  allPartners:      { en: 'All partners', es: 'Todos los socios', pt: 'Todos os parceiros', pl: 'Wszyscy partnerzy', ru: 'Все партнёры' },
  allProducts:      { en: 'All products/services', es: 'Todos los productos/servicios', pt: 'Todos os produtos/serviços', pl: 'Wszystkie produkty/usługi', ru: 'Все продукты/услуги' },
  filterAll:        { en: 'All', es: 'Todos', pt: 'Todos', pl: 'Wszystkie', ru: 'Все' },
  filterPending:    { en: 'Pending', es: 'Pendientes', pt: 'Pendentes', pl: 'Oczekujące', ru: 'Ожидающие' },
  filterApproved:   { en: 'Approved', es: 'Aprobados', pt: 'Aprovados', pl: 'Zatwierdzone', ru: 'Одобренные' },
  filterFlagged:    { en: 'Flagged', es: 'Marcados', pt: 'Sinalizados', pl: 'Oflagowane', ru: 'Отмeченные' },
  generalService:   { en: 'General service', es: 'Servicio general', pt: 'Serviço geral', pl: 'Usługa ogólna', ru: 'Общая услуга' },
  verifiedPartner:  { en: 'Verified partner', es: 'Socio verificado', pt: 'Parceiro verificado', pl: 'Zweryfikowany partner', ru: 'Проверенный партнёр' },
  media:            { en: 'media', es: 'medios', pt: 'mídia', pl: 'media', ru: 'медиа' },
  unpublish:        { en: 'Unpublish', es: 'Despublicar', pt: 'Despublicar', pl: 'Cofnij publikację', ru: 'Снять с публикации' },
  approve:          { en: 'Approve', es: 'Aprobar', pt: 'Aprovar', pl: 'Zatwierdź', ru: 'Одобрить' },
  unflag:           { en: 'Clear flag', es: 'Quitar marca', pt: 'Remover sinalização', pl: 'Usuń flagę', ru: 'Снять отметку' },
  flag:             { en: 'Flag', es: 'Marcar', pt: 'Sinalizar', pl: 'Oflaguj', ru: 'Отметить' },
  translate:        { en: 'AI translate', es: 'Traducir con IA', pt: 'Traduzir com IA', pl: 'Tłumacz AI', ru: 'ИИ-перевод' },
  delete:           { en: 'Delete', es: 'Eliminar', pt: 'Excluir', pl: 'Usuń', ru: 'Удалить' },
  confirmDelete:    { en: 'Delete this review? This cannot be undone.', es: '¿Eliminar esta reseña? Esto no se puede deshacer.', pt: 'Excluir esta avaliação? Isso não pode ser desfeito.', pl: 'Usunąć tę opinię? Tego nie można cofnąć.', ru: 'Удалить этот отзыв? Это нельзя отменить.' },
  adminConsole:     { en: 'Admin Console', es: 'Consola de Administrador', pt: 'Console do Administrador', pl: 'Konsola Administratora', ru: 'Консоль администратора' },
  telemetryTitle:   { en: 'Reviews telemetry, sentiment, and moderation', es: 'Telemetría, sentimiento y moderación', pt: 'Telemetria, sentimento e moderação', pl: 'Telemetria, nastroje i moderacja', ru: 'Телеметрия, настроения и модерация' },
  logsEnabled:      { en: 'Submissions · AI sentiment · moderation logged', es: 'Envíos · Sentimiento IA · moderación', pt: 'Envios · Sentimento IA · moderação', pl: 'Zgłoszenia · Nastroje AI · moderacja', ru: 'Отправки · Настроения ИИ · модерация' },
  localeVolume:     { en: 'Review volume per locale', es: 'Volumen por región', pt: 'Volume por região', pl: 'Wolumen według regionu', ru: 'Объём по регионам' },
  sentimentTrend:   { en: 'Sentiment trend', es: 'Tendencia de sentimiento', pt: 'Tendência de sentimento', pl: 'Trend nastrojów', ru: 'Тенденция настроений' },
  moderationQueue:  { en: 'Moderation queue', es: 'Cola de moderación', pt: 'Fila de moderação', pl: 'Kolejka moderacji', ru: 'Очередь модерации' },
  outreachHooks:    { en: 'Outreach + CRM hooks', es: 'Hooks de Outreach + CRM', pt: 'Hooks de Outreach + CRM', pl: 'Haki Outreach + CRM', ru: 'Хуки Outreach + CRM' },
  crmRegression:    { en: 'Regression guard: approved positive reviews can attach to Leads → Opportunities → Conversions.', es: 'Guardia de regresión: reseñas positivas aprobadas → Leads → Oportunidades → Conversiones.', pt: 'Guarda de regressão: avaliações positivas aprovadas → Leads → Oportunidades → Conversões.', pl: 'Ochrona regresji: zatwierdzone opinie → Leady → Szanse → Konwersje.', ru: 'Защита регрессии: одобренные отзывы → Лиды → Возможности → Конверсии.' },
  errSignIn:        { en: 'Please sign in to see your reviews.', es: 'Por favor inicia sesión.', pt: 'Por favor faça login.', pl: 'Zaloguj się.', ru: 'Пожалуйста, войдите.' },
  errLoad:          { en: 'Could not load reviews.', es: 'No se pudieron cargar las reseñas.', pt: 'Não foi possível carregar as avaliações.', pl: 'Nie można załadować opinii.', ru: 'Не удалось загрузить отзывы.' },
  errPickHandle:    { en: 'Pick a handle to continue.', es: 'Elige un identificador para continuar.', pt: 'Escolha um identificador para continuar.', pl: 'Wybierz identyfikator.', ru: 'Выберите идентификатор.' },
  errSaveHandle:    { en: 'Could not save handle.', es: 'No se pudo guardar el identificador.', pt: 'Não foi possível salvar o identificador.', pl: 'Nie można zapisać identyfikatora.', ru: 'Не удалось сохранить идентификатор.' },
}

function c(key: string, lang: string): string {
  return COPY[key]?.[lang as Lang] ?? COPY[key]?.en ?? key
}

const translationPreview: Record<ReviewLocale, string> = {
  en: 'AI translation is ready on demand in the selected workspace language.',
  es: 'La traducción con IA está lista bajo demanda en el idioma seleccionado.',
  pt: 'A tradução por IA está pronta sob demanda no idioma selecionado.',
  pl: 'Tłumaczenie AI jest dostępne na żądanie w wybranym języku.',
  ru: 'ИИ-перевод доступен по запросу на выбранном языке.',
}

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
export default function ReviewsPage() {
  const { lang } = useI18n()
  const activeLocale = normalizeReviewLocale(lang)
  const l = ['en', 'es', 'pt', 'pl', 'ru'].includes(lang) ? lang : 'en'

  const [isAdmin, setIsAdmin] = useState(false)
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

  // Check admin status
  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(d => { if (d?.isAdmin) setIsAdmin(true) })
      .catch(() => {})
  }, [])

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
      if (res.status === 401) { setReviewsError(c('errSignIn', l)); setReviews([]); return }
      const j = await res.json()
      if (!res.ok) { setReviewsError(j?.error || c('errLoad', l)); setReviews([]); return }
      setReviews((j.reviews ?? []) as Review[])
    } catch {
      setReviewsError(c('errLoad', l))
      setReviews([])
    } finally {
      setReviewsLoading(false)
    }
  }, [l])

  useEffect(() => { loadReviews() }, [loadReviews])

  async function saveSlug() {
    const candidate = slugDraft.trim().toLowerCase()
    if (!candidate) { setSlugError(c('errPickHandle', l)); return }
    setSlugSaving(true); setSlugError(null)
    try {
      const res = await fetch('/api/profile/slug', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: candidate }),
      })
      const j = await res.json()
      if (!res.ok) { setSlugError(j?.error || c('errSaveHandle', l)); return }
      setSlug({ kind: 'set', slug: j.slug })
      setSlugDraft('')
    } catch {
      setSlugError(c('errSaveHandle', l))
    } finally {
      setSlugSaving(false)
    }
  }

  async function patchReview(id: string, patch: Partial<Review>) {
    setReviews(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))
    try {
      const res = await fetch(`/api/reviews?id=${encodeURIComponent(id)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
      })
      if (!res.ok) loadReviews()
    } catch { loadReviews() }
  }

  async function deleteReview(id: string) {
    if (!confirm(c('confirmDelete', l))) return
    const snapshot = reviews
    setReviews(prev => prev.filter(r => r.id !== id))
    try {
      const res = await fetch(`/api/reviews?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!res.ok) setReviews(snapshot)
    } catch { setReviews(snapshot) }
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
      sentiment, flagged,
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

  const visibleReviews    = sortReviews(filteredReviews, sortMode)
  const approvedCount     = enrichedReviews.filter(r => r.approved).length
  const pendingCount      = enrichedReviews.length - approvedCount
  const flaggedCount      = enrichedReviews.filter(r => r.flagged).length
  const avgRating         = enrichedReviews.length ? enrichedReviews.reduce((sum, r) => sum + r.rating, 0) / enrichedReviews.length : 0
  const localeTelemetry   = summarizeLocaleTelemetry(enrichedReviews)
  const sentimentTrend    = summarizeSentimentTrend(enrichedReviews)
  const positiveCampaigns = enrichedReviews.filter(r => r.sentiment === 'positive' && r.rating >= 4).map(buildTestimonialCampaign).slice(0, 3)
  const reviewLink        = slug.kind === 'set' ? `https://saas.signalboostapp.com/review/${slug.slug}` : ''
  const summaryLine       = enrichedReviews.length === 0
    ? c('summaryEmpty', l)
    : `${enrichedReviews.length} ${c('total', l)} · ${pendingCount} ${c('pending', l)} · ${approvedCount} ${c('approved', l)} · ${flaggedCount} ${c('flagged', l)} · ${avgRating.toFixed(1)} ★ ${c('avg', l)}`
return (
    <div className="sb-reviews-page" style={{ color: 'var(--text-primary)' }}>

      {/* ── Hero ── */}
      <section className="sb-reviews-hero" aria-label="Reviews module">
        <div>
          <p className="sb-eyebrow">⭐ {c('kicker', l)}</p>
          <h1>{c('title', l)}</h1>
          <p>{c('subtitle', l)}</p>
          <div className="sb-review-hero-actions">
            <a href="#submit-review" className="sb-button-primary">{c('shareCta', l)}</a>
            {isAdmin && <a href="#admin-console" className="sb-button-secondary">{c('adminCta', l)}</a>}
          </div>
        </div>

        {/* Wireflow — inline flex column, no CSS grid clipping */}
        <div aria-hidden="true" style={{
          background: 'rgba(2,6,23,.52)',
          border: '1px solid rgba(255,255,255,.14)',
          borderRadius: 26,
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          alignSelf: 'flex-start',
          minWidth: 160,
        }}>
          {['Submission', 'AI Sentiment', 'Moderation', 'Outreach'].map((label, i, arr) => (
            <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <div style={{
                border: '1px solid rgba(26,240,255,.22)',
                borderRadius: 14,
                color: '#dffcff',
                fontSize: 12,
                fontWeight: 900,
                padding: '11px 14px',
                textAlign: 'center',
                textTransform: 'uppercase',
                width: '100%',
                boxSizing: 'border-box',
                background: 'rgba(26,240,255,.06)',
              }}>
                {label}
              </div>
              {i < arr.length - 1 && (
                <div style={{ color: '#ffc300', fontSize: 16, fontWeight: 900, lineHeight: 1 }}>↓</div>
              )}
            </div>
          ))}
        </div>
      </section>

      {reviewsError && <div className="sb-review-alert">{reviewsError}</div>}

      {/* ── Submit link ── */}
      <section id="submit-review" className="sb-review-grid">
        <article className="sb-review-panel sb-review-panel--wide">
          <div className="sb-review-panel-header">
            <div>
              <p className="sb-eyebrow">{c('sendLinkTitle', l)}</p>
              <h2>{c('submissionTitle', l)}</h2>
            </div>
            <span className="sb-review-pill">LTR · {getLocaleLabel(activeLocale)}</span>
          </div>
          <p className="sb-caption">{c('sendLinkDesc', l)}</p>

          {slug.kind === 'loading' && <div className="sb-review-empty">{c('loading', l)}</div>}
          {slug.kind === 'none' && (
            <div className="sb-review-link-builder">
              <p>{c('pickHandleDesc', l)}</p>
              <div>
                <span>signalboostapp.com/review/</span>
                <input value={slugDraft} onChange={e => setSlugDraft(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} placeholder={c('handlePlaceholder', l)} maxLength={30} onKeyDown={e => e.key === 'Enter' && saveSlug()} />
                <button onClick={saveSlug} disabled={slugSaving || !slugDraft.trim()}>{slugSaving ? c('saving', l) : c('claim', l)}</button>
              </div>
              {slugError && <small>{slugError}</small>}
            </div>
          )}
          {slug.kind === 'set' && (
            <div className="sb-review-link-copy">
              <code>{reviewLink}</code>
              <button onClick={() => copyToClipboard(reviewLink)}>{copied ? `✓ ${c('copied', l)}` : c('copyLink', l)}</button>
              <a href={reviewLink} target="_blank" rel="noopener noreferrer">{c('openNewTab', l)} ↗</a>
            </div>
          )}
          <div className="sb-review-submission-preview">
            <div className="sb-stars" aria-label="5 star rating">★★★★★</div>
            <p>{c('previewText', l)}</p>
            <strong>{formatReviewDate('2026-05-29T10:30:00.000Z', activeLocale)} · {formatReviewCurrency(2499, activeLocale)}</strong>
            <label>
              {c('mediaLabel', l)}
              <input type="file" accept="image/*" multiple aria-label={c('mediaLabel', l)} />
            </label>
          </div>
        </article>

        <aside className="sb-review-panel">
          <p className="sb-eyebrow">{c('conciergeTitle', l)}</p>
          <h2>{c('conciergeHeadline', l)}</h2>
          <p>{c('conciergeBody', l)}</p>
          <div className="sb-review-ai-card">{positiveCampaigns[0] ?? c('noCampaigns', l)}</div>
        </aside>
      </section>

      {/* ── Filters + feed ── */}
      <section className="sb-review-controls" aria-label="Review filters and sorting">
        <div>
          <h2>{c('yourReviews', l)}</h2>
          <p>{reviewsLoading ? c('loading', l) : summaryLine}</p>
        </div>
        <div className="sb-review-control-row">
          <select value={sortMode} onChange={e => setSortMode(e.target.value as ReviewSortMode)}>
            <option value="relevance">{c('sortRelevance', l)}</option>
            <option value="date">{c('sortDate', l)}</option>
            <option value="rating">{c('sortRating', l)}</option>
          </select>
          <select value={languageFilter} onChange={e => setLanguageFilter(e.target.value as 'all' | ReviewLocale)}>
            <option value="all">{c('allLanguages', l)}</option>
            {REVIEW_LOCALES.map(locale => <option key={locale} value={locale}>{getFlagForLocale(locale)} {getLocaleLabel(locale)}</option>)}
          </select>
          <select value={partnerFilter} onChange={e => setPartnerFilter(e.target.value)}>
            <option value="all">{c('allPartners', l)}</option>
            {partners.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={productFilter} onChange={e => setProductFilter(e.target.value)}>
            <option value="all">{c('allProducts', l)}</option>
            {products.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="sb-review-tabs">
          {([
            { id: 'all',      label: `${c('filterAll', l)} (${enrichedReviews.length})` },
            { id: 'pending',  label: `${c('filterPending', l)} (${pendingCount})` },
            { id: 'approved', label: `${c('filterApproved', l)} (${approvedCount})` },
            { id: 'flagged',  label: `${c('filterFlagged', l)} (${flaggedCount})` },
          ] as const).map(tab => (
            <button key={tab.id} onClick={() => setStatusFilter(tab.id)} className={statusFilter === tab.id ? 'is-active' : ''}>{tab.label}</button>
          ))}
        </div>
      </section>

      <section className="sb-review-feed" aria-label="Review cards">
        {visibleReviews.length === 0 && !reviewsLoading && (
          <div className="sb-review-empty">{c('summaryEmpty', l)}</div>
        )}
        {visibleReviews.map(review => {
          const badge = getSentimentBadge(review.sentiment ?? 'neutral')
          const moderationSuggestion = buildModerationSuggestion(review)
          return (
            <article key={review.id} className="sb-review-card">
              <div className="sb-review-card-top">
                <div>
                  <h3>{getFlagForLocale(review.language)} {review.author_name}</h3>
                  <span>{getLocaleLabel(review.language)} · {formatReviewDate(review.created_at, review.language)} · {(review.product_name || review.service_name || c('generalService', l))}</span>
                </div>
                <div className="sb-stars" aria-label={`${review.rating} stars`}>{'★'.repeat(review.rating)}<span>{'★'.repeat(5 - review.rating)}</span></div>
              </div>
              <p>{review.content}</p>
              {translatedReviewId === review.id && <blockquote>{translationPreview[activeLocale]}</blockquote>}
              <div className="sb-review-card-meta">
                <span style={{ borderColor: badge.color, color: badge.color }}>{badge.label}</span>
                {review.verified_partner && <span className="verified">✓ {c('verifiedPartner', l)}</span>}
                {review.flagged && <span className="flagged">⚑ {c('flagged', l)}</span>}
                {(review.media_urls?.length ?? 0) > 0 && <span>🖼 {review.media_urls?.length} {c('media', l)}</span>}
              </div>
              <div className="sb-review-actions">
                <button onClick={() => patchReview(review.id, { approved: !review.approved, moderation_status: !review.approved ? 'approved' : 'pending' })}>{review.approved ? c('unpublish', l) : c('approve', l)}</button>
                <button onClick={() => patchReview(review.id, { flagged: !revi

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
import { uiText } from '@/lib/i18n/uiText'

const GREEN = '#4ade80'
const RED = '#f87171'
const CYAN = '#1af0ff'
const GOLD = '#ffc300'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'
const COPY: Record<string, Record<Lang, string>> = {
  kicker:           { en: uiText('generatedUi.u_eff4a1c2d650ac94'), es: 'Centro de mando de reseñas', pt: 'Central de avaliações', pl: 'Centrum zarządzania opiniami', ru: 'Центр управления отзывами' },
  title:            { en: uiText('generatedUi.u_4637016c5e82d0d1'), es: 'Colector de reseñas', pt: 'Coletor de avaliações', pl: 'Kolektor opinii', ru: 'Сборщик отзывов' },
  subtitle:         { en: uiText('generatedUi.u_360580113dbe96ab'), es: 'Recopila reseñas multilingües, aprueba lo que se publica y monitorea el sentimiento.', pt: 'Colete avaliações multilíngues, aprove o que publica e monitore sentimentos.', pl: 'Zbieraj wielojęzyczne opinie, zatwierdzaj publikacje i monitoruj nastroje.', ru: 'Собирайте многоязычные отзывы, одобряйте публикации и отслеживайте настроения.' },
  shareCta:         { en: uiText('generatedUi.u_8410b494cae23dad'), es: 'Compartir enlace', pt: 'Compartilhar link', pl: 'Udostępnij link', ru: 'Поделиться ссылкой' },
  adminCta:         { en: uiText('generatedUi.u_67838c7ad5459fc8'), es: 'Ver telemetría', pt: 'Ver telemetria', pl: 'Zobacz telemetrię', ru: 'Телеметрия' },
  sendLinkTitle:    { en: uiText('generatedUi.u_e6d4f5ce8a93bd73'), es: 'Envía este enlace a tus clientes', pt: 'Envie este link para seus clientes', pl: 'Wyślij ten link swoim klientom', ru: 'Отправьте эту ссылку своим клиентам' },
  submissionTitle:  { en: uiText('generatedUi.u_03329cf8efd5a913'), es: 'Envío de reseña localizada', pt: 'Envio de avaliação localizada', pl: 'Lokalizowane przesyłanie opinii', ru: 'Локализованная отправка отзыва' },
  sendLinkDesc:     { en: uiText('generatedUi.u_be9601f482f01cb7'), es: 'Hacen clic, dejan una reseña en su idioma, adjuntan imágenes y aparece como Pendiente.', pt: 'Eles clicam, deixam uma avaliação no seu idioma, anexam imagens e aparece como Pendente.', pl: 'Klikają, zostawiają opinię w swoim języku, dołączają zdjęcia — pojawia się jako Oczekująca.', ru: 'Они нажимают, оставляют отзыв на своём языке — он появляется как Ожидающий.' },
  loading:          { en: uiText('generatedUi.u_ba3bbbe10d8bef66'), es: 'Cargando…', pt: 'Carregando…', pl: 'Ładowanie…', ru: 'Загрузка…' },
  pickHandleDesc:   { en: uiText('generatedUi.u_e9a31d81bf0a5910'), es: 'Elige un identificador — 3 a 30 letras minúsculas, dígitos y guiones.', pt: 'Escolha um identificador — 3 a 30 letras minúsculas, dígitos e hífens.', pl: 'Wybierz identyfikator — 3 do 30 małych liter, cyfr i myślników.', ru: 'Выберите идентификатор — 3–30 строчных букв, цифр и дефисов.' },
  handlePlaceholder:{ en: uiText('generatedUi.u_957f19bade6f852b'), es: 'tu-identificador', pt: 'seu-identificador', pl: 'twoj-identyfikator', ru: 'ваш-идентификатор' },
  saving:           { en: uiText('generatedUi.u_23e39291d6135814'), es: 'Guardando…', pt: 'Salvando…', pl: 'Zapisywanie…', ru: 'Сохранение…' },
  claim:            { en: uiText('generatedUi.u_4ca41db028253700'), es: 'Reclamar', pt: 'Reivindicar', pl: 'Zarezerwuj', ru: 'Занять' },
  copied:           { en: uiText('generatedUi.u_8d525e5f158b9afe'), es: 'Copiado', pt: 'Copiado', pl: 'Skopiowano', ru: 'Скопировано' },
  copyLink:         { en: uiText('generatedUi.u_dbf362d4f210c780'), es: 'Copiar enlace', pt: 'Copiar link', pl: 'Kopiuj link', ru: 'Копировать ссылку' },
  openNewTab:       { en: uiText('generatedUi.u_e0af5c0bc2457475'), es: 'Abrir en nueva pestaña', pt: 'Abrir em nova aba', pl: 'Otwórz w nowej karcie', ru: 'Открыть в новой вкладке' },
  previewText:      { en: uiText('generatedUi.u_db1c141e18b2b208'), es: 'Ejemplo de cómo se muestra una reseña — fechas y montos se adaptan a cada idioma:', pt: 'Exemplo de como uma avaliação aparece — datas e valores se adaptam a cada idioma:', pl: 'Przykład wyświetlania opinii — daty i kwoty dostosowują się do języka:', ru: 'Пример отображения отзыва — даты и суммы адаптируются к языку:' },
  sampleBadge:      { en: uiText('generatedUi.u_39d399369a105e93'), es: 'Vista de ejemplo', pt: 'Prévia de exemplo', pl: 'Przykładowy podgląd', ru: 'Пример' },
  mediaLabel:       { en: uiText('generatedUi.u_a194e248c04648f4'), es: 'Archivos de imagen opcionales', pt: 'Anexos de imagem opcionais', pl: 'Opcjonalne załączniki obrazów', ru: 'Необязательные вложения изображений' },
  conciergeTitle:   { en: uiText('generatedUi.u_bef4521095495dae'), es: 'Concierge IA', pt: 'Concierge IA', pl: 'Concierge AI', ru: 'Консьерж ИИ' },
  conciergeHeadline:{ en: uiText('generatedUi.u_9e41a281f1dd39e9'), es: 'Recomendaciones basadas en reseñas', pt: 'Recomendações baseadas em avaliações', pl: 'Rekomendacje oparte na opiniach', ru: 'Рекомендации на основе отзывов' },
  conciergeBody:    { en: uiText('generatedUi.u_23d79449120cd467'), es: 'El Concierge sugiere acciones de moderación y propone campañas cuando el sentimiento es positivo.', pt: 'O Concierge sugere ações de moderação e propõe campanhas quando o sentimento é positivo.', pl: 'Concierge sugeruje działania moderacyjne i proponuje kampanie gdy nastroje są pozytywne.', ru: 'Консьерж предлагает действия модерации и кампании при позитивных настроениях.' },
  noCampaigns:      { en: uiText('generatedUi.u_d1bcf915c912b681'), es: 'Las reseñas positivas activarán ideas de campaña aquí.', pt: 'Avaliações positivas ativarão ideias de campanha aqui.', pl: 'Pozytywne opinie wyzwolą tutaj pomysły na kampanie.', ru: 'Положительные отзывы вызовут здесь идеи для кампаний.' },
  yourReviews:      { en: uiText('generatedUi.u_d9058ab5c9016a86'), es: 'Tus reseñas', pt: 'Suas avaliações', pl: 'Twoje opinie', ru: 'Ваши отзывы' },
  summaryEmpty:     { en: uiText('generatedUi.u_13350f41a3451583'), es: 'Nada aún. Comparte el enlace de arriba para comenzar.', pt: 'Nada ainda. Compartilhe o link acima para começar.', pl: 'Jeszcze nic. Udostępnij powyższy link, aby rozpocząć.', ru: 'Пока ничего. Поделитесь ссылкой выше, чтобы начать.' },
  total:            { en: uiText('generatedUi.u_11239872d178729a'), es: 'total', pt: 'total', pl: 'łącznie', ru: 'всего' },
  pending:          { en: uiText('generatedUi.u_62a2fed3d6e08c44'), es: 'pendiente', pt: 'pendente', pl: 'oczekujące', ru: 'ожидающих' },
  approved:         { en: uiText('generatedUi.u_2687f86ed6784b8a'), es: 'aprobado', pt: 'aprovado', pl: 'zatwierdzone', ru: 'одобренных' },
  flagged:          { en: uiText('generatedUi.u_5588be887fb18a7d'), es: 'marcado', pt: 'sinalizado', pl: 'oflagowane', ru: 'отмеченных' },
  avg:              { en: uiText('generatedUi.u_ca5c8585b0760a76'), es: 'prom', pt: 'méd', pl: 'śr', ru: 'ср' },
  sortRelevance:    { en: uiText('generatedUi.u_8edc2f421465ed23'), es: 'Ordenar: relevancia', pt: 'Ordenar: relevância', pl: 'Sortuj: trafność', ru: 'Сортировка: релевантность' },
  sortDate:         { en: uiText('generatedUi.u_52a3d3605f7ac8aa'), es: 'Ordenar: más reciente', pt: 'Ordenar: más reciente', pl: 'Sortuj: najnowsze', ru: 'Сортировка: новейшие' },
  sortRating:       { en: uiText('generatedUi.u_87eb14ddcee99d99'), es: 'Ordenar: calificación', pt: 'Ordenar: avaliação', pl: 'Sortuj: ocena', ru: 'Сортировка: рейтинг' },
  allLanguages:     { en: uiText('generatedUi.u_acce3d0e30f951f6'), es: 'Todos los idiomas', pt: 'Todos os idiomas', pl: 'Wszystkie języki', ru: 'Все языки' },
  allPartners:      { en: uiText('generatedUi.u_f1beb9d2a979e40b'), es: 'Todos los socios', pt: 'Todos os parceiros', pl: 'Wszyscy partnerzy', ru: 'Все партнёры' },
  allProducts:      { en: uiText('generatedUi.u_c4b20188433a8c23'), es: 'Todos los productos/servicios', pt: 'Todos os produtos/serviços', pl: 'Wszystkie produkty/usługi', ru: 'Все продукты/услуги' },
  filterAll:        { en: uiText('generatedUi.u_a52ace420f2175d0'), es: 'Todos', pt: 'Todos', pl: 'Wszystkie', ru: 'Все' },
  filterPending:    { en: uiText('generatedUi.u_331551b0de4157c9'), es: 'Pendientes', pt: 'Pendentes', pl: 'Oczekujące', ru: 'Ожидающие' },
  filterApproved:   { en: uiText('generatedUi.u_87b42e40c2a290e0'), es: 'Aprobados', pt: 'Aprovados', pl: 'Zatwierdzone', ru: 'Одобренные' },
  filterFlagged:    { en: uiText('generatedUi.u_2f1978c6166e8980'), es: 'Marcados', pt: 'Sinalizados', pl: 'Oflagowane', ru: 'Отмеченные' },
  generalService:   { en: uiText('generatedUi.u_8f69f60e6baeefad'), es: 'Servicio general', pt: 'Serviço geral', pl: 'Usługa ogólna', ru: 'Общая услуга' },
  verifiedPartner:  { en: uiText('generatedUi.u_a38feefedc89c9bf'), es: 'Socio verificado', pt: 'Parceiro verificado', pl: 'Zweryfikowany partner', ru: 'Проверенный партнёр' },
  media:            { en: uiText('generatedUi.u_721c9525ade2ea89'), es: 'medios', pt: 'mídia', pl: 'media', ru: 'медиа' },
  unpublish:        { en: uiText('generatedUi.u_2db04a54fa743150'), es: 'Despublicar', pt: 'Despublicar', pl: 'Cofnij publikację', ru: 'Снять с публикации' },
  approve:          { en: uiText('generatedUi.u_6007acbe30b2cd98'), es: 'Aprobar', pt: 'Aprovar', pl: 'Zatwierdź', ru: 'Одобрить' },
  unflag:           { en: uiText('generatedUi.u_eaf05d552ed6174f'), es: 'Quitar marca', pt: 'Remover sinalização', pl: 'Usuń flagę', ru: 'Снять отметку' },
  flag:             { en: uiText('generatedUi.u_552127973f8424e1'), es: 'Marcar', pt: 'Sinalizar', pl: 'Oflaguj', ru: 'Отметить' },
  translate:        { en: uiText('generatedUi.u_bc4ac4d12a4a3f9c'), es: 'Traducir con IA', pt: 'Traduzir com IA', pl: 'Tłumacz AI', ru: 'ИИ-перевод' },
  delete:           { en: uiText('generatedUi.u_e2d0a54968ead24e'), es: 'Eliminar', pt: 'Excluir', pl: 'Usuń', ru: 'Удалить' },
  confirmDelete:    { en: uiText('generatedUi.u_3a14c8c6ad125718'), es: '¿Eliminar esta reseña? Esto no se puede deshacer.', pt: 'Excluir esta avaliação? Isso não pode ser desfeito.', pl: 'Usunąć tę opinię? Tego nie można cofnąć.', ru: 'Удалить этот отзыв? Это нельзя отменить.' },
  adminConsole:     { en: uiText('generatedUi.u_104bfb7a21182419'), es: 'Consola de Administrador', pt: 'Console do Administrador', pl: 'Konsola Administratora', ru: 'Консоль администратора' },
  telemetryTitle:   { en: uiText('generatedUi.u_baae6a3ac96fe8d3'), es: 'Telemetría, sentimiento y moderación', pt: 'Telemetria, sentimento e moderação', pl: 'Telemetria, nastroje i moderacja', ru: 'Телеметрия, настроения и модерация' },
  logsEnabled:      { en: uiText('generatedUi.u_b89a7e7556dc6188'), es: 'Envíos · Sentimiento IA · moderación', pt: 'Envios · Sentimento IA · moderação', pl: 'Zgłoszenia · Nastroje AI · moderacja', ru: 'Отправки · Настроения ИИ · модерация' },
  localeVolume:     { en: uiText('generatedUi.u_2f8e24f4121d45cb'), es: 'Volumen por región', pt: 'Volume por região', pl: 'Wolumen według regionu', ru: 'Объём по регионам' },
  sentimentTrend:   { en: uiText('generatedUi.u_ae62485c8dc6c0ef'), es: 'Tendencia de sentimiento', pt: 'Tendência de sentimento', pl: 'Trend nastrojów', ru: 'Тенденция настроений' },
  moderationQueue:  { en: uiText('generatedUi.u_50d92231eae4fdf6'), es: 'Cola de moderación', pt: 'Fila de moderação', pl: 'Kolejka moderacji', ru: 'Очередь moderacji' },
  outreachHooks:    { en: uiText('generatedUi.u_cc612cb152574dab'), es: 'Hooks Outreach + CRM', pt: 'Hooks Outreach + CRM', pl: 'Haki Outreach + CRM', ru: 'Хуки Outreach + CRM' },
  crmRegression:    { en: uiText('generatedUi.u_0f692ee6380efb1d'), es: 'Guardia de regresión: reseñas positivas → Leads → Oportunidades → Conversiones.', pt: 'Guarda de regressão: avaliações positivas → Leads → Oportunidades → Conversões.', pl: 'Ochrona regresji: zatwierdzone opinie → Leady → Szanse → Konwersje.', ru: 'Защита регрессии: одобренные отзывы → Лиды → Возможности → Конверсии.' },
  errSignIn:        { en: uiText('generatedUi.u_58e6d73e7af5aa17'), es: 'Por favor inicia sesión.', pt: 'Por favor faça login.', pl: 'Zaloguj się.', ru: 'Пожалуйста, войдите.' },
  errLoad:          { en: uiText('generatedUi.u_769bf34f0b1cc128'), es: 'No se pudieron cargar las reseñas.', pt: 'Não foi possível carregar as avaliações.', pl: 'Nie można załadować opinii.', ru: 'Не удалось загрузить отзывы.' },
  errPickHandle:    { en: uiText('generatedUi.u_1e9091e22050fcad'), es: 'Elige un identificador para continuar.', pt: 'Escolha um identificador para continuar.', pl: 'Wybierz identyfikator.', ru: 'Выберите идентификатор.' },
  errSaveHandle:    { en: uiText('generatedUi.u_a3c64e8773b22463'), es: 'No se pudo guardar el identificador.', pt: 'Não foi possível salvar o identificador.', pl: 'Nie można zapisać identyfikatora.', ru: 'Не удалось сохранить идентификатор.' },
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

  const [isAdmin, setIsAdmin]               = useState(false)
  const [reviews, setReviews]               = useState<Review[]>([])
  const [reviewsLoading, setReviewsLoading] = useState(true)
  const [reviewsError, setReviewsError]     = useState<string | null>(null)
  const [slug, setSlug]                     = useState<SlugState>({ kind: 'loading' })
  const [slugDraft, setSlugDraft]           = useState('')
  const [slugSaving, setSlugSaving]         = useState(false)
  const [slugError, setSlugError]           = useState<string | null>(null)
  const [copied, setCopied]                 = useState(false)
  const [statusFilter, setStatusFilter]     = useState<'all' | 'pending' | 'approved' | 'flagged'>('all')
  const [languageFilter, setLanguageFilter] = useState<'all' | ReviewLocale>('all')
  const [partnerFilter, setPartnerFilter]   = useState('all')
  const [productFilter, setProductFilter]   = useState('all')
  const [sortMode, setSortMode]             = useState<ReviewSortMode>('relevance')
  const [translatedReviewId, setTranslatedReviewId] = useState<string | null>(null)

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
    const flagged   = review.flagged || reviewMatchesModerationFlag(review.content)
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
    if (statusFilter === 'pending'  && r.approved)  return false
    if (statusFilter === 'approved' && !r.approved) return false
    if (statusFilter === 'flagged'  && !r.flagged)  return false
    if (languageFilter !== 'all' && r.language !== languageFilter) return false
    if (partnerFilter  !== 'all' && r.partner_name !== partnerFilter) return false
    if (productFilter  !== 'all' && (r.product_name || r.service_name) !== productFilter) return false
    return true
  })

  const visibleReviews    = sortReviews(filteredReviews, sortMode)
  const approvedCount     = enrichedReviews.filter(r => r.approved).length
  const pendingCount      = enrichedReviews.length - approvedCount
  const flaggedCount      = enrichedReviews.filter(r => r.flagged).length
  const avgRating         = enrichedReviews.length ? enrichedReviews.reduce((s, r) => s + r.rating, 0) / enrichedReviews.length : 0
  const localeTelemetry   = summarizeLocaleTelemetry(enrichedReviews)
  const sentimentTrend    = summarizeSentimentTrend(enrichedReviews)
  const positiveCampaigns = enrichedReviews.filter(r => r.sentiment === 'positive' && r.rating >= 4).map(buildTestimonialCampaign).slice(0, 3)
  const reviewLink        = slug.kind === 'set' ? `https://saas.signalboostapp.com/review/${slug.slug}` : ''
  const summaryLine       = enrichedReviews.length === 0
    ? c('summaryEmpty', l)
    : `${enrichedReviews.length} ${c('total', l)} · ${pendingCount} ${c('pending', l)} · ${approvedCount} ${c('approved', l)} · ${flaggedCount} ${c('flagged', l)} · ${avgRating.toFixed(1)} ★ ${c('avg', l)}`

  return (
    <div className="sb-reviews-page" style={{ color: 'var(--text-primary)' }}>

      {/* ── Console header with live review telemetry ── */}
      <header className="sb-console" style={{ marginBottom: 0 }}>
        <div className="sb-console__row">
          <div>
            <span className="sb-eyebrow">⭐ {c('kicker', l)}</span>
            <h1>{c('title', l)}</h1>
            <p className="sb-body">{c('subtitle', l)}</p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <a href="#submit-review" className="sb-button-primary" style={{ fontSize: 13, padding: '10px 18px' }}>{c('shareCta', l)}</a>
            {isAdmin && <a href="#admin-console" className="sb-button-secondary" style={{ fontSize: 13, padding: '10px 18px' }}>{c('adminCta', l)}</a>}
          </div>
        </div>
        <div className="sb-telemetry">
          <div><b className="gold">{enrichedReviews.length}</b><span>{c('total', l)}</span></div>
          <div><b className="warn">{pendingCount}</b><span>{c('pending', l)}</span></div>
          <div><b className="ok">{approvedCount}</b><span>{c('approved', l)}</span></div>
          <div><b style={{ color: flaggedCount ? '#fca5a5' : undefined }}>{flaggedCount}</b><span>{c('flagged', l)}</span></div>
          <div><b>{avgRating.toFixed(1)} ★</b><span>{c('avg', l)}</span></div>
        </div>
      </header>

      {reviewsError && <div className="sb-review-alert">{reviewsError}</div>}

      {/* Submit link */}
      <section id="submit-review" className="sb-review-grid">
        <article className="sb-review-panel sb-review-panel--wide">
          <div className="sb-review-panel-header">
            <div>
              <p className="sb-eyebrow">{c('sendLinkTitle', l)}</p>
              <h2>{c('submissionTitle', l)}</h2>
            </div>
            <span className="sb-review-pill">{uiText('generatedUi.u_0d51008f777589f5')}{getLocaleLabel(activeLocale)}</span>
          </div>
          <p className="sb-caption">{c('sendLinkDesc', l)}</p>
          {slug.kind === 'loading' && <div className="sb-review-empty">{c('loading', l)}</div>}
          {slug.kind === 'none' && (
            <div className="sb-review-link-builder">
              <p>{c('pickHandleDesc', l)}</p>
              <div>
                <span>{uiText('generatedUi.u_4da42d3253ab7a2e')}</span>
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
          <div className="sb-review-submission-preview" style={{ background: 'transparent', border: 0, borderLeft: '2px solid rgba(26,240,255,.4)', borderRadius: 0, padding: '4px 0 4px 14px' }}>
            <span className="sb-chip" style={{ marginBottom: 8 }}>{c('sampleBadge', l)}</span>
            <div className="sb-stars" aria-label={uiText('generatedUi.u_d6ad47db4d63b1b0')}>★★★★★</div>
            <p>{c('previewText', l)}</p>
            <strong>{formatReviewDate('2026-05-29T10:30:00.000Z', activeLocale)} · {formatReviewCurrency(49, activeLocale)}</strong>
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

      {/* Filters */}
      <section className="sb-review-controls" aria-label={uiText('generatedUi.u_f63c5fd9d87ec8f3')}>
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
            { id: "all",      label: `${c('filterAll', l)} (${enrichedReviews.length})` },
            { id: "pending",  label: `${c('filterPending', l)} (${pendingCount})` },
            { id: "approved", label: `${c('filterApproved', l)} (${approvedCount})` },
            { id: "flagged",  label: `${c('filterFlagged', l)} (${flaggedCount})` },
          ] as const).map(tab => (
            <button key={tab.id} onClick={() => setStatusFilter(tab.id)} className={statusFilter === tab.id ? 'is-active' : ''}>{tab.label}</button>
          ))}
        </div>
      </section>

      {/* Review feed */}
      <section className="sb-review-feed" aria-label={uiText('generatedUi.u_4fb20d256acefb38')}>
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
                <button onClick={() => patchReview(review.id, { flagged: !review.flagged, moderation_status: !review.flagged ? 'flagged' : 'pending' })}>{review.flagged ? c('unflag', l) : c('flag', l)}</button>
                <button onClick={() => setTranslatedReviewId(translatedReviewId === review.id ? null : review.id)}>{c('translate', l)}</button>
                <button onClick={() => deleteReview(review.id)}>{c('delete', l)}</button>
              </div>
              <small>{moderationSuggestion}</small>
            </article>
          )
        })}
      </section>

      {/* Admin console — owner/admin only */}
      {isAdmin && (
        <section id="admin-console" className="sb-admin-review-console" aria-label={uiText('generatedUi.u_89ea5bcb5575ffbc')}>
          <div className="sb-review-panel-header">
            <div>
              <p className="sb-eyebrow">{c('adminConsole', l)}</p>
              <h2>{c('telemetryTitle', l)}</h2>
            </div>
            <span className="sb-review-pill">{c('logsEnabled', l)}</span>
          </div>
          <div className="sb-admin-review-grid">
            <article className="sb-review-panel">
              <h3>{c('localeVolume', l)}</h3>
              {localeTelemetry.map(item => (
                <div key={item.locale} className="sb-bar">
                  <span>{getFlagForLocale(item.locale)} {item.locale.toUpperCase()}</span>
                  <i style={{ width: `${Math.max(8, item.percentage)}%`, background: CYAN }} />
                  <strong>{item.count}</strong>
                </div>
              ))}
            </article>
            <article className="sb-review-panel">
              <h3>{c('sentimentTrend', l)}</h3>
              {sentimentTrend.map(item => (
                <div key={item.sentiment} className="sb-bar">
                  <span>{item.sentiment}</span>
                  <i style={{ width: `${Math.max(8, item.percentage)}%`, background: item.sentiment === 'positive' ? GREEN : item.sentiment === 'negative' ? RED : GOLD }} />
                  <strong>{item.count}</strong>
                </div>
              ))}
            </article>
            <article className="sb-review-panel">
              <h3>{c('moderationQueue', l)}</h3>
              {enrichedReviews.filter(r => !r.approved || r.flagged).slice(0, 5).map(review => (
                <p key={review.id}><strong>{review.author_name}</strong> · {review.moderation_status} · {buildModerationSuggestion(review)}</p>
              ))}
            </article>
            <article className="sb-review-panel">
              <h3>{c('outreachHooks', l)}</h3>
              {positiveCampaigns.map(campaign => <p key={campaign}>• {campaign}</p>)}
              <p>• {c('crmRegression', l)}</p>
            </article>
          </div>
        </section>
      )}
    </div>
  )
}

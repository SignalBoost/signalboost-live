'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'

const PLATFORMS = ['manual', 'google', 'facebook', 'instagram', 'linkedin', 'tiktok', 'youtube', 'telegram', 'wechat', 'reddit', 'website', 'directory']

const CATEGORIES = ['company', 'affiliate', 'media']

type DiscoveryCopy = {
  eyebrow: string
  title: string
  subtitle: string
  urlLabel: string
  nameLabel: string
  sourceLabel: string
  categoryLabel: string
  notesLabel: string
  urlPlaceholder: string
  namePlaceholder: string
  notesPlaceholder: string
  missingUrl: string
  analyzeError: string
  genericError: string
  analyzing: string
  analyzeButton: string
  viewContacts: string
  leadQueued: string
  newLead: string
  draftFirstTouch: string
  reviewContacts: string
  openEngine: string
  platforms: Record<string, string>
  categories: Record<string, string>
}

const COPY: Record<string, DiscoveryCopy> = {
  en: {
    eyebrow: 'Discovery',
    title: 'Find a business and let AI prepare the outreach.',
    subtitle: 'Paste a public website, Google profile, or social page. SignalBoost analyzes the business, predicts its needs, and drops a ready-to-review lead into your contacts queue.',
    urlLabel: 'Business URL or profile *',
    nameLabel: 'Business name (optional)',
    sourceLabel: 'Source',
    categoryLabel: 'Outreach type',
    notesLabel: 'Public text / notes (optional)',
    urlPlaceholder: 'https://example.com',
    namePlaceholder: 'e.g. Luna Travel',
    notesPlaceholder: 'Paste a bio, reviews, or anything that describes what they do.',
    missingUrl: 'Add a business URL or profile link to analyze.',
    analyzeError: 'Could not analyze this lead.',
    genericError: 'Something went wrong. Please try again.',
    analyzing: 'Analyzing…',
    analyzeButton: 'Analyze & queue lead',
    viewContacts: 'View contacts queue',
    leadQueued: 'Lead queued',
    newLead: 'New lead',
    draftFirstTouch: 'Draft first touch',
    reviewContacts: 'Review in contacts',
    openEngine: 'Open engine',
    platforms: {
      manual: 'Manual', google: 'Google', facebook: 'Facebook', instagram: 'Instagram',
      linkedin: 'LinkedIn', tiktok: 'TikTok', youtube: 'YouTube', telegram: 'Telegram',
      wechat: 'WeChat', reddit: 'Reddit', website: 'Website', directory: 'Directory',
    },
    categories: { company: 'Company', affiliate: 'Affiliate / Partner', media: 'Media Platform' },
  },
  pt: {
    eyebrow: 'Descoberta',
    title: 'Encontre um negócio e deixe a IA preparar a prospecção.',
    subtitle: 'Cole um site público, perfil do Google ou página social. O SignalBoost analisa o negócio, prevê suas necessidades e coloca um lead pronto para revisão na fila de contatos.',
    urlLabel: 'URL ou perfil do negócio *',
    nameLabel: 'Nome do negócio (opcional)',
    sourceLabel: 'Fonte',
    categoryLabel: 'Tipo de prospecção',
    notesLabel: 'Texto público / notas (opcional)',
    urlPlaceholder: 'https://exemplo.com',
    namePlaceholder: 'ex.: Luna Travel',
    notesPlaceholder: 'Cole uma bio, avaliações ou qualquer coisa que descreva o que eles fazem.',
    missingUrl: 'Adicione uma URL ou link de perfil do negócio para analisar.',
    analyzeError: 'Não foi possível analisar este lead.',
    genericError: 'Algo deu errado. Tente novamente.',
    analyzing: 'Analisando…',
    analyzeButton: 'Analisar e colocar lead na fila',
    viewContacts: 'Ver fila de contatos',
    leadQueued: 'Lead na fila',
    newLead: 'Novo lead',
    draftFirstTouch: 'Primeiro contato em rascunho',
    reviewContacts: 'Revisar em contatos',
    openEngine: 'Abrir motor',
    platforms: {
      manual: 'Manual', google: 'Google', facebook: 'Facebook', instagram: 'Instagram',
      linkedin: 'LinkedIn', tiktok: 'TikTok', youtube: 'YouTube', telegram: 'Telegram',
      wechat: 'WeChat', reddit: 'Reddit', website: 'Site', directory: 'Diretório',
    },
    categories: { company: 'Empresa', affiliate: 'Afiliado / Parceiro', media: 'Plataforma de Mídia' },
  },
  es: {
    eyebrow: 'Descubrimiento',
    title: 'Encuentra un negocio y deja que la IA prepare la prospección.',
    subtitle: 'Pega un sitio público, perfil de Google o página social. SignalBoost analiza el negocio, predice sus necesidades y coloca un lead listo para revisar en la cola de contactos.',
    urlLabel: 'URL o perfil del negocio *',
    nameLabel: 'Nombre del negocio (opcional)',
    sourceLabel: 'Fuente',
    categoryLabel: 'Tipo de prospección',
    notesLabel: 'Texto público / notas (opcional)',
    urlPlaceholder: 'https://ejemplo.com',
    namePlaceholder: 'ej.: Luna Travel',
    notesPlaceholder: 'Pega una bio, reseñas o cualquier cosa que describa lo que hacen.',
    missingUrl: 'Agrega una URL o enlace de perfil del negocio para analizar.',
    analyzeError: 'No se pudo analizar este lead.',
    genericError: 'Algo salió mal. Inténtalo de nuevo.',
    analyzing: 'Analizando…',
    analyzeButton: 'Analizar y poner lead en cola',
    viewContacts: 'Ver cola de contactos',
    leadQueued: 'Lead en cola',
    newLead: 'Nuevo lead',
    draftFirstTouch: 'Primer contacto en borrador',
    reviewContacts: 'Revisar en contactos',
    openEngine: 'Abrir motor',
    platforms: {
      manual: 'Manual', google: 'Google', facebook: 'Facebook', instagram: 'Instagram',
      linkedin: 'LinkedIn', tiktok: 'TikTok', youtube: 'YouTube', telegram: 'Telegram',
      wechat: 'WeChat', reddit: 'Reddit', website: 'Sitio web', directory: 'Directorio',
    },
    categories: { company: 'Empresa', affiliate: 'Afiliado / Socio', media: 'Plataforma de Medios' },
  },
  pl: {
    eyebrow: 'Odkrywanie',
    title: 'Znajdź firmę i pozwól AI przygotować outreach.',
    subtitle: 'Wklej publiczną stronę, profil Google albo stronę społecznościową. SignalBoost analizuje firmę, przewiduje jej potrzeby i dodaje lead do kolejki kontaktów.',
    urlLabel: 'URL firmy lub profil *',
    nameLabel: 'Nazwa firmy (opcjonalnie)',
    sourceLabel: 'Źródło',
    categoryLabel: 'Typ outreachu',
    notesLabel: 'Tekst publiczny / notatki (opcjonalnie)',
    urlPlaceholder: 'https://przyklad.com',
    namePlaceholder: 'np. Luna Travel',
    notesPlaceholder: 'Wklej bio, opinie albo opis tego, czym się zajmują.',
    missingUrl: 'Dodaj URL firmy lub link do profilu, aby przeanalizować.',
    analyzeError: 'Nie można przeanalizować tego leada.',
    genericError: 'Coś poszło nie tak. Spróbuj ponownie.',
    analyzing: 'Analizowanie…',
    analyzeButton: 'Analizuj i dodaj lead',
    viewContacts: 'Zobacz kolejkę kontaktów',
    leadQueued: 'Lead dodany',
    newLead: 'Nowy lead',
    draftFirstTouch: 'Szkic pierwszego kontaktu',
    reviewContacts: 'Sprawdź w kontaktach',
    openEngine: 'Otwórz silnik',
    platforms: {
      manual: 'Manualnie', google: 'Google', facebook: 'Facebook', instagram: 'Instagram',
      linkedin: 'LinkedIn', tiktok: 'TikTok', youtube: 'YouTube', telegram: 'Telegram',
      wechat: 'WeChat', reddit: 'Reddit', website: 'Strona', directory: 'Katalog',
    },
    categories: { company: 'Firma', affiliate: 'Partner / Afiliacja', media: 'Platforma medialna' },
  },
  ru: {
    eyebrow: 'Поиск',
    title: 'Найдите компанию и позвольте AI подготовить аутрич.',
    subtitle: 'Вставьте публичный сайт, профиль Google или социальную страницу. SignalBoost анализирует бизнес, прогнозирует его потребности и добавляет lead в очередь контактов.',
    urlLabel: 'URL компании или профиль *',
    nameLabel: 'Название компании (необязательно)',
    sourceLabel: 'Источник',
    categoryLabel: 'Тип аутрича',
    notesLabel: 'Публичный текст / заметки (необязательно)',
    urlPlaceholder: 'https://example.com',
    namePlaceholder: 'например: Luna Travel',
    notesPlaceholder: 'Вставьте био, отзывы или описание того, чем они занимаются.',
    missingUrl: 'Добавьте URL компании или ссылку на профиль для анализа.',
    analyzeError: 'Не удалось проанализировать этот lead.',
    genericError: 'Что-то пошло не так. Попробуйте снова.',
    analyzing: 'Анализ…',
    analyzeButton: 'Анализировать и добавить lead',
    viewContacts: 'Посмотреть очередь контактов',
    leadQueued: 'Lead добавлен',
    newLead: 'Новый lead',
    draftFirstTouch: 'Черновик первого контакта',
    reviewContacts: 'Проверить в контактах',
    openEngine: 'Открыть движок',
    platforms: {
      manual: 'Вручную', google: 'Google', facebook: 'Facebook', instagram: 'Instagram',
      linkedin: 'LinkedIn', tiktok: 'TikTok', youtube: 'YouTube', telegram: 'Telegram',
      wechat: 'WeChat', reddit: 'Reddit', website: 'Сайт', directory: 'Каталог',
    },
    categories: { company: 'Компания', affiliate: 'Партнёр / Аффилиат', media: 'Медиаплатформа' },
  },
}

function copyFor(lang: string): DiscoveryCopy {
  return COPY[lang] || COPY.en
}
export default function OutreachDiscoveryPage() {
  const { lang } = useI18n()
  const copy = copyFor(lang)

  const [businessUrl, setBusinessUrl] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [platform, setPlatform] = useState('manual')
  const [category, setCategory] = useState('company')
  const [publicText, setPublicText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<any>(null)

  async function analyze() {
    setError('')
    setResult(null)

    let url = businessUrl.trim()

    if (!url) {
      setError(copy.missingUrl)
      return
    }

    // Normalize: add https:// if the user didn't type a scheme.
    if (!/^https?:\/\//i.test(url)) {
      url = `https://${url}`
    }

    setLoading(true)

    try {
      const res = await fetch('/api/outreach/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_url: url,
          business_name: businessName.trim() || undefined,
          source_platform: platform,
          category,
          language: lang,
          public_text: publicText.trim() || undefined,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data?.error || copy.analyzeError)
        return
      }

      setResult(data.outreach)
    } catch {
      setError(copy.genericError)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="sb-glass" style={{ padding: 24 }}>
      <div style={{ marginBottom: 20 }}>
        <span className="sb-eyebrow">{copy.eyebrow}</span>

        <h1 className="sb-h2" style={{ marginTop: 10 }}>
          {copy.title}
        </h1>

        <p className="sb-body" style={{ maxWidth: 680 }}>
          {copy.subtitle}
        </p>
      </div>

      <section className="sb-card" style={{ padding: 20, display: 'grid', gap: 14 }}>
        <div style={{ display: 'grid', gap: 6 }}>
          <label className="sb-eyebrow" htmlFor="biz-url">
            {copy.urlLabel}
          </label>

          <input
            id="biz-url"
            className="sb-input"
            value={businessUrl}
            onChange={(event) => setBusinessUrl(event.target.value)}
            placeholder={copy.urlPlaceholder}
            style={{ padding: 12 }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,220px)', gap: 12 }}>
          <div style={{ display: 'grid', gap: 6 }}>
            <label className="sb-eyebrow" htmlFor="biz-name">
              {copy.nameLabel}
            </label>

            <input
              id="biz-name"
              className="sb-input"
              value={businessName}
              onChange={(event) => setBusinessName(event.target.value)}
              placeholder={copy.namePlaceholder}
              style={{ padding: 12 }}
            />
          </div>

          <div style={{ display: 'grid', gap: 6 }}>
            <label className="sb-eyebrow" htmlFor="biz-platform">
              {copy.sourceLabel}
            </label>

            <select
              id="biz-platform"
              className="sb-input"
              value={platform}
              onChange={(event) => setPlatform(event.target.value)}
              style={{ padding: 12 }}
            >
              {PLATFORMS.map((item) => (
                <option key={item} value={item}>
                  {copy.platforms[item] || item}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 6 }}>
          <label className="sb-eyebrow" htmlFor="biz-category">
            {copy.categoryLabel}
          </label>

          <select
            id="biz-category"
            className="sb-input"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            style={{ padding: 12 }}
          >
            {CATEGORIES.map((item) => (
              <option key={item} value={item}>
                {copy.categories[item] || item}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'grid', gap: 6 }}>
          <label className="sb-eyebrow" htmlFor="biz-text">
            {copy.notesLabel}
          </label>

          <textarea
            id="biz-text"
            className="sb-input"
            value={publicText}
            onChange={(event) => setPublicText(event.target.value)}
            rows={4}
            placeholder={copy.notesPlaceholder}
            style={{ padding: 12, resize: 'vertical' }}
          />
        </div>

        <div className="sb-cta-row">
          <button className="sb-button-primary" type="button" onClick={analyze} disabled={loading}>
            {loading ? copy.analyzing : copy.analyzeButton}
          </button>

          <Link className="sb-button-secondary" href="/dashboard/outreach/contacts">
            {copy.viewContacts}
          </Link>
        </div>

        {error ? (
          <p className="sb-caption" style={{ color: '#fca5a5', margin: 0 }}>
            {error}
          </p>
        ) : null}
      </section>

      {result ? (
        <section className="sb-card" style={{ padding: 20, marginTop: 20 }}>
          <span className="sb-eyebrow" style={{ color: '#86efac' }}>
            {copy.leadQueued}
          </span>

          <h2 className="sb-h3" style={{ marginTop: 8 }}>
            {result.business_name || result.analyzer_summary?.business_name || copy.newLead}
          </h2>

          {result.outreach_message ? (
            <div className="sb-ai-feedback" style={{ marginTop: 12 }}>
              <strong>{copy.draftFirstTouch}</strong>
              <p style={{ whiteSpace: 'pre-wrap' }}>{result.outreach_message}</p>
            </div>
          ) : null}

          <div className="sb-cta-row" style={{ marginTop: 14 }}>
            <Link className="sb-button-primary" href="/dashboard/outreach/contacts">
              {copy.reviewContacts}
            </Link>

            <Link className="sb-button-secondary" href="/dashboard/outreach/outreach">
              {copy.openEngine}
            </Link>
          </div>
        </section>
      ) : null}
    </main>
  )
}

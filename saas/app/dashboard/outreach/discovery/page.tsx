'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'

const PLATFORMS = ['manual', 'google', 'facebook', 'instagram', 'linkedin', 'tiktok', 'youtube', 'telegram', 'wechat', 'reddit', 'website', 'directory']
const CATEGORIES = ['company', 'affiliate', 'media']

type DiscoveryCopy = {
  eyebrow: string; title: string; subtitle: string; urlLabel: string; nameLabel: string
  sourceLabel: string; categoryLabel: string; notesLabel: string; urlPlaceholder: string
  namePlaceholder: string; notesPlaceholder: string; missingUrl: string; analyzeError: string
  genericError: string; analyzing: string; analyzeButton: string; viewContacts: string
  leadQueued: string; newLead: string; draftFirstTouch: string; reviewContacts: string
  openEngine: string; generateDeck: string; generatingDeck: string; deckError: string
  platforms: Record<string, string>; categories: Record<string, string>
}

const COPY: Record<string, DiscoveryCopy> = {
  en: {
    eyebrow: 'Discovery', title: 'Find a business and let AI prepare the outreach.',
    subtitle: 'Paste a public website, Google profile, or social page. SignalBoost analyzes the business, predicts its needs, and drops a ready-to-review lead into your contacts queue.',
    urlLabel: 'Business URL or profile *', nameLabel: 'Business name (optional)',
    sourceLabel: 'Source', categoryLabel: 'Outreach type', notesLabel: 'Public text / notes (optional)',
    urlPlaceholder: 'https://example.com', namePlaceholder: 'e.g. Luna Travel',
    notesPlaceholder: 'Paste a bio, reviews, or anything that describes what they do.',
    missingUrl: 'Add a business URL or profile link to analyze.',
    analyzeError: 'Could not analyze this lead.', genericError: 'Something went wrong. Please try again.',
    analyzing: 'Analyzing…', analyzeButton: 'Analyze & queue lead', viewContacts: 'View contacts queue',
    leadQueued: 'Lead queued', newLead: 'New lead', draftFirstTouch: 'Draft first touch',
    reviewContacts: 'Review in contacts', openEngine: 'Open engine',
    generateDeck: 'Generate pitch deck', generatingDeck: 'Building deck…', deckError: 'Could not generate the deck.',
    platforms: { manual: 'Manual', google: 'Google', facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn', tiktok: 'TikTok', youtube: 'YouTube', telegram: 'Telegram', wechat: 'WeChat', reddit: 'Reddit', website: 'Website', directory: 'Directory' },
    categories: { company: 'Company', affiliate: 'Affiliate / Partner', media: 'Media Platform' },
  },
  es: {
    eyebrow: 'Descubrimiento', title: 'Encuentra un negocio y deja que la IA prepare la prospección.',
    subtitle: 'Pega un sitio público, perfil de Google o página social. SignalBoost analiza el negocio, predice sus necesidades y coloca un lead listo para revisar en la cola de contactos.',
    urlLabel: 'URL o perfil del negocio *', nameLabel: 'Nombre del negocio (opcional)',
    sourceLabel: 'Fuente', categoryLabel: 'Tipo de prospección', notesLabel: 'Texto público / notas (opcional)',
    urlPlaceholder: 'https://ejemplo.com', namePlaceholder: 'ej.: Luna Travel',
    notesPlaceholder: 'Pega una bio, reseñas o cualquier cosa que describa lo que hacen.',
    missingUrl: 'Agrega una URL o enlace de perfil del negocio para analizar.',
    analyzeError: 'No se pudo analizar este lead.', genericError: 'Algo salió mal. Inténtalo de nuevo.',
    analyzing: 'Analizando…', analyzeButton: 'Analizar y poner lead en cola', viewContacts: 'Ver cola de contactos',
    leadQueued: 'Lead en cola', newLead: 'Nuevo lead', draftFirstTouch: 'Primer contacto en borrador',
    reviewContacts: 'Revisar en contactos', openEngine: 'Abrir motor',
    generateDeck: 'Generar presentación', generatingDeck: 'Creando presentación…', deckError: 'No se pudo generar la presentación.',
    platforms: { manual: 'Manual', google: 'Google', facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn', tiktok: 'TikTok', youtube: 'YouTube', telegram: 'Telegram', wechat: 'WeChat', reddit: 'Reddit', website: 'Sitio web', directory: 'Directorio' },
    categories: { company: 'Empresa', affiliate: 'Afiliado / Socio', media: 'Plataforma de Medios' },
  },
  pt: {
    eyebrow: 'Descoberta', title: 'Encontre um negócio e deixe a IA preparar a prospecção.',
    subtitle: 'Cole um site público, perfil do Google ou página social. O SignalBoost analisa o negócio, prevê suas necessidades e coloca um lead pronto para revisão na fila de contatos.',
    urlLabel: 'URL ou perfil do negócio *', nameLabel: 'Nome do negócio (opcional)',
    sourceLabel: 'Fonte', categoryLabel: 'Tipo de prospecção', notesLabel: 'Texto público / notas (opcional)',
    urlPlaceholder: 'https://exemplo.com', namePlaceholder: 'ex.: Luna Travel',
    notesPlaceholder: 'Cole uma bio, avaliações ou qualquer coisa que descreva o que eles fazem.',
    missingUrl: 'Adicione uma URL ou link de perfil do negócio para analisar.',
    analyzeError: 'Não foi possível analisar este lead.', genericError: 'Algo deu errado. Tente novamente.',
    analyzing: 'Analisando…', analyzeButton: 'Analisar e colocar lead na fila', viewContacts: 'Ver fila de contatos',
    leadQueued: 'Lead na fila', newLead: 'Novo lead', draftFirstTouch: 'Primeiro contato em rascunho',
    reviewContacts: 'Revisar em contatos', openEngine: 'Abrir motor',
    generateDeck: 'Gerar apresentação', generatingDeck: 'Criando apresentação…', deckError: 'Não foi possível gerar a apresentação.',
    platforms: { manual: 'Manual', google: 'Google', facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn', tiktok: 'TikTok', youtube: 'YouTube', telegram: 'Telegram', wechat: 'WeChat', reddit: 'Reddit', website: 'Site', directory: 'Diretório' },
    categories: { company: 'Empresa', affiliate: 'Afiliado / Parceiro', media: 'Plataforma de Mídia' },
  },
  pl: {
    eyebrow: 'Odkrywanie', title: 'Znajdź firmę i pozwól AI przygotować outreach.',
    subtitle: 'Wklej publiczną stronę, profil Google albo stronę społecznościową. SignalBoost analizuje firmę, przewiduje jej potrzeby i dodaje lead do kolejki kontaktów.',
    urlLabel: 'URL firmy lub profil *', nameLabel: 'Nazwa firmy (opcjonalnie)',
    sourceLabel: 'Źródło', categoryLabel: 'Typ outreachu', notesLabel: 'Tekst publiczny / notatki (opcjonalnie)',
    urlPlaceholder: 'https://przyklad.com', namePlaceholder: 'np. Luna Travel',
    notesPlaceholder: 'Wklej bio, opinie albo opis tego, czym się zajmują.',
    missingUrl: 'Dodaj URL firmy lub link do profilu, aby przeanalizować.',
    analyzeError: 'Nie można przeanalizować tego leada.', genericError: 'Coś poszło nie tak. Spróbuj ponownie.',
    analyzing: 'Analizowanie…', analyzeButton: 'Analizuj i dodaj lead', viewContacts: 'Zobacz kolejkę kontaktów',
    leadQueued: 'Lead dodany', newLead: 'Nowy lead', draftFirstTouch: 'Szkic pierwszego kontaktu',
    reviewContacts: 'Sprawdź w kontaktach', openEngine: 'Otwórz silnik',
    generateDeck: 'Wygeneruj prezentację', generatingDeck: 'Tworzenie prezentacji…', deckError: 'Nie można wygenerować prezentacji.',
    platforms: { manual: 'Manualnie', google: 'Google', facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn', tiktok: 'TikTok', youtube: 'YouTube', telegram: 'Telegram', wechat: 'WeChat', reddit: 'Reddit', website: 'Strona', directory: 'Katalog' },
    categories: { company: 'Firma', affiliate: 'Partner / Afiliacja', media: 'Platforma medialna' },
  },
  ru: {
    eyebrow: 'Поиск', title: 'Найдите компанию и позвольте AI подготовить аутрич.',
    subtitle: 'Вставьте публичный сайт, профиль Google или социальную страницу. SignalBoost анализирует бизнес, прогнозирует его потребности и добавляет lead в очередь контактов.',
    urlLabel: 'URL компании или профиль *', nameLabel: 'Название компании (необязательно)',
    sourceLabel: 'Источник', categoryLabel: 'Тип аутрича', notesLabel: 'Публичный текст / заметки (необязательно)',
    urlPlaceholder: 'https://example.com', namePlaceholder: 'например: Luna Travel',
    notesPlaceholder: 'Вставьте био, отзывы или описание того, чем они занимаются.',
    missingUrl: 'Добавьте URL компании или ссылку на профиль для анализа.',
    analyzeError: 'Не удалось проанализировать этот lead.', genericError: 'Что-то пошло не так. Попробуйте снова.',
    analyzing: 'Анализ…', analyzeButton: 'Анализировать и добавить lead', viewContacts: 'Посмотреть очередь контактов',
    leadQueued: 'Lead добавлен', newLead: 'Новый lead', draftFirstTouch: 'Черновик первого контакта',
    reviewContacts: 'Проверить в контактах', openEngine: 'Открыть движок',
    generateDeck: 'Создать презентацию', generatingDeck: 'Создание презентации…', deckError: 'Не удалось создать презентацию.',
    platforms: { manual: 'Вручную', google: 'Google', facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn', tiktok: 'TikTok', youtube: 'YouTube', telegram: 'Telegram', wechat: 'WeChat', reddit: 'Reddit', website: 'Сайт', directory: 'Каталог' },
    categories: { company: 'Компания', affiliate: 'Партнёр / Аффилиат', media: 'Медиаплатформа' },
  },
}

export default function OutreachDiscoveryPage() {
  const { lang } = useI18n()
  const copy = COPY[lang] || COPY.en

  const [businessUrl, setBusinessUrl]   = useState('')
  const [businessName, setBusinessName] = useState('')
  const [platform, setPlatform]         = useState('manual')
  const [category, setCategory]         = useState('company')
  const [publicText, setPublicText]     = useState('')
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState('')
  const [result, setResult]             = useState<any>(null)
  const [deckLoading, setDeckLoading]   = useState(false)
  const [deckError, setDeckError]       = useState('')

  async function analyze() {
    setError(''); setResult(null); setDeckError('')
    let url = businessUrl.trim()
    if (!url) { setError(copy.missingUrl); return }
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`
    setLoading(true)
    try {
      const res = await fetch('/api/outreach/analyze', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_url: url, business_name: businessName.trim() || undefined, source_platform: platform, category, language: lang, public_text: publicText.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data?.error || copy.analyzeError); return }
      setResult(data.outreach)
    } catch { setError(copy.genericError) }
    finally { setLoading(false) }
  }

  async function generateDeck() {
    if (!result?.id) return
    setDeckError(''); setDeckLoading(true)
    try {
      const res = await fetch('/api/outreach/deck', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: result.id, category, language: lang }),
      })
      if (!res.ok) {
        let msg = copy.deckError
        try { const data = await res.json(); msg = data?.error || msg } catch {}
        setDeckError(msg); return
      }
      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      const name = (result.business_name || result.analyzer_summary?.business_name || 'partner').replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 40) || 'partner'
      const a = document.createElement('a'); a.href = objectUrl; a.download = `signalboost-deck-${name}.pdf`
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(objectUrl)
    } catch { setDeckError(copy.deckError) }
    finally { setDeckLoading(false) }
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', display: 'grid', gap: 14, color: 'var(--text-primary)' }}>

      {/* Header — compact studio bar */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', borderBottom: '1px solid rgba(255,255,255,.09)', paddingBottom: 12 }}>
        <div style={{ minWidth: 0 }}>
          <p className="sb-eyebrow" style={{ margin: 0 }}>🔍 {copy.eyebrow}</p>
          <h1 style={{ fontSize: 22, fontWeight: 950, letterSpacing: '-.04em', lineHeight: 1.15, margin: '4px 0 0' }}>{copy.title}</h1>
        </div>
        <Link className="sb-button-secondary" href="/dashboard/outreach/contacts" style={{ fontSize: 13, padding: '9px 15px', whiteSpace: 'nowrap' }}>{copy.viewContacts}</Link>
      </div>

      {/* Form — flat */}
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'grid', gap: 6 }}>
          <label className="sb-eyebrow" style={{ fontSize: 10 }} htmlFor="biz-url">{copy.urlLabel}</label>
          <input id="biz-url" className="sb-input" value={businessUrl} onChange={e => setBusinessUrl(e.target.value)} placeholder={copy.urlPlaceholder} style={{ padding: '11px 14px', borderRadius: 12, fontSize: 14 }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <div style={{ display: 'grid', gap: 6 }}>
            <label className="sb-eyebrow" style={{ fontSize: 10 }} htmlFor="biz-name">{copy.nameLabel}</label>
            <input id="biz-name" className="sb-input" value={businessName} onChange={e => setBusinessName(e.target.value)} placeholder={copy.namePlaceholder} style={{ padding: '11px 14px', borderRadius: 12, fontSize: 14 }} />
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            <label className="sb-eyebrow" style={{ fontSize: 10 }} htmlFor="biz-platform">{copy.sourceLabel}</label>
            <select id="biz-platform" className="sb-input" value={platform} onChange={e => setPlatform(e.target.value)} style={{ padding: '11px 14px', borderRadius: 12, fontSize: 14 }}>
              {PLATFORMS.map(item => <option key={item} value={item}>{copy.platforms[item] || item}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            <label className="sb-eyebrow" style={{ fontSize: 10 }} htmlFor="biz-category">{copy.categoryLabel}</label>
            <select id="biz-category" className="sb-input" value={category} onChange={e => setCategory(e.target.value)} style={{ padding: '11px 14px', borderRadius: 12, fontSize: 14 }}>
              {CATEGORIES.map(item => <option key={item} value={item}>{copy.categories[item] || item}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 6 }}>
          <label className="sb-eyebrow" style={{ fontSize: 10 }} htmlFor="biz-text">{copy.notesLabel}</label>
          <textarea id="biz-text" className="sb-input" value={publicText} onChange={e => setPublicText(e.target.value)} rows={2} placeholder={copy.notesPlaceholder} style={{ padding: '11px 14px', borderRadius: 12, resize: 'vertical', fontSize: 14, lineHeight: 1.6 }} />
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="sb-button-primary" type="button" onClick={analyze} disabled={loading} style={{ opacity: loading ? 0.7 : 1 }}>
            {loading ? copy.analyzing : copy.analyzeButton}
          </button>
        </div>
        {error && <p style={{ color: '#fca5a5', fontSize: 13, margin: 0 }}>{error}</p>}
      </div>

      {/* Result */}
      {result && (
        <div style={{ borderTop: '1px solid rgba(74,222,128,.35)', borderLeft: '2px solid rgba(74,222,128,.5)', paddingTop: 16, paddingLeft: 14 }}>
          <p className="sb-eyebrow" style={{ color: '#86efac' }}>✓ {copy.leadQueued}</p>
          <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.03em', margin: '8px 0 14px' }}>
            {result.business_name || result.analyzer_summary?.business_name || copy.newLead}
          </h2>
          {result.outreach_message && (
            <div style={{ borderLeft: '2px solid rgba(255,195,0,.55)', paddingLeft: 14, marginBottom: 14 }}>
              <strong style={{ color: '#ffc300', fontSize: 13 }}>{copy.draftFirstTouch}</strong>
              <p style={{ color: 'rgba(255,255,255,.72)', lineHeight: 1.7, whiteSpace: 'pre-wrap', marginTop: 8 }}>{result.outreach_message}</p>
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link className="sb-button-primary" href="/dashboard/outreach/contacts">{copy.reviewContacts}</Link>
            <button className="sb-button-secondary" type="button" onClick={generateDeck} disabled={deckLoading} style={{ opacity: deckLoading ? 0.7 : 1 }}>
              {deckLoading ? copy.generatingDeck : copy.generateDeck}
            </button>
            <Link className="sb-button-secondary" href="/dashboard/outreach/outreach">{copy.openEngine}</Link>
          </div>
          {deckError && <p style={{ color: '#fca5a5', fontSize: 13, marginTop: 10 }}>{deckError}</p>}
        </div>
      )}
    </div>
  )
}

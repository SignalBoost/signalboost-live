'use client'

import { useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import SitePreview, { type SitePreviewContent } from '@/components/operator/SitePreview'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'
const COPY: Record<string, Record<Lang, string>> = {
  eyebrow:      { en: 'AI Website Builder', es: 'Constructor de sitios con IA', pt: 'Construtor de sites com IA', pl: 'Kreator stron z IA', ru: 'ИИ-конструктор сайтов' },
  title:        { en: 'Build Website', es: 'Construir sitio web', pt: 'Criar site', pl: 'Zbuduj stronę', ru: 'Создать сайт' },
  subtitle:     { en: 'Describe your business and we\'ll generate a complete, multilingual website you can publish instantly.', es: 'Describe tu negocio y generaremos un sitio web completo y multilingüe que puedes publicar al instante.', pt: 'Descreva seu negócio e geraremos um site completo e multilíngue que você pode publicar instantaneamente.', pl: 'Opisz swoją firmę, a wygenerujemy kompletną, wielojęzyczną stronę, którą możesz natychmiast opublikować.', ru: 'Опишите свой бизнес, и мы создадим полноценный многоязычный сайт.' },
  placeholder:  { en: 'e.g. A cozy Italian restaurant in downtown Chicago specializing in homemade pasta and wood-fired pizza…', es: 'p.ej. Un acogedor restaurante italiano en el centro de Chicago especializado en pasta casera…', pt: 'ex. Um aconchegante restaurante italiano no centro de Chicago especializado em massa artesanal…', pl: 'np. Przytulna włoska restauracja w centrum Chicago specjalizująca się w domowym makaronie…', ru: 'напр. Уютный итальянский ресторан в центре Чикаго, специализирующийся на домашней пасте…' },
  generateBtn:  { en: '✦ Generate website', es: '✦ Generar sitio web', pt: '✦ Gerar site', pl: '✦ Generuj stronę', ru: '✦ Создать сайт' },
  generatingBtn:{ en: 'Generating…', es: 'Generando…', pt: 'Gerando…', pl: 'Generowanie…', ru: 'Создание…' },
  publishBtn:   { en: '🚀 Publish site', es: '🚀 Publicar sitio', pt: '🚀 Publicar site', pl: '🚀 Opublikuj stronę', ru: '🚀 Опубликовать сайт' },
  publishingBtn:{ en: 'Publishing…', es: 'Publicando…', pt: 'Publicando…', pl: 'Publikowanie…', ru: 'Публикация…' },
  regenerate:   { en: 'Regenerate', es: 'Regenerar', pt: 'Regenerar', pl: 'Wygeneruj ponownie', ru: 'Создать заново' },
  viewLive:     { en: 'View live →', es: 'Ver en vivo →', pt: 'Ver ao vivo →', pl: 'Zobacz na żywo →', ru: 'Просмотреть →' },
  previewTitle: { en: 'Preview', es: 'Vista previa', pt: 'Pré-visualização', pl: 'Podgląd', ru: 'Предпросмотр' },
  engineTitle:  { en: 'Generation engine', es: 'Motor de generación', pt: 'Motor de geração', pl: 'Silnik generowania', ru: 'Движок генерации' },
  hintLabel:    { en: 'Tips for best results', es: 'Consejos para mejores resultados', pt: 'Dicas para melhores resultados', pl: 'Wskazówki dla najlepszych wyników', ru: 'Советы для лучших результатов' },
  hint1:        { en: 'Include your business name, location, and what makes you unique', es: 'Incluye el nombre de tu negocio, ubicación y qué te hace único', pt: 'Inclua o nome do seu negócio, localização e o que te torna único', pl: 'Podaj nazwę firmy, lokalizację i co Cię wyróżnia', ru: 'Укажите название бизнеса, местоположение и что вас выделяет' },
  hint2:        { en: 'Mention your target audience and main services or products', es: 'Menciona tu público objetivo y principales servicios o productos', pt: 'Mencione seu público-alvo e principais serviços ou produtos', pl: 'Wspomnij o grupie docelowej i głównych usługach lub produktach', ru: 'Упомяните целевую аудиторию и основные услуги или продукты' },
  hint3:        { en: 'Add tone: professional, friendly, bold, minimalist, luxury…', es: 'Agrega tono: profesional, amigable, audaz, minimalista, lujoso…', pt: 'Adicione tom: profissional, amigável, ousado, minimalista, luxuoso…', pl: 'Dodaj ton: profesjonalny, przyjazny, odważny, minimalistyczny, luksusowy…', ru: 'Добавьте тон: профессиональный, дружелюбный, смелый, минималистичный, люксовый…' },
  errConnect:   { en: 'Could not connect. Please try again.', es: 'No se pudo conectar. Inténtalo de nuevo.', pt: 'Não foi possível conectar. Tente novamente.', pl: 'Nie można połączyć. Spróbuj ponownie.', ru: 'Не удалось подключиться. Попробуйте еще раз.' },
  charCount:    { en: 'characters', es: 'caracteres', pt: 'caracteres', pl: 'znaków', ru: 'символов' },
}

function c(key: string, lang: string): string {
  return COPY[key]?.[lang as Lang] ?? COPY[key]?.en ?? key
}

type StatusStep = { step: string; message: string }

export default function OperatorPage() {
  const { lang } = useI18n()
  const l = ['en', 'es', 'pt', 'pl', 'ru'].includes(lang) ? lang : 'en'

  const [description, setDescription] = useState('')
  const [generating, setGenerating]   = useState(false)
  const [publishing, setPublishing]   = useState(false)
  const [steps, setSteps]             = useState<StatusStep[]>([])
  const [content, setContent]         = useState<SitePreviewContent | null>(null)
  const [liveUrl, setLiveUrl]         = useState<string | null>(null)
  const [message, setMessage]         = useState('')

  async function generate() {
    const desc = description.trim()
    if (!desc || generating) return
    setGenerating(true); setSteps([]); setContent(null); setLiveUrl(null); setMessage('')
    try {
      const res = await fetch('/api/sites/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: desc, language: l }),
      })
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}))
        setMessage(err.error || c('errConnect', l))
        setGenerating(false)
        return
      }
      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue
          let chunk: any
          try { chunk = JSON.parse(trimmed) } catch { continue }
          if (chunk.type === 'status') setSteps(prev => [...prev, { step: chunk.step, message: chunk.message }])
          else if (chunk.type === 'result') {
            if (chunk.content) setContent(chunk.content)
            if (chunk.error && !chunk.content) setMessage(chunk.error)
          }
        }
      }
    } catch {
      setMessage(c('errConnect', l))
    } finally {
      setGenerating(false)
    }
  }

  async function publish() {
    if (!content || publishing) return
    setPublishing(true); setMessage('')
    try {
      const res = await fetch('/api/sites/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, language: l }),
      })
      const data = await res.json()
      if (!res.ok) setMessage(data.error || c('errConnect', l))
      else { setLiveUrl(data.url || null); setMessage(data.userMessage || '') }
    } catch {
      setMessage(c('errConnect', l))
    } finally {
      setPublishing(false)
    }
  }

  const fullUrl = liveUrl ? (typeof window !== 'undefined' ? window.location.origin : '') + liveUrl : null

  return (
    <div style={{ color: 'var(--text-primary)' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        {/* Header — compact studio bar */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', borderBottom: '1px solid rgba(255,255,255,.09)', paddingBottom: 12, marginBottom: 18 }}>
          <div style={{ minWidth: 0 }}>
            <p className="sb-eyebrow" style={{ margin: 0 }}>🌐 {c('eyebrow', l)}</p>
            <h1 style={{ fontSize: 22, fontWeight: 950, letterSpacing: '-.04em', lineHeight: 1.15, margin: '4px 0 0' }}>{c('title', l)}</h1>
          </div>
          <span className="sb-chip">{generating ? '...' : content ? 'READY' : 'IDLE'}</span>
        </div>

        {/* Main grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(220px, 1fr)', gap: 18, marginBottom: 24, alignItems: 'start' }}>

          {/* Input panel */}
          <div>
            <textarea
              className="sb-input"
              value={description}
              onChange={e => setDescription(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) generate() }}
              placeholder={c('placeholder', l)}
              rows={5}
              maxLength={1200}
              style={{ width: '100%', boxSizing: 'border-box', padding: '14px 16px', borderRadius: 12, resize: 'vertical', fontSize: 14, lineHeight: 1.7 }}
              disabled={generating}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, flexWrap: 'wrap', gap: 10 }}>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,.35)' }}>
                {description.length} / 1200 {c('charCount', l)}
              </span>
              <button onClick={generate} disabled={generating || !description.trim()} className="sb-button-primary" style={{ borderRadius: 12, padding: '12px 28px', opacity: generating || !description.trim() ? 0.55 : 1 }}>
                {generating ? c('generatingBtn', l) : c('generateBtn', l)}
              </button>
            </div>
          </div>

          {/* Tips panel */}
          <div style={{ borderLeft: '1px solid rgba(255,255,255,.08)', paddingLeft: 20 }}>
            <p className="sb-eyebrow" style={{ marginBottom: 14 }}>💡 {c('hintLabel', l)}</p>
            {[c('hint1', l), c('hint2', l), c('hint3', l)].map((hint, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 14 }}>
                <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: '50%', background: 'rgba(26,240,255,.15)', border: '1px solid rgba(26,240,255,.3)', color: '#1af0ff', fontSize: 11, fontWeight: 900, display: 'grid', placeItems: 'center' }}>
                  {i + 1}
                </span>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,.65)', lineHeight: 1.6 }}>{hint}</span>
              </div>
            ))}
            <div style={{ marginTop: 18, padding: '12px 14px', borderRadius: 12, background: 'rgba(255,195,0,.08)', border: '1px solid rgba(255,195,0,.2)', fontSize: 12, color: 'rgba(255,195,0,.9)', lineHeight: 1.6 }}>
              ⌘ + Enter {l === 'en' ? 'to generate' : l === 'es' ? 'para generar' : l === 'pt' ? 'para gerar' : l === 'pl' ? 'aby wygenerować' : 'для создания'}
            </div>
          </div>
        </div>

        {/* Generation status */}
        {(generating || steps.length > 0) && !content && (
          <div style={{ borderTop: '1px solid rgba(26,240,255,.25)', borderLeft: '2px solid rgba(26,240,255,.4)', paddingTop: 14, paddingLeft: 14, marginBottom: 20 }}>
            <p className="sb-eyebrow" style={{ marginBottom: 14 }}>{c('engineTitle', l)}</p>
            <div style={{ display: 'grid', gap: 8 }}>
              {steps.map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: i === steps.length - 1 ? '#fff' : 'rgba(255,255,255,.5)' }}>
                  <span style={{ flexShrink: 0, width: 8, height: 8, borderRadius: '50%', background: i === steps.length - 1 ? '#1af0ff' : 'rgba(255,255,255,.2)', boxShadow: i === steps.length - 1 ? '0 0 12px #1af0ff' : 'none' }} />
                  {s.message}
                </div>
              ))}
              {generating && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: '#ffc300' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ffc300', boxShadow: '0 0 12px #ffc300' }} />
                  {c('generatingBtn', l)}
                </div>
              )}
            </div>
          </div>
        )}

        {message && (
          <p style={{ color: liveUrl ? '#86efac' : '#fca5a5', fontSize: 13, marginBottom: 16 }}>{message}</p>
        )}

        {/* Result */}
        {content && (
          <div>
            {/* Action bar */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14, borderTop: '1px solid rgba(255,255,255,.09)', paddingTop: 14 }}>
              <p className="sb-eyebrow" style={{ flex: 1, margin: 0 }}>✦ {c('previewTitle', l)}</p>
              <button onClick={publish} disabled={publishing} className="sb-button-primary" style={{ borderRadius: 12, padding: '11px 24px', opacity: publishing ? 0.55 : 1 }}>
                {publishing ? c('publishingBtn', l) : c('publishBtn', l)}
              </button>
              <button onClick={() => { setContent(null); setSteps([]); setMessage(''); setLiveUrl(null) }} className="sb-button-secondary" style={{ borderRadius: 12 }}>
                {c('regenerate', l)}
              </button>
              {fullUrl && <a href={fullUrl} target="_blank" rel="noreferrer" className="sb-button-secondary" style={{ display: 'inline-flex', alignItems: 'center', borderRadius: 12 }}>{c('viewLive', l)}</a>}
            </div>

            {/* Preview */}
            <div style={{ borderRadius: 20, overflow: 'hidden', border: '1px solid rgba(255,255,255,.10)', boxShadow: '0 24px 80px rgba(0,0,0,.5)' }}>
              <SitePreview content={content} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

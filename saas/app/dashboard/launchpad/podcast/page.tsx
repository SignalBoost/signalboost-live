'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import ResetButton from '@/components/ResetButton'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'
const COPY: Record<string, Record<Lang, string>> = {
  title:         { en: '🎙️ Podcast Launchpad', es: '🎙️ Lanzador de Podcast', pt: '🎙️ Lançador de Podcast', pl: '🎙️ Kreator Podcastu', ru: '🎙️ Запуск подкаста' },
  subtitle:      { en: 'Build your podcast in guided steps', es: 'Construye tu podcast paso a paso', pt: 'Construa seu podcast passo a passo', pl: 'Zbuduj swój podcast krok po kroku', ru: 'Создайте подкаст пошагово' },
  placeholder:   { en: 'Describe your podcast idea…', es: 'Describe tu idea de podcast…', pt: 'Descreva sua ideia de podcast…', pl: 'Opisz swój pomysł na podcast…', ru: 'Опишите идею подкаста…' },
  solo:          { en: 'Solo', es: 'Solo', pt: 'Solo', pl: 'Solo', ru: 'Сольный' },
  interview:     { en: 'Interview', es: 'Entrevista', pt: 'Entrevista', pl: 'Wywiad', ru: 'Интервью' },
  cohost:        { en: 'Co-host', es: 'Co-presentador', pt: 'Co-apresentador', pl: 'Co-host', ru: 'Со-ведущий' },
  story:         { en: 'Storytelling', es: 'Narrativa', pt: 'Narrativa', pl: 'Opowiadanie', ru: 'Нарратив' },
  generate:      { en: 'Generate Podcast Sketch', es: 'Generar esquema de podcast', pt: 'Gerar esboço de podcast', pl: 'Wygeneruj szkic podcastu', ru: 'Создать концепцию подкаста' },
  generating:    { en: 'Generating…', es: 'Generando…', pt: 'Gerando…', pl: 'Generowanie…', ru: 'Создание…' },
  createPage:    { en: 'Create Podcast Page', es: 'Crear página de podcast', pt: 'Criar página de podcast', pl: 'Utwórz stronę podcastu', ru: 'Создать страницу подкаста' },
  openStudio:    { en: 'Open Podcast Studio', es: 'Abrir Podcast Studio', pt: 'Abrir Podcast Studio', pl: 'Otwórz Podcast Studio', ru: 'Открыть студию подкастов' },
  error:         { en: 'Could not generate podcast sketch.', es: 'No se pudo generar el esquema.', pt: 'Não foi possível gerar o esboço.', pl: 'Nie można wygenerować szkicu.', ru: 'Не удалось создать концепцию.' },
  cardNames:     { en: '🎙️ Podcast Names', es: '🎙️ Nombres del podcast', pt: '🎙️ Nomes do podcast', pl: '🎙️ Nazwy podcastu', ru: '🎙️ Названия подкаста' },
  cardDesc:      { en: '📝 Description', es: '📝 Descripción', pt: '📝 Descrição', pl: '📝 Opis', ru: '📝 Описание' },
  cardAudience:  { en: '👥 Target Audience', es: '👥 Audiencia objetivo', pt: '👥 Público-alvo', pl: '👥 Docelowi słuchacze', ru: '👥 Целевая аудитория' },
  cardEpisodes:  { en: '🎬 First Episodes', es: '🎬 Primeros episodios', pt: '🎬 Primeiros episódios', pl: '🎬 Pierwsze odcinki', ru: '🎬 Первые эпизоды' },
  cardIntro:     { en: '🎤 Intro Script', es: '🎤 Guión de intro', pt: '🎤 Script de introdução', pl: '🎤 Skrypt intro', ru: '🎤 Вступительный сценарий' },
  cardChecklist: { en: '✅ Launch Checklist', es: '✅ Lista de lanzamiento', pt: '✅ Lista de lançamento', pl: '✅ Lista startowa', ru: '✅ Чеклист запуска' },
  cardNext:      { en: '➡️ Next Step', es: '➡️ Siguiente paso', pt: '➡️ Próximo passo', pl: '➡️ Następny krok', ru: '➡️ Следующий шаг' },
}

function c(key: string, lang: string): string {
  return COPY[key]?.[lang as Lang] ?? COPY[key]?.en ?? key
}

type Sketch = {
  showNames: string[]
  showDescription: string
  targetAudience: string
  firstEpisodes: string[]
  introScript: string
  launchChecklist: string[]
  nextStep: string
}

function Card({ title, items, text }: { title: string; items?: string[]; text?: string }) {
  return (
    <div style={{ padding: 20, borderRadius: 20, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.10)' }}>
      <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 800 }}>{title}</h3>
      {text && <p style={{ color: 'rgba(255,255,255,.7)', lineHeight: 1.7, margin: 0 }}>{text}</p>}
      {items?.map(item => (
        <div key={item} style={{ marginBottom: 8, color: 'rgba(255,255,255,.7)', fontSize: 14, lineHeight: 1.6 }}>• {item}</div>
      ))}
    </div>
  )
}

export default function PodcastLaunchpad() {
  const { lang } = useI18n()
  const l = ['en', 'es', 'pt', 'pl', 'ru'].includes(lang) ? lang : 'en'

  const [experience, setExperience] = useState('guided')
  const [topic, setTopic]           = useState('')
  const [format, setFormat]         = useState('solo')
  const [loading, setLoading]       = useState(false)
  const [sketch, setSketch]         = useState<Sketch | null>(null)
  const [error, setError]           = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setExperience(params.get('experience') || 'guided')
  }, [])

  async function generateSketch() {
    if (!topic.trim()) return
    try {
      setLoading(true); setError('')
      const res = await fetch('/api/launchpad/podcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, format, experience }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || c('error', l))
      if (data.sketch) {
        setSketch(data.sketch)
        try { localStorage.setItem('podcastSketch', JSON.stringify(data.sketch)) } catch {}
      }
    } catch (err: any) {
      setError(err?.message || c('error', l))
    } finally {
      setLoading(false)
    }
  }

  function reset() {
    setTopic(''); setSketch(null); setLoading(false); setError('')
    window.scrollTo({ top: 0, behavior: 'auto' })
  }

  return (
    <div className="sb-hmi-shell" style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 0 80px' }}>

        <div className="sb-cockpit-hero" style={{ marginBottom: 28 }}>
          <p className="sb-hmi-kicker">🎙️ PODCAST</p>
          <h1 className="sb-h2" style={{ margin: '10px 0 12px' }}>{c('title', l)}</h1>
          <p className="sb-hmi-muted">{c('subtitle', l)}</p>
        </div>

        <div className="sb-glass-panel" style={{ padding: 24, marginBottom: 20 }}>
          <textarea
            value={topic}
            onChange={e => setTopic(e.target.value)}
            placeholder={c('placeholder', l)}
            rows={5}
            className="sb-input"
            style={{ width: '100%', boxSizing: 'border-box', padding: '13px 16px', borderRadius: 12, resize: 'vertical', fontSize: 14, lineHeight: 1.7 }}
          />
          <select
            value={format}
            onChange={e => setFormat(e.target.value)}
            className="sb-input"
            style={{ width: '100%', marginTop: 12, padding: '13px 16px', borderRadius: 12, fontSize: 14 }}
          >
            <option value="solo">{c('solo', l)}</option>
            <option value="interview">{c('interview', l)}</option>
            <option value="cohost">{c('cohost', l)}</option>
            <option value="story">{c('story', l)}</option>
          </select>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
            <button onClick={generateSketch} disabled={loading || !topic.trim()} className="sb-button-primary" style={{ borderRadius: 12, padding: '12px 28px', opacity: loading || !topic.trim() ? 0.55 : 1 }}>
              {loading ? c('generating', l) : c('generate', l)}
            </button>
            {(sketch || error) && <ResetButton onReset={reset} />}
            {sketch && (
              <>
                <button onClick={() => { window.location.href = '/dashboard/podcast' }} className="sb-button-secondary" style={{ borderRadius: 12 }}>
                  {c('createPage', l)}
                </button>
                <button onClick={() => { window.location.href = '/dashboard/podcast/studio' }} className="sb-button-secondary" style={{ borderRadius: 12, borderColor: 'rgba(59,130,246,.4)', color: '#93c5fd' }}>
                  {c('openStudio', l)}
                </button>
              </>
            )}
          </div>
          {error && <p style={{ color: '#fca5a5', marginTop: 12, fontSize: 13 }}>{error}</p>}
        </div>

        {sketch && (
          <div style={{ display: 'grid', gap: 14 }}>
            <Card title={c('cardNames', l)}     items={sketch.showNames} />
            <Card title={c('cardDesc', l)}       text={sketch.showDescription} />
            <Card title={c('cardAudience', l)}   text={sketch.targetAudience} />
            <Card title={c('cardEpisodes', l)}   items={sketch.firstEpisodes} />
            <Card title={c('cardIntro', l)}      text={sketch.introScript} />
            <Card title={c('cardChecklist', l)}  items={sketch.launchChecklist} />
            <Card title={c('cardNext', l)}       text={sketch.nextStep} />
          </div>
        )}
      </div>
    </div>
  )
}

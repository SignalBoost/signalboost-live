'use client'

import { useState } from 'react'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'
type Status = 'idle' | 'queuing' | 'queued' | 'rendering' | 'ready' | 'failed'

const COPY: Record<string, Record<Lang, string>> = {
  eyebrow:       { en: 'AI Video Generator', es: 'Generador de Video IA', pt: 'Gerador de Vídeo IA', pl: 'Generator Wideo AI', ru: 'AI Генератор Видео' },
  title:         { en: 'Generate a video from a prompt', es: 'Genera un video desde un prompt', pt: 'Gere um vídeo a partir de um prompt', pl: 'Wygeneruj wideo z promptu', ru: 'Создайте видео из запроса' },
  subtitle:      { en: 'Describe your video, pick a format, and SignalBoost renders it with AI visuals, voiceover, and your brand overlay.', es: 'Describe tu video, elige un formato y SignalBoost lo renderiza con IA.', pt: 'Descreva seu vídeo, escolha um formato e o SignalBoost renderiza com IA.', pl: 'Opisz wideo, wybierz format, a SignalBoost wyrenderuje je z AI.', ru: 'Опишите видео, выберите формат — SignalBoost отрендерит его с помощью ИИ.' },
  promptLabel:   { en: 'What should the video be about?', es: '¿De qué trata el video?', pt: 'Sobre o que é o vídeo?', pl: 'O czym ma być wideo?', ru: 'О чём видео?' },
  promptPh:      { en: 'e.g. A 30-second promo for SignalBoost showing the AI website builder, outreach engine, and affiliate mall...', es: 'ej. Un promo de 30s para SignalBoost mostrando el constructor de sitios IA...', pt: 'ex. Um promo de 30s para SignalBoost mostrando o construtor de sites IA...', pl: 'np. 30-sekundowy promo dla SignalBoost pokazujący kreator stron AI...', ru: 'напр. 30-секундный промо для SignalBoost, показывающий конструктор сайтов ИИ...' },
  audienceLabel: { en: 'Target audience', es: 'Audiencia objetivo', pt: 'Público-alvo', pl: 'Grupa docelowa', ru: 'Целевая аудитория' },
  audiencePh:    { en: 'e.g. Small business owners, entrepreneurs, content creators', es: 'ej. Dueños de pequeñas empresas, emprendedores', pt: 'ex. Donos de pequenas empresas, empreendedores', pl: 'np. Właściciele małych firm, przedsiębiorcy', ru: 'напр. Владельцы малого бизнеса, предприниматели' },
  formatLabel:   { en: 'Format', es: 'Formato', pt: 'Formato', pl: 'Format', ru: 'Формат' },
  toneLabel:     { en: 'Tone', es: 'Tono', pt: 'Tom', ru: 'Тон', pl: 'Ton' },
  generateBtn:   { en: 'Generate Video', es: 'Generar Video', pt: 'Gerar Vídeo', pl: 'Generuj Wideo', ru: 'Создать Видео' },
  queuingMsg:    { en: 'Queuing your video job...', es: 'Poniendo en cola tu video...', pt: 'Enfileirando seu vídeo...', pl: 'Dodawanie do kolejki...', ru: 'Добавление в очередь...' },
  queuedMsg:     { en: 'Video queued! Checking render status...', es: '¡Video en cola! Verificando estado...', pt: 'Vídeo na fila! Verificando status...', pl: 'Wideo w kolejce! Sprawdzanie statusu...', ru: 'Видео в очереди! Проверка статуса...' },
  renderingMsg:  { en: 'Rendering your video with AI visuals + voiceover... This takes 2–5 minutes.', es: 'Renderizando tu video con IA... Esto toma 2–5 minutos.', pt: 'Renderizando seu vídeo com IA... Isso leva 2–5 minutos.', pl: 'Renderowanie wideo z AI... To zajmuje 2–5 minut.', ru: 'Рендеринг видео с помощью ИИ... Это займёт 2–5 минут.' },
  readyMsg:      { en: 'Your video is ready!', es: '¡Tu video está listo!', pt: 'Seu vídeo está pronto!', pl: 'Twoje wideo jest gotowe!', ru: 'Ваше видео готово!' },
  failedMsg:     { en: 'Render failed. Please try again.', es: 'El renderizado falló. Intenta de nuevo.', pt: 'Renderização falhou. Tente novamente.', pl: 'Renderowanie nie powiodło się. Spróbuj ponownie.', ru: 'Рендеринг не удался. Попробуйте снова.' },
  downloadBtn:   { en: 'Download Video', es: 'Descargar Video', pt: 'Baixar Vídeo', pl: 'Pobierz Wideo', ru: 'Скачать Видео' },
  previewLabel:  { en: 'Preview', es: 'Vista previa', pt: 'Prévia', pl: 'Podgląd', ru: 'Предпросмотр' },
  newVideoBtn:   { en: 'Generate another', es: 'Generar otro', pt: 'Gerar outro', pl: 'Generuj kolejne', ru: 'Создать ещё' },
  queueNote:     { en: 'Videos are processed in the background. You can close this page — check the COS Video Queue for status.', es: 'Los videos se procesan en segundo plano. Puedes cerrar esta página.', pt: 'Os vídeos são processados em segundo plano. Você pode fechar esta página.', pl: 'Wideo są przetwarzane w tle. Możesz zamknąć tę stronę.', ru: 'Видео обрабатываются в фоне. Вы можете закрыть эту страницу.' },
}

function t(key: string, lang: Lang): string {
  return COPY[key]?.[lang] ?? COPY[key]?.en ?? key
}

const FORMATS = [
  { value: 'short_video', label: { en: '9:16 Short (TikTok / Reels / Shorts)', es: '9:16 Corto (TikTok / Reels / Shorts)', pt: '9:16 Curto (TikTok / Reels / Shorts)', pl: '9:16 Krótkie (TikTok / Reels / Shorts)', ru: '9:16 Короткое (TikTok / Reels / Shorts)' } },
  { value: 'youtube',     label: { en: '16:9 YouTube / LinkedIn',              es: '16:9 YouTube / LinkedIn',              pt: '16:9 YouTube / LinkedIn',              pl: '16:9 YouTube / LinkedIn',              ru: '16:9 YouTube / LinkedIn' } },
  { value: 'square',      label: { en: '1:1 Square (Instagram / Facebook)',     es: '1:1 Cuadrado (Instagram / Facebook)',  pt: '1:1 Quadrado (Instagram / Facebook)', pl: '1:1 Kwadratowe (Instagram / Facebook)', ru: '1:1 Квадратное (Instagram / Facebook)' } },
]

const TONES = [
  { value: 'hype',        label: { en: 'Hype / High-energy',  es: 'Hype / Alta energía',  pt: 'Hype / Alta energia',  pl: 'Hype / Wysoka energia', ru: 'Хайп / Высокая энергия' } },
  { value: 'professional',label: { en: 'Professional',        es: 'Profesional',           pt: 'Profissional',          pl: 'Profesjonalny',          ru: 'Профессиональный' } },
  { value: 'educational', label: { en: 'Educational',         es: 'Educativo',             pt: 'Educativo',             pl: 'Edukacyjny',             ru: 'Образовательный' } },
  { value: 'emotional',   label: { en: 'Emotional / Story',   es: 'Emocional / Historia',  pt: 'Emocional / História',  pl: 'Emocjonalny / Historia', ru: 'Эмоциональный / История' } },
]

const GOLD  = '#ffc300'
const CYAN  = '#1af0ff'

export default function VideoGeneratorPage() {
  // Detect lang from browser — same pattern as other pages
  const lang: Lang = (typeof navigator !== 'undefined'
    ? (['en','es','pt','pl','ru'].find(l => navigator.language.startsWith(l)) as Lang)
    : undefined) ?? 'en'

  const [prompt,   setPrompt]   = useState('')
  const [audience, setAudience] = useState('')
  const [format,   setFormat]   = useState('short_video')
  const [tone,     setTone]     = useState('hype')
  const [status,   setStatus]   = useState<Status>('idle')
  const [message,  setMessage]  = useState('')
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [jobId,    setJobId]    = useState<string | null>(null)
  const [pollCount,setPollCount]= useState(0)

  async function handleGenerate() {
    if (!prompt.trim()) return
    setStatus('queuing')
    setMessage(t('queuingMsg', lang))
    setVideoUrl(null)
    setJobId(null)
    setPollCount(0)

    try {
      const res = await fetch('/api/cos/video-production', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: prompt.trim().slice(0, 120),
          hook: prompt.trim(),
          audience: audience.trim() || 'general audience',
          production_tier: 'enterprise',
          platforms: format === 'short_video'
            ? ['TikTok', 'Instagram', 'Shorts']
            : format === 'youtube'
            ? ['YouTube', 'LinkedIn']
            : ['Instagram', 'Facebook'],
          queue_immediately: true,
          concept_approved: true,
          tone,
        }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error || 'Failed to queue video')
      const id = json.job?.id || null
      setJobId(id)
      setStatus('queued')
      setMessage(t('queuedMsg', lang))
      if (id) startPolling(id)
    } catch (err) {
      setStatus('failed')
      setMessage(err instanceof Error ? err.message : t('failedMsg', lang))
    }
  }

  function startPolling(id: string) {
    setStatus('rendering')
    setMessage(t('renderingMsg', lang))
    let attempts = 0
    const MAX = 60 // 5 minutes at 5s intervals

    const timer = setInterval(async () => {
      attempts++
      setPollCount(attempts)
      if (attempts > MAX) {
        clearInterval(timer)
        setStatus('queued')
        setMessage(t('queueNote', lang))
        return
      }
      try {
        const res = await fetch(`/api/cos/video-production?id=${encodeURIComponent(id)}`)
        const json = await res.json()
        const job = Array.isArray(json.jobs) ? json.jobs.find((j: any) => String(j.id) === String(id)) : null
        if (!job) return
        if (job.output_url || job.signed_output_url) {
          clearInterval(timer)
          setVideoUrl(job.signed_output_url || job.output_url)
          setStatus('ready')
          setMessage(t('readyMsg', lang))
        } else if (job.status === 'failed') {
          clearInterval(timer)
          setStatus('failed')
          setMessage(job.error || t('failedMsg', lang))
        }
      } catch {}
    }, 5000)
  }

  function reset() {
    setStatus('idle')
    setMessage('')
    setVideoUrl(null)
    setJobId(null)
    setPrompt('')
    setAudience('')
    setPollCount(0)
  }

  const isRunning = status === 'queuing' || status === 'queued' || status === 'rendering'

  return (
    <main style={{ color: '#fff', maxWidth: 900, margin: '0 auto', padding: '0 0 60px' }}>

      {/* Header */}
      <section style={{ borderBottom: '1px solid rgba(255,255,255,.1)', paddingBottom: 20, marginBottom: 28 }}>
        <p style={{ fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', color: GOLD, margin: 0 }}>
          {t('eyebrow', lang)}
        </p>
        <h1 style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-0.04em', margin: '8px 0 6px' }}>
          {t('title', lang)}
        </h1>
        <p style={{ color: 'rgba(255,255,255,.6)', lineHeight: 1.6, margin: 0, maxWidth: 680 }}>
          {t('subtitle', lang)}
        </p>
      </section>

      {/* Form */}
      {status === 'idle' || status === 'failed' ? (
        <section style={{ display: 'grid', gap: 18 }}>

          {/* Prompt */}
          <label style={{ display: 'grid', gap: 8, fontSize: 14 }}>
            <span style={{ color: 'rgba(255,255,255,.8)', fontWeight: 700 }}>{t('promptLabel', lang)}</span>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder={t('promptPh', lang)}
              rows={4}
              style={{
                background: 'rgba(255,255,255,.06)',
                border: '1px solid rgba(255,255,255,.12)',
                borderRadius: 14,
                color: '#fff',
                fontSize: 15,
                padding: '14px 16px',
                resize: 'vertical',
                outline: 'none',
                fontFamily: 'inherit',
                lineHeight: 1.6,
              }}
            />
          </label>

          {/* Audience */}
          <label style={{ display: 'grid', gap: 8, fontSize: 14 }}>
            <span style={{ color: 'rgba(255,255,255,.8)', fontWeight: 700 }}>{t('audienceLabel', lang)}</span>
            <input
              value={audience}
              onChange={e => setAudience(e.target.value)}
              placeholder={t('audiencePh', lang)}
              style={{
                background: 'rgba(255,255,255,.06)',
                border: '1px solid rgba(255,255,255,.12)',
                borderRadius: 14,
                color: '#fff',
                fontSize: 15,
                padding: '12px 16px',
                outline: 'none',
                fontFamily: 'inherit',
              }}
            />
          </label>

          {/* Format + Tone */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <label style={{ display: 'grid', gap: 8, fontSize: 14 }}>
              <span style={{ color: 'rgba(255,255,255,.8)', fontWeight: 700 }}>{t('formatLabel', lang)}</span>
              <select
                value={format}
                onChange={e => setFormat(e.target.value)}
                style={{
                  background: 'rgba(15,23,42,.9)',
                  border: '1px solid rgba(255,255,255,.12)',
                  borderRadius: 14,
                  color: '#fff',
                  fontSize: 14,
                  padding: '12px 14px',
                  outline: 'none',
                  fontFamily: 'inherit',
                }}
              >
                {FORMATS.map(f => (
                  <option key={f.value} value={f.value}>{f.label[lang] ?? f.label.en}</option>
                ))}
              </select>
            </label>

            <label style={{ display: 'grid', gap: 8, fontSize: 14 }}>
              <span style={{ color: 'rgba(255,255,255,.8)', fontWeight: 700 }}>{t('toneLabel', lang)}</span>
              <select
                value={tone}
                onChange={e => setTone(e.target.value)}
                style={{
                  background: 'rgba(15,23,42,.9)',
                  border: '1px solid rgba(255,255,255,.12)',
                  borderRadius: 14,
                  color: '#fff',
                  fontSize: 14,
                  padding: '12px 14px',
                  outline: 'none',
                  fontFamily: 'inherit',
                }}
              >
                {TONES.map(to => (
                  <option key={to.value} value={to.value}>{to.label[lang] ?? to.label.en}</option>
                ))}
              </select>
            </label>
          </div>

          {/* Error message */}
          {status === 'failed' && message && (
            <p style={{ color: '#ff6b6b', fontSize: 14, background: 'rgba(255,107,107,.1)', border: '1px solid rgba(255,107,107,.25)', borderRadius: 12, padding: '12px 16px', margin: 0 }}>
              {message}
            </p>
          )}

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={!prompt.trim()}
            style={{
              background: prompt.trim() ? GOLD : 'rgba(255,195,0,.3)',
              color: '#000',
              border: 'none',
              borderRadius: 14,
              padding: '16px 32px',
              fontSize: 16,
              fontWeight: 900,
              cursor: prompt.trim() ? 'pointer' : 'not-allowed',
              letterSpacing: '-0.02em',
              transition: 'opacity .2s',
            }}
          >
            {t('generateBtn', lang)}
          </button>
        </section>
      ) : null}

      {/* In-progress state */}
      {isRunning && (
        <section style={{
          border: '1px solid rgba(26,240,255,.22)',
          borderRadius: 20,
          padding: 32,
          background: 'linear-gradient(160deg, rgba(15,23,42,.92), rgba(3,7,18,.96))',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          display: 'grid',
          gap: 20,
          textAlign: 'center',
        }}>
          <Spinner />
          <p style={{ color: CYAN, fontWeight: 700, fontSize: 16, margin: 0 }}>{message}</p>
          {status === 'rendering' && (
            <p style={{ color: 'rgba(255,255,255,.5)', fontSize: 13, margin: 0 }}>
              {t('queueNote', lang)}
            </p>
          )}
          {pollCount > 0 && (
            <p style={{ color: 'rgba(255,255,255,.3)', fontSize: 11, fontFamily: 'monospace', margin: 0 }}>
              poll #{pollCount} · job {jobId || '—'}
            </p>
          )}
        </section>
      )}

      {/* Ready state */}
      {status === 'ready' && videoUrl && (
        <section style={{ display: 'grid', gap: 20 }}>
          <div style={{
            border: '1px solid rgba(255,195,0,.3)',
            borderRadius: 20,
            padding: 24,
            background: 'linear-gradient(160deg, rgba(15,23,42,.92), rgba(3,7,18,.96))',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
          }}>
            <p style={{ color: GOLD, fontWeight: 900, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.2em', margin: '0 0 16px' }}>
              {t('previewLabel', lang)}
            </p>
            <video
              src={videoUrl}
              controls
              playsInline
              style={{
                width: '100%',
                maxHeight: 520,
                borderRadius: 14,
                background: '#000',
                display: 'block',
              }}
            />
          </div>

          <p style={{ color: '#4ade80', fontWeight: 700, fontSize: 16, margin: 0, textAlign: 'center' }}>
            ✓ {message}
          </p>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <a
              href={videoUrl}
              download="signalboost-video.mp4"
              style={{
                flex: 1,
                minWidth: 180,
                background: GOLD,
                color: '#000',
                border: 'none',
                borderRadius: 14,
                padding: '14px 24px',
                fontSize: 15,
                fontWeight: 900,
                cursor: 'pointer',
                textAlign: 'center',
                textDecoration: 'none',
                display: 'block',
              }}
            >
              ↓ {t('downloadBtn', lang)}
            </a>
            <button
              onClick={reset}
              style={{
                flex: 1,
                minWidth: 180,
                background: 'rgba(255,255,255,.07)',
                color: '#fff',
                border: '1px solid rgba(255,255,255,.15)',
                borderRadius: 14,
                padding: '14px 24px',
                fontSize: 15,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {t('newVideoBtn', lang)}
            </button>
          </div>
        </section>
      )}
    </main>
  )
}

function Spinner() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <div style={{
        width: 48,
        height: 48,
        borderRadius: '50%',
        border: `3px solid rgba(26,240,255,.15)`,
        borderTopColor: CYAN,
        animation: 'spin 0.9s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

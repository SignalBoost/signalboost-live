'use client'

import { useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import SitePreview, { type SitePreviewContent } from '@/components/operator/SitePreview'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'
const COPY: Record<string, Record<Lang, string>> = {
  eyebrow:       { en: 'Website Optimization System', es: 'Sistema de optimización web', pt: 'Sistema de otimização de sites', pl: 'System optymalizacji stron', ru: 'Система оптимизации сайтов' },
  title:         { en: 'Optimize Website', es: 'Optimizar sitio web', pt: 'Otimizar site', pl: 'Optymalizuj stronę', ru: 'Оптимизировать сайт' },
  subtitle:      { en: 'Analyze any site, optimize the findings into a brief, and rebuild an improved version you can publish.', es: 'Analiza cualquier sitio, optimiza los hallazgos en un brief y reconstruye una versión mejorada.', pt: 'Analise qualquer site, otimize os achados em um brief e reconstrua uma versão melhorada.', pl: 'Analizuj dowolną stronę, optymalizuj wyniki w brief i odbuduj ulepszoną wersję.', ru: 'Анализируйте любой сайт, оптимизируйте выводы и пересоздайте улучшенную версию.' },
  stageAnalyze:  { en: 'Analyze', es: 'Analizar', pt: 'Analisar', pl: 'Analiza', ru: 'Анализ' },
  stageOptimize: { en: 'Optimize', es: 'Optimizar', pt: 'Otimizar', pl: 'Optymalizuj', ru: 'Оптимизация' },
  stageRebuild:  { en: 'Rebuild', es: 'Rebuild', pt: 'Reconstruir', pl: 'Przebuduj', ru: 'Пересоздать' },
  placeholder:   { en: 'yourwebsite.com', es: 'tusitioweb.com', pt: 'seusiteweb.com', pl: 'twojastrona.pl', ru: 'вашсайт.рф' },
  analyzeBtn:    { en: 'Analyze website', es: 'Analizar sitio', pt: 'Analisar site', pl: 'Analizuj stronę', ru: 'Анализировать' },
  analyzingBtn:  { en: 'Analyzing…', es: 'Analizando…', pt: 'Analisando…', pl: 'Analizowanie…', ru: 'Анализ…' },
  analyzingMsg:  { en: 'Fetching the page and running checks…', es: 'Obteniendo la página y ejecutando comprobaciones…', pt: 'Buscando a página e executando verificações…', pl: 'Pobieranie strony i uruchamianie sprawdzeń…', ru: 'Загрузка страницы и выполнение проверок…' },
  optimizeTitle: { en: 'Optimize → Rebuild brief', es: 'Optimizar → Brief de reconstrucción', pt: 'Otimizar → Brief de reconstrução', pl: 'Optymalizuj → Brief do przebudowy', ru: 'Оптимизация → Бриф' },
  optimizeDesc:  { en: 'We turned the audit into a brief for the rebuild engine. Edit anything, then rebuild an improved version of the site.', es: 'Convertimos la auditoría en un brief. Edita lo que quieras y reconstruye una versión mejorada.', pt: 'Transformamos a auditoria em um brief. Edite o que quiser e reconstrua uma versão melhorada.', pl: 'Zmieniliśmy audyt w brief. Edytuj co chcesz i odbuduj ulepszoną wersję.', ru: 'Мы превратили аудит в бриф. Редактируйте и пересоздайте улучшенную версию.' },
  rebuildBtn:    { en: '⚙️ Rebuild improved site', es: '⚙️ Reconstruir sitio mejorado', pt: '⚙️ Reconstruir site melhorado', pl: '⚙️ Przebuduj ulepszoną stronę', ru: '⚙️ Пересоздать улучшенный сайт' },
  rebuildingBtn: { en: 'Rebuilding…', es: 'Reconstruyendo…', pt: 'Reconstruindo…', pl: 'Przebudowywanie…', ru: 'Пересоздание…' },
  resetBrief:    { en: 'Reset brief', es: 'Restablecer brief', pt: 'Redefinir brief', pl: 'Resetuj brief', ru: 'Сбросить бриф' },
  engineTitle:   { en: 'Rebuild engine', es: 'Motor de reconstrucción', pt: 'Motor de reconstrução', pl: 'Silnik przebudowy', ru: 'Движок пересоздания' },
  publishBtn:    { en: '🚀 Publish improved site', es: '🚀 Publicar sitio mejorado', pt: '🚀 Publicar site melhorado', pl: '🚀 Opublikuj ulepszoną stronę', ru: '🚀 Опубликовать улучшенный сайт' },
  publishingBtn: { en: 'Publishing…', es: 'Publicando…', pt: 'Publicando…', pl: 'Publikowanie…', ru: 'Публикация…' },
  viewLive:      { en: 'View live site →', es: 'Ver sitio en vivo →', pt: 'Ver site ao vivo →', pl: 'Zobacz stronę na żywo →', ru: 'Просмотреть сайт →' },
  errDefault:    { en: 'Could not audit that URL.', es: 'No se pudo auditar esa URL.', pt: 'Não foi possível auditar essa URL.', pl: 'Nie można było przeprowadzić audytu.', ru: 'Не удалось проверить URL.' },
  errConnect:    { en: 'Could not connect. Please try again.', es: 'No se pudo conectar. Inténtalo de nuevo.', pt: 'Não foi possível conectar. Tente novamente.', pl: 'Nie można połączyć. Spróbuj ponownie.', ru: 'Не удалось подключиться. Попробуйте еще раз.' },
}

function c(key: string, lang: string): string {
  return COPY[key]?.[lang as Lang] ?? COPY[key]?.en ?? key
}

type Status = 'pass' | 'warn' | 'fail'
type Check = { id: string; label: string; category: string; status: Status; detail: string; recommendation: string }
type Audit = { url: string; finalUrl: string; score: number; checks: Check[]; summary: string; source: string }
type StatusStep = { step: string; message: string }

const STATUS_UI: Record<Status, { color: string; bg: string; border: string; icon: string }> = {
  pass: { color: '#86efac', bg: 'rgba(134,239,172,.10)', border: 'rgba(134,239,172,.28)', icon: '✓' },
  warn: { color: '#fde68a', bg: 'rgba(253,230,138,.10)', border: 'rgba(253,230,138,.28)', icon: '!' },
  fail: { color: '#fca5a5', bg: 'rgba(252,165,165,.10)', border: 'rgba(252,165,165,.28)', icon: '×' },
}

function scoreColor(s: number) {
  if (s >= 80) return '#86efac'
  if (s >= 50) return '#fde68a'
  return '#fca5a5'
}

// Render light markdown from AI summaries: **bold** + line breaks. Avoids raw ** bleeding into the UI.
function renderRichText(text: string) {
  // The AI's formatting is unreliable run to run — sometimes newlines + **bold**,
  // sometimes everything jammed onto one line with no markup at all. So we parse the
  // numbered recommendations ourselves and render a consistent, readable list.
  let raw = String(text || '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim()
  // Force each "N." item marker onto its own line, then split.
  raw = raw.replace(/\s*(\d{1,2})\.\s*(?=[A-Za-z])/g, '\n$1. ').trim()
  const lines = raw.split('\n').map(s => s.trim()).filter(Boolean)

  return lines.map((line, i) => {
    const m = line.match(/^(\d{1,2})\.\s*(.*)$/)
    if (!m) {
      // Intro / verdict line — bold a short leading label like "Verdict:".
      const ci = line.indexOf(':')
      if (ci > -1 && ci < 24) {
        return (
          <p key={i} style={{ margin: '0 0 14px', lineHeight: 1.6 }}>
            <strong style={{ color: '#fff', fontWeight: 800, fontSize: 'inherit' }}>{line.slice(0, ci + 1)}</strong>{' ' + line.slice(ci + 1).trim()}
          </p>
        )
      }
      return <p key={i} style={{ margin: '0 0 14px', lineHeight: 1.6 }}>{line}</p>
    }
    const num = m[1]
    const rest = m[2]
    const ci = rest.indexOf(':')
    const heading = ci > -1 ? rest.slice(0, ci).trim() : rest.trim()
    const desc = ci > -1 ? rest.slice(ci + 1).trim() : ''
    return (
      <div key={i} style={{ margin: '0 0 11px', lineHeight: 1.6, display: 'flex', gap: 8 }}>
        <span style={{ color: '#ffc300', fontWeight: 800, flex: '0 0 auto' }}>{num}.</span>
        <span style={{ minWidth: 0 }}>
          <strong style={{ color: '#fff', fontWeight: 800, fontSize: 'inherit' }}>{heading}</strong>
          {desc ? <span style={{ color: 'rgba(255,255,255,.72)' }}>{' — ' + desc}</span> : null}
        </span>
      </div>
    )
  })
}
export default function ImproveWebsitePage() {
  const { lang } = useI18n()
  const l = ['en', 'es', 'pt', 'pl', 'ru'].includes(lang) ? lang : 'en'

  const [url, setUrl]               = useState('')
  const [analyzing, setAnalyzing]   = useState(false)
  const [error, setError]           = useState('')
  const [audit, setAudit]           = useState<Audit | null>(null)
  const [brief, setBrief]           = useState('')
  const [content, setContent]       = useState<SitePreviewContent | null>(null)
  const [liveUrl, setLiveUrl]       = useState<string | null>(null)
  const [building, setBuilding]     = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [steps, setSteps]           = useState<StatusStep[]>([])
  const [message, setMessage]       = useState('')

  async function analyze() {
    const value = url.trim()
    if (!value || analyzing) return
    setAnalyzing(true); setError(''); setAudit(null); setContent(null); setLiveUrl(null); setSteps([]); setMessage('')
    try {
      const res = await fetch('/api/improve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: value, language: l }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data?.error || c('errDefault', l)); return }
      setAudit(data)
      setBrief(buildBrief(data))
    } catch {
      setError(c('errConnect', l))
    } finally {
      setAnalyzing(false)
    }
  }

  async function rebuild() {
    if (!brief.trim() || building) return
    setBuilding(true); setMessage(''); setContent(null); setLiveUrl(null); setSteps([])
    try {
      const res = await fetch('/api/sites/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: brief, language: l }),
      })
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}))
        setMessage(err.error || c('errConnect', l))
        setBuilding(false)
        return
      }
      const reader = res.body.getReader()
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
      setBuilding(false)
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

  const categories = audit ? Array.from(new Set(audit.checks.map(ch => ch.category))) : []
  const fullUrl = liveUrl
    ? (typeof window !== 'undefined' ? window.location.origin : '') + liveUrl
    : null

  return (
    <div className="sb-hmi-shell" style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '0 0 80px' }}>

        {/* Header */}
        <div className="sb-cockpit-hero" style={{ marginBottom: 28 }}>
          <p className="sb-hmi-kicker">🧭 {c('eyebrow', l)}</p>
          <h1 className="sb-h2" style={{ margin: '10px 0 12px' }}>{c('title', l)}</h1>
          <p className="sb-hmi-muted" style={{ maxWidth: 680 }}>{c('subtitle', l)}</p>
        </div>

        {/* Stage rail */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
          {[
            { n: 1, key: 'stageAnalyze',  done: !!audit },
            { n: 2, key: 'stageOptimize', done: !!audit },
            { n: 3, key: 'stageRebuild',  done: !!content },
          ].map(s => (
            <div key={s.n} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 18px', borderRadius: 999,
              background: s.done ? 'rgba(134,239,172,.10)' : 'rgba(255,255,255,.04)',
              border: `1px solid ${s.done ? 'rgba(134,239,172,.35)' : 'rgba(255,255,255,.10)'}`,
            }}>
              <span style={{
                width: 22, height: 22, borderRadius: '50%',
                display: 'grid', placeItems: 'center',
                fontSize: 11, fontWeight: 900,
                background: s.done ? '#86efac' : 'rgba(255,255,255,.12)',
                color: s.done ? '#04210f' : '#fff',
              }}>
                {s.done ? '✓' : s.n}
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: s.done ? '#86efac' : 'rgba(255,255,255,.7)' }}>
                {c(s.key, l)}
              </span>
            </div>
          ))}
        </div>

        {/* Stage 1: Input */}
        <div className="sb-glass-panel" style={{ marginBottom: 20, padding: 20 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input
              className="sb-input"
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') analyze() }}
              placeholder={c('placeholder', l)}
              style={{ flex: 1, minWidth: 240, padding: '13px 16px', borderRadius: 12, fontSize: 14 }}
              disabled={analyzing}
            />
            <button
              onClick={analyze}
              disabled={analyzing || !url.trim()}
              className="sb-button-primary"
              style={{ borderRadius: 12, padding: '0 28px', opacity: analyzing || !url.trim() ? 0.55 : 1 }}
            >
              {analyzing ? c('analyzingBtn', l) : c('analyzeBtn', l)}
            </button>
          </div>
          {error && <p style={{ color: '#fca5a5', fontSize: 13, marginTop: 12, marginBottom: 0 }}>{error}</p>}
          {analyzing && <p className="sb-hmi-muted" style={{ marginTop: 14, marginBottom: 0, fontSize: 14 }}>{c('analyzingMsg', l)}</p>}
        </div>

        {audit && (
          <div style={{ display: 'grid', gap: 18 }}>

            {/* Score */}
            <div className="sb-neon-panel" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 24, alignItems: 'center', padding: 24 }}>
              <div style={{
                width: 100, height: 100, borderRadius: '50%',
                display: 'grid', placeItems: 'center', flexShrink: 0,
                border: `5px solid ${scoreColor(audit.score)}`,
                boxShadow: `0 0 32px ${scoreColor(audit.score)}44`,
              }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 28, fontWeight: 900, color: scoreColor(audit.score), lineHeight: 1 }}>{audit.score}</div>
                  <div className="sb-caption">/ 100</div>
                </div>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,.4)', marginBottom: 8, wordBreak: 'break-all' }}>{audit.finalUrl}</div>
                <div style={{ margin: 0, color: 'rgba(255,255,255,.85)', fontSize: 14 }}>{renderRichText(audit.summary)}</div>
              </div>
            </div>

            {/* Checks */}
            {categories.map(cat => (
              <section key={cat}>
                <h2 className="sb-eyebrow" style={{ marginBottom: 12 }}>{cat}</h2>
                <div style={{ display: 'grid', gap: 8 }}>
                  {audit.checks.filter(ch => ch.category === cat).map(ch => {
                    const ui = STATUS_UI[ch.status]
                    return (
                      <div key={ch.id} style={{
                        padding: '14px 18px', borderRadius: 16,
                        background: ui.bg, border: `1px solid ${ui.border}`,
                        display: 'grid', gridTemplateColumns: '30px 1fr',
                        gap: 14, alignItems: 'start',
                      }}>
                        <span style={{
                          width: 28, height: 28, borderRadius: '50%',
                          display: 'grid', placeItems: 'center',
                          background: `${ui.color}22`, color: ui.color,
                          fontWeight: 900, fontSize: 13, border: `1px solid ${ui.color}44`,
                        }}>
                          {ui.icon}
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <strong style={{ color: '#fff', fontSize: 14 }}>{ch.label}</strong>
                          <div style={{ color: 'rgba(255,255,255,.62)', fontSize: 13, marginTop: 3, lineHeight: 1.6 }}>{ch.detail}</div>
                          {ch.status !== 'pass' && ch.recommendation && (
                            <div style={{ fontSize: 13, marginTop: 8, color: ui.color, fontWeight: 700 }}>→ {ch.recommendation}</div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            ))}

            {/* Stage 2: Brief */}
            <div className="sb-glass-panel" style={{ padding: 24, border: '1px solid rgba(26,240,255,.28)' }}>
              <p className="sb-hmi-kicker" style={{ marginBottom: 8 }}>{c('optimizeTitle', l)}</p>
              <p style={{ color: 'rgba(255,255,255,.65)', fontSize: 14, lineHeight: 1.7, marginBottom: 14 }}>{c('optimizeDesc', l)}</p>
              <textarea
                className="sb-input"
                value={brief}
                onChange={e => setBrief(e.target.value)}
                rows={8}
                style={{ width: '100%', boxSizing: 'border-box', padding: '14px 16px', borderRadius: 12, resize: 'vertical', fontSize: 13, lineHeight: 1.7 }}
              />
              <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
                <button onClick={rebuild} disabled={building || !brief.trim()} className="sb-button-primary" style={{ borderRadius: 12, padding: '12px 26px', opacity: building || !brief.trim() ? 0.55 : 1 }}>
                  {building ? c('rebuildingBtn', l) : c('rebuildBtn', l)}
                </button>
                <button onClick={() => setBrief(buildBrief(audit))} disabled={building} className="sb-button-secondary">
                  {c('resetBrief', l)}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Stage 3: Output */}
        {(building || steps.length > 0 || content || message) && (
          <div style={{ marginTop: 24 }}>
            <p className="sb-eyebrow" style={{ marginBottom: 14 }}>{c('engineTitle', l)}</p>

            {steps.length > 0 && !content && (
              <div className="sb-glass-panel" style={{ padding: 18, display: 'grid', gap: 8 }}>
                {steps.map((s, i) => (
                  <div key={i} style={{ fontSize: 14, color: 'rgba(255,255,255,.78)', lineHeight: 1.6 }}>{s.message}</div>
                ))}
              </div>
            )}

            {message && (
              <p style={{ color: liveUrl ? '#86efac' : '#fca5a5', fontSize: 13, marginTop: 12 }}>{message}</p>
            )}

            {content && (
              <div style={{ marginTop: 16 }}>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
                  <button onClick={publish} disabled={publishing} className="sb-button-primary" style={{ borderRadius: 12, padding: '12px 26px', opacity: publishing ? 0.55 : 1 }}>
                    {publishing ? c('publishingBtn', l) : c('publishBtn', l)}
                  </button>
                  {fullUrl && (
                    <a href={fullUrl} target="_blank" rel="noreferrer" className="sb-button-secondary" style={{ display: 'inline-flex', alignItems: 'center' }}>
                      {c('viewLive', l)}
                    </a>
                  )}
                </div>
                <div style={{ borderRadius: 20, overflow: 'hidden', border: '1px solid rgba(255,255,255,.10)', boxShadow: '0 24px 80px rgba(0,0,0,.4)' }}>
                  <SitePreview content={content} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

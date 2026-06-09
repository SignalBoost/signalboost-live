'use client'

import { useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'
const COPY = {
  eyebrow:      { en: 'Podcast Studio', es: 'Podcast Studio', pt: 'Podcast Studio', pl: 'Podcast Studio', ru: 'Студия подкастов' },
  title:        { en: '🎚️ Optimize Podcast Studio', es: '🎚️ Optimizar Podcast Studio', pt: '🎚️ Otimizar Podcast Studio', pl: '🎚️ Optymalizuj Podcast Studio', ru: '🎚️ Оптимизация студии подкастов' },
  subtitle:     { en: 'Audit your podcast feed for Apple/Spotify requirements, episode quality, and growth — and get a prioritized action plan.', es: 'Audita tu feed de podcast para requisitos de Apple/Spotify, calidad de episodios y crecimiento — y obtén un plan de acción priorizado.', pt: 'Audite seu feed de podcast para requisitos da Apple/Spotify, qualidade dos episódios e crescimento — e obtenha um plano de ação priorizado.', pl: 'Sprawdź swój feed podcastu pod kątem wymagań Apple/Spotify, jakości odcinków i wzrostu — i uzyskaj priorytetowy plan działania.', ru: 'Проверьте ваш RSS-фид на соответствие требованиям Apple/Spotify, качество эпизодов и рост — и получите приоритетный план действий.' },
  placeholder:  { en: 'Your RSS feed URL, or an Apple Podcasts link', es: 'URL de tu feed RSS o enlace de Apple Podcasts', pt: 'URL do seu feed RSS ou link do Apple Podcasts', pl: 'URL Twojego feeda RSS lub link do Apple Podcasts', ru: 'URL вашего RSS-фида или ссылка на Apple Podcasts' },
  hint:         { en: "Don't have your feed URL? Paste your Apple Podcasts page link and we'll find it.", es: '¿No tienes tu URL de feed? Pega el enlace de tu página de Apple Podcasts y lo encontraremos.', pt: 'Não tem a URL do seu feed? Cole o link da sua página do Apple Podcasts e encontraremos.', pl: 'Nie masz URL feeda? Wklej link do swojej strony Apple Podcasts, a my go znajdziemy.', ru: 'Нет URL фида? Вставьте ссылку на страницу Apple Podcasts, и мы найдём его.' },
  auditing:     { en: 'Auditing…', es: 'Auditando…', pt: 'Auditando…', pl: 'Audytowanie…', ru: 'Аудит…' },
  auditBtn:     { en: 'Audit podcast', es: 'Auditar podcast', pt: 'Auditar podcast', pl: 'Audytuj podcast', ru: 'Аудит подкаста' },
  fetching:     { en: 'Fetching your feed and running checks…', es: 'Obteniendo tu feed y ejecutando verificaciones…', pt: 'Buscando seu feed e executando verificações…', pl: 'Pobieranie feeda i uruchamianie sprawdzeń…', ru: 'Загрузка фида и выполнение проверок…' },
  episodes:     { en: 'episodes', es: 'episodios', pt: 'episódios', pl: 'odcinki', ru: 'эпизодов' },
  aiTip:        { en: 'Tip: connect an AI key for a richer, written action plan.', es: 'Consejo: conecta una clave AI para un plan de acción más completo.', pt: 'Dica: conecte uma chave AI para um plano de ação mais completo.', pl: 'Wskazówka: połącz klucz AI, aby uzyskać bogatszy plan działania.', ru: 'Совет: подключите ключ AI для более подробного плана действий.' },
  defaultError: { en: 'Could not audit that feed.', es: 'No se pudo auditar ese feed.', pt: 'Não foi possível auditar esse feed.', pl: 'Nie można przeprowadzić audytu tego feeda.', ru: 'Не удалось проверить этот фид.' },
  genericError: { en: 'Something went wrong running the audit.', es: 'Algo salió mal durante la auditoría.', pt: 'Algo deu errado durante a auditoria.', pl: 'Coś poszło nie tak podczas audytu.', ru: 'Что-то пошло не так при выполнении аудита.' },
}

function c(key: string, lang: string): string {
  return (COPY as any)[key]?.[lang as Lang] ?? (COPY as any)[key]?.en ?? key
}

type Status = 'pass' | 'warn' | 'fail'
type Check = { id: string; label: string; category: string; status: Status; detail: string; recommendation: string }
type Result = { url: string; feedUrl: string; show: string; episodes: number; score: number; checks: Check[]; summary: string; source: string }

const STATUS_UI: Record<Status, { color: string; bg: string; border: string; icon: string }> = {
  pass: { color: '#86efac', bg: 'rgba(134,239,172,.1)',  border: 'rgba(134,239,172,.22)', icon: '✓' },
  warn: { color: '#fde68a', bg: 'rgba(253,230,138,.1)',  border: 'rgba(253,230,138,.22)', icon: '!' },
  fail: { color: '#fca5a5', bg: 'rgba(252,165,165,.1)',  border: 'rgba(252,165,165,.22)', icon: '×' },
}

function scoreColor(s: number) {
  if (s >= 80) return '#86efac'
  if (s >= 50) return '#fde68a'
  return '#fca5a5'
}

export default function PodcastStudioOptimizationPage() {
  const { lang } = useI18n()
  const l = ['en', 'es', 'pt', 'pl', 'ru'].includes(lang) ? lang : 'en'

  const [url, setUrl]       = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState('')
  const [result, setResult] = useState<Result | null>(null)

  async function audit() {
    const value = url.trim()
    if (!value || loading) return
    setLoading(true); setError(''); setResult(null)
    try {
      const res = await fetch('/api/podcast/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: value, language: lang }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data?.error || c('defaultError', l)); return }
      setResult(data)
    } catch {
      setError(c('genericError', l))
    } finally {
      setLoading(false)
    }
  }

  const categories = result ? Array.from(new Set(result.checks.map(ch => ch.category))) : []

  return (
    <div style={{ maxWidth: 920, margin: '0 auto', padding: 'clamp(18px,4vw,40px) 0 80px', color: 'var(--text-primary)', display: 'grid', gap: 20 }}>

      {/* Header */}
      <div style={{ background: 'radial-gradient(circle at 20% 10%, rgba(26,240,255,.18), transparent 24rem), linear-gradient(135deg, rgba(255,255,255,.08), rgba(255,255,255,.02))', border: '1px solid rgba(26,240,255,.18)', borderRadius: 28, padding: 'clamp(20px,4vw,32px)' }}>
        <p className="sb-eyebrow">🎙️ {c('eyebrow', l)}</p>
        <h1 style={{ fontSize: 'clamp(22px,4vw,36px)', fontWeight: 900, letterSpacing: '-.04em', lineHeight: 1.1, margin: '8px 0 10px' }}>{c('title', l)}</h1>
        <p style={{ color: 'rgba(255,255,255,.62)', fontSize: 14, lineHeight: 1.7, maxWidth: 620, margin: '0 0 20px' }}>{c('subtitle', l)}</p>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input
            className="sb-input"
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') audit() }}
            placeholder={c('placeholder', l)}
            style={{ flex: 1, minWidth: 260, padding: '12px 16px', borderRadius: 12, fontSize: 14 }}
            disabled={loading}
          />
          <button
            onClick={audit}
            disabled={loading || !url.trim()}
            className="sb-button-primary"
            style={{ opacity: loading || !url.trim() ? 0.6 : 1, cursor: loading ? 'wait' : 'pointer' }}
          >
            {loading ? c('auditing', l) : c('auditBtn', l)}
          </button>
        </div>
        <p style={{ color: 'rgba(255,255,255,.4)', fontSize: 12, marginTop: 8 }}>{c('hint', l)}</p>
        {error && <p style={{ color: '#fca5a5', fontSize: 13, marginTop: 10 }}>{error}</p>}
        {loading && <p style={{ color: 'rgba(255,255,255,.6)', fontSize: 14, marginTop: 12 }}>{c('fetching', l)}</p>}
      </div>

      {/* Result */}
      {result && (
        <>
          {/* Score card */}
          <div style={{ background: 'linear-gradient(145deg, rgba(15,23,42,.78), rgba(3,7,18,.68))', border: '1px solid rgba(255,255,255,.12)', borderRadius: 24, padding: 'clamp(16px,3vw,24px)', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 22, alignItems: 'center' }}>
            <div style={{ width: 100, height: 100, borderRadius: '50%', display: 'grid', placeItems: 'center', border: `5px solid ${scoreColor(result.score)}`, boxShadow: `0 0 32px ${scoreColor(result.score)}44`, flexShrink: 0 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 900, color: scoreColor(result.score), lineHeight: 1 }}>{result.score}</div>
                <div style={{ color: 'rgba(255,255,255,.5)', fontSize: 11 }}>/ 100</div>
              </div>
            </div>
            <div style={{ minWidth: 0 }}>
              {result.show && <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 4, letterSpacing: '-.02em' }}>{result.show}</div>}
              <div style={{ color: 'rgba(255,255,255,.5)', fontSize: 12, marginBottom: 10 }}>{result.episodes} {c('episodes', l)} · {result.feedUrl}</div>
              <p style={{ color: 'rgba(255,255,255,.82)', lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap', fontSize: 14 }}>{result.summary}</p>
              {result.source === 'deterministic' && (
                <p style={{ color: 'rgba(255,255,255,.38)', fontSize: 12, marginTop: 8 }}>{c('aiTip', l)}</p>
              )}
            </div>
          </div>

          {/* Checks by category */}
          {categories.map(cat => (
            <div key={cat}>
              <p className="sb-eyebrow" style={{ marginBottom: 10 }}>{cat}</p>
              <div style={{ display: 'grid', gap: 8 }}>
                {result.checks.filter(ch => ch.category === cat).map(ch => {
                  const ui = STATUS_UI[ch.status]
                  return (
                    <div key={ch.id} style={{ background: ui.bg, border: `1px solid ${ui.border}`, borderRadius: 16, padding: 14, display: 'grid', gridTemplateColumns: '28px 1fr', gap: 12, alignItems: 'start' }}>
                      <span style={{ width: 26, height: 26, borderRadius: 999, display: 'grid', placeItems: 'center', background: `${ui.color}22`, color: ui.color, fontWeight: 900, fontSize: 14, border: `1px solid ${ui.border}` }}>{ui.icon}</span>
                      <div style={{ minWidth: 0 }}>
                        <strong style={{ color: '#fff', fontSize: 14 }}>{ch.label}</strong>
                        <div style={{ color: 'rgba(255,255,255,.6)', fontSize: 13, marginTop: 3, lineHeight: 1.6 }}>{ch.detail}</div>
                        {ch.status !== 'pass' && ch.recommendation && (
                          <div style={{ fontSize: 13, marginTop: 6, color: ui.color, fontWeight: 700 }}>→ {ch.recommendation}</div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

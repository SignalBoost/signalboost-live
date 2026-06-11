'use client'

import { useEffect, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'

const COPY = {
  eyebrow:    { en: 'Strategist', es: 'Estratega', pt: 'Estrategista', pl: 'Strateg', ru: 'Стратег' },
  title:      { en: 'Opportunity radar', es: 'Radar de oportunidades', pt: 'Radar de oportunidades', pl: 'Radar okazji', ru: 'Радар возможностей' },
  subtitle:   { en: 'Your AI strategist scans the market daily for competitor moves, gaps, and partnership opportunities.', es: 'Tu estratega IA escanea el mercado a diario en busca de movimientos de competidores, brechas y oportunidades.', pt: 'Seu estrategista IA varre o mercado diariamente em busca de movimentos de concorrentes, lacunas e oportunidades.', pl: 'Twój strateg AI codziennie skanuje rynek w poszukiwaniu ruchów konkurencji, luk i okazji.', ru: 'Ваш ИИ-стратег ежедневно сканирует рынок: действия конкурентов, ниши и партнёрства.' },
  scanNow:    { en: 'Run scan now', es: 'Escanear ahora', pt: 'Escanear agora', pl: 'Skanuj teraz', ru: 'Сканировать сейчас' },
  scanning:   { en: 'Scanning the market…', es: 'Escaneando el mercado…', pt: 'Varrendo o mercado…', pl: 'Skanowanie rynku…', ru: 'Сканирование рынка…' },
  empty:      { en: 'No alerts yet. Run a scan to populate the radar.', es: 'Sin alertas aún. Ejecuta un escaneo para llenar el radar.', pt: 'Sem alertas ainda. Execute uma varredura para popular o radar.', pl: 'Brak alertów. Uruchom skan, aby zapełnić radar.', ru: 'Пока нет оповещений. Запустите сканирование.' },
  what:       { en: 'What happened', es: 'Qué pasó', pt: 'O que aconteceu', pl: 'Co się stało', ru: 'Что произошло' },
  why:        { en: 'Why it matters', es: 'Por qué importa', pt: 'Por que importa', pl: 'Dlaczego to ważne', ru: 'Почему это важно' },
  action:     { en: 'Recommended action', es: 'Acción recomendada', pt: 'Ação recomendada', pl: 'Zalecane działanie', ru: 'Рекомендуемое действие' },
  sources:    { en: 'Sources', es: 'Fuentes', pt: 'Fontes', pl: 'Źródła', ru: 'Источники' },
  reviewed:   { en: 'Mark reviewed', es: 'Marcar revisado', pt: 'Marcar revisado', pl: 'Oznacz jako przejrzane', ru: 'Просмотрено' },
  dismiss:    { en: 'Dismiss', es: 'Descartar', pt: 'Dispensar', pl: 'Odrzuć', ru: 'Скрыть' },
  unauthorized:{ en: 'Owner/admin access required.', es: 'Se requiere acceso de propietario/administrador.', pt: 'Acesso de proprietário/administrador necessário.', pl: 'Wymagany dostęp właściciela/administratora.', ru: 'Требуется доступ владельца/администратора.' },
  loadError:  { en: 'Could not load alerts.', es: 'No se pudieron cargar las alertas.', pt: 'Não foi possível carregar os alertas.', pl: 'Nie udało się załadować alertów.', ru: 'Не удалось загрузить оповещения.' },
  scanned:    { en: 'Scan complete — new alerts:', es: 'Escaneo completo — nuevas alertas:', pt: 'Varredura concluída — novos alertas:', pl: 'Skan zakończony — nowe alerty:', ru: 'Сканирование завершено — новых оповещений:' },
}

const CATEGORY_STYLE: Record<string, { label: string; color: string }> = {
  competitor:  { label: '⚔️ Competitor',  color: 'rgba(255,99,99,.85)' },
  market_gap:  { label: '🕳️ Market gap',  color: 'rgba(26,240,255,.85)' },
  partnership: { label: '🤝 Partnership', color: 'rgba(118,255,140,.85)' },
  pricing:     { label: '💰 Pricing',     color: 'rgba(255,195,0,.9)' },
  trend:       { label: '📈 Trend',       color: 'rgba(190,140,255,.9)' },
}

function c(obj: any, lang: string): string {
  return obj?.[lang as Lang] ?? obj?.en ?? ''
}

type Alert = {
  id: string
  title: string
  what_happened: string
  why_it_matters: string
  recommended_action: string
  category: string
  source_urls: string[]
  status: string
  created_at: string
}

export default function OpportunitiesPage() {
  const { lang } = useI18n()
  const l = (['en', 'es', 'pt', 'pl', 'ru'].includes(lang) ? lang : 'en') as Lang

  const [alerts, setAlerts]     = useState<Alert[]>([])
  const [loading, setLoading]   = useState(true)
  const [scanning, setScanning] = useState(false)
  const [notice, setNotice]     = useState('')

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/opportunities')
      if (res.status === 401) { setNotice(c(COPY.unauthorized, l)); setAlerts([]); return }
      const data = await res.json()
      setAlerts(Array.isArray(data?.alerts) ? data.alerts : [])
    } catch {
      setNotice(c(COPY.loadError, l))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function scanNow() {
    if (scanning) return
    setScanning(true); setNotice('')
    try {
      const res = await fetch('/api/admin/opportunities', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setNotice(`${c(COPY.scanned, l)} ${data?.inserted ?? 0}`)
        await load()
      } else {
        setNotice(String(data?.error || c(COPY.loadError, l)))
      }
    } catch {
      setNotice(c(COPY.loadError, l))
    } finally {
      setScanning(false)
    }
  }

  async function setStatus(id: string, status: 'reviewed' | 'dismissed') {
    try {
      await fetch('/api/admin/opportunities', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })
      setAlerts(prev => status === 'dismissed'
        ? prev.filter(a => a.id !== id)
        : prev.map(a => (a.id === id ? { ...a, status } : a)))
    } catch { /* non-blocking */ }
  }

  const visible = alerts.filter(a => a.status !== 'dismissed')

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '24px 0', color: 'var(--text-primary)' }}>

      {/* Header */}
      <div style={{ background: 'radial-gradient(circle at 20% 10%, rgba(255,195,0,.14), transparent 22rem), linear-gradient(135deg, rgba(255,255,255,.08), rgba(255,255,255,.02))', border: '1px solid rgba(255,195,0,.22)', borderRadius: 24, padding: '20px 24px', marginBottom: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <p className="sb-eyebrow">📡 {c(COPY.eyebrow, l)}</p>
          <h1 style={{ fontSize: 'clamp(20px,3.5vw,30px)', fontWeight: 900, letterSpacing: '-.04em', lineHeight: 1.1, margin: '6px 0 6px' }}>{c(COPY.title, l)}</h1>
          <p style={{ color: 'rgba(255,255,255,.55)', fontSize: 13, lineHeight: 1.6, margin: 0, maxWidth: 560 }}>{c(COPY.subtitle, l)}</p>
        </div>
        <button
          onClick={scanNow}
          disabled={scanning}
          className="sb-button-primary"
          style={{ padding: '12px 22px', borderRadius: 14, fontSize: 14, opacity: scanning ? 0.6 : 1, cursor: scanning ? 'wait' : 'pointer', flexShrink: 0 }}
        >
          {scanning ? c(COPY.scanning, l) : `🔍 ${c(COPY.scanNow, l)}`}
        </button>
      </div>

      {notice && (
        <div style={{ border: '1px solid rgba(26,240,255,.25)', background: 'rgba(26,240,255,.06)', borderRadius: 14, padding: '10px 16px', fontSize: 13, marginBottom: 14 }}>
          {notice}
        </div>
      )}

      {loading && <p style={{ color: 'rgba(255,255,255,.5)', fontSize: 14 }}>…</p>}

      {!loading && visible.length === 0 && (
        <div style={{ border: '1px dashed rgba(255,255,255,.18)', borderRadius: 18, padding: '36px 24px', textAlign: 'center', color: 'rgba(255,255,255,.55)', fontSize: 14 }}>
          📡 {c(COPY.empty, l)}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {visible.map(alert => {
          const cat = CATEGORY_STYLE[alert.category] ?? CATEGORY_STYLE.trend
          const date = new Date(alert.created_at).toLocaleDateString()
          return (
            <div key={alert.id} style={{ border: '1px solid rgba(255,255,255,.12)', background: 'linear-gradient(145deg, rgba(15,23,42,.8), rgba(3,7,18,.7))', borderRadius: 18, padding: '18px 20px', opacity: alert.status === 'reviewed' ? 0.65 : 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.04em', color: cat.color, border: `1px solid ${cat.color}`, borderRadius: 999, padding: '3px 10px' }}>{cat.label}</span>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,.4)' }}>{date}</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {alert.status !== 'reviewed' && (
                    <button onClick={() => setStatus(alert.id, 'reviewed')} className="sb-button-ghost" style={{ fontSize: 11, padding: '5px 10px' }}>✓ {c(COPY.reviewed, l)}</button>
                  )}
                  <button onClick={() => setStatus(alert.id, 'dismissed')} className="sb-button-ghost" style={{ fontSize: 11, padding: '5px 10px' }}>× {c(COPY.dismiss, l)}</button>
                </div>
              </div>

              <h2 style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-.02em', margin: '10px 0 10px', lineHeight: 1.3 }}>{alert.title}</h2>

              <div style={{ display: 'grid', gap: 8, fontSize: 13, lineHeight: 1.65 }}>
                <p style={{ margin: 0 }}><strong style={{ color: 'rgba(26,240,255,.9)' }}>{c(COPY.what, l)}:</strong> {alert.what_happened}</p>
                <p style={{ margin: 0 }}><strong style={{ color: 'rgba(255,195,0,.9)' }}>{c(COPY.why, l)}:</strong> {alert.why_it_matters}</p>
                <p style={{ margin: 0 }}><strong style={{ color: 'rgba(118,255,140,.9)' }}>{c(COPY.action, l)}:</strong> {alert.recommended_action}</p>
              </div>

              {alert.source_urls?.length > 0 && (
                <div style={{ marginTop: 10, fontSize: 12, color: 'rgba(255,255,255,.45)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <span>{c(COPY.sources, l)}:</span>
                  {alert.source_urls.map((u, i) => (
                    <a key={u + i} href={u} target="_blank" rel="noopener noreferrer" style={{ color: 'rgba(26,240,255,.75)', textDecoration: 'none', wordBreak: 'break-all' }}>{new URL(u).hostname}</a>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

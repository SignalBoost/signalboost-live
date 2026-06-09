'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'
const COPY = {
  eyebrow:     { en: 'Pipeline', es: 'Pipeline', pt: 'Pipeline', pl: 'Pipeline', ru: 'Пайплайн' },
  title:       { en: 'Every lead, by stage.', es: 'Cada lead, por etapa.', pt: 'Cada lead, por etapa.', pl: 'Każdy lead według etapu.', ru: 'Каждый лид по этапу.' },
  subtitle:    { en: 'Track prospects from first discovery through to a closed deal.', es: 'Sigue a los prospectos desde el descubrimiento hasta el cierre.', pt: 'Acompanhe os prospects do primeiro contato ao fechamento.', pl: 'Śledź prospektów od odkrycia do zamknięcia.', ru: 'Отслеживайте потенциальных клиентов от первого контакта до закрытия.' },
  newLead:     { en: '+ Discover new lead', es: '+ Descubrir nuevo lead', pt: '+ Descobrir novo lead', pl: '+ Odkryj nowy lead', ru: '+ Найти новый лид' },
  loading:     { en: 'Loading pipeline…', es: 'Cargando pipeline…', pt: 'Carregando pipeline…', pl: 'Ładowanie pipeline…', ru: 'Загрузка пайплайна…' },
  loadError:   { en: 'Could not load the pipeline.', es: 'No se pudo cargar el pipeline.', pt: 'Não foi possível carregar o pipeline.', pl: 'Nie można załadować pipeline.', ru: 'Не удалось загрузить пайплайн.' },
  unnamed:     { en: 'Unnamed', es: 'Sin nombre', pt: 'Sem nome', pl: 'Bez nazwy', ru: 'Без имени' },
  empty:       { en: '—', es: '—', pt: '—', pl: '—', ru: '—' },
  stages: {
    discovered: { en: 'Discovered', es: 'Descubierto', pt: 'Descoberto', pl: 'Odkryty', ru: 'Обнаружен' },
    contacted:  { en: 'Contacted',  es: 'Contactado',  pt: 'Contactado',  pl: 'Skontaktowany', ru: 'Контакт' },
    replied:    { en: 'Replied',    es: 'Respondió',   pt: 'Respondeu',   pl: 'Odpowiedział',  ru: 'Ответил' },
    booked:     { en: 'Booked',     es: 'Agendado',    pt: 'Agendado',    pl: 'Zarezerwowany', ru: 'Записан' },
    closed:     { en: 'Closed',     es: 'Cerrado',     pt: 'Fechado',     pl: 'Zamknięty',     ru: 'Закрыт' },
  },
}

function c(key: string, lang: string): string {
  return (COPY as any)[key]?.[lang as Lang] ?? (COPY as any)[key]?.en ?? key
}

type Prospect = {
  id?: string | number
  business_name?: string
  name?: string
  stage?: string
  status?: string
  contact_email?: string
  notes?: string
  created_at?: string
}

const STAGES = ['discovered', 'contacted', 'replied', 'booked', 'closed'] as const
type Stage = typeof STAGES[number]

const STAGE_ACCENT: Record<Stage, string> = {
  discovered: '#7dd3fc', contacted: '#fde68a', replied: '#c4b5fd', booked: '#fdba74', closed: '#86efac',
}

function toStage(p: Prospect): Stage {
  const raw = String(p.stage || p.status || '').toLowerCase()
  return (STAGES.find(s => raw.includes(s)) as Stage) || 'discovered'
}

export default function OutreachPipelinePage() {
  const { lang } = useI18n()
  const l = ['en', 'es', 'pt', 'pl', 'ru'].includes(lang) ? lang : 'en'

  const [prospects, setProspects] = useState<Prospect[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const res = await fetch('/api/sales/pipeline', { cache: 'no-store' })
        const data = await res.json()
        if (!active) return
        if (data?.error && (!data.leads || data.leads.length === 0)) setError(data.error)
        setProspects(Array.isArray(data.leads) ? data.leads : [])
      } catch {
        if (active) setError(c('loadError', l))
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [l])

  const byStage = (stage: Stage) => prospects.filter(p => toStage(p) === stage)

  return (
    <div style={{ maxWidth: 1300, margin: '0 auto', padding: 'clamp(18px,4vw,40px) 0 80px', color: 'var(--text-primary)' }}>

      {/* Header */}
      <div style={{ background: 'radial-gradient(circle at 20% 10%, rgba(26,240,255,.18), transparent 24rem), linear-gradient(135deg, rgba(255,255,255,.08), rgba(255,255,255,.02))', border: '1px solid rgba(26,240,255,.18)', borderRadius: 28, padding: 'clamp(20px,4vw,32px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 22 }}>
        <div>
          <p className="sb-eyebrow">📊 {c('eyebrow', l)}</p>
          <h1 style={{ fontSize: 'clamp(22px,4vw,36px)', fontWeight: 900, letterSpacing: '-.04em', lineHeight: 1.1, margin: '8px 0 10px' }}>{c('title', l)}</h1>
          <p style={{ color: 'rgba(255,255,255,.62)', fontSize: 14, lineHeight: 1.7, maxWidth: 520, margin: 0 }}>{c('subtitle', l)}</p>
        </div>
        <Link className="sb-button-primary" href="/dashboard/outreach/discovery" style={{ whiteSpace: 'nowrap', marginTop: 4 }}>{c('newLead', l)}</Link>
      </div>

      {loading && <p style={{ color: 'rgba(255,255,255,.5)', fontSize: 14 }}>{c('loading', l)}</p>}
      {error && !loading && <p style={{ color: '#fca5a5', fontSize: 13, marginBottom: 16 }}>{error}</p>}

      {!loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(180px, 1fr))', gap: 14, overflowX: 'auto' }}>
          {STAGES.map(stage => {
            const items = byStage(stage)
            const stageLabel = (COPY.stages as any)[stage]?.[l as Lang] || stage
            return (
              <section key={stage}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: `3px solid ${STAGE_ACCENT[stage]}`, paddingTop: 10, marginBottom: 12 }}>
                  <h2 style={{ margin: 0, fontSize: 11, fontWeight: 900, letterSpacing: '.1em', textTransform: 'uppercase', color: STAGE_ACCENT[stage] }}>{stageLabel}</h2>
                  <span style={{ fontSize: 12, fontWeight: 900, color: STAGE_ACCENT[stage], background: `${STAGE_ACCENT[stage]}18`, border: `1px solid ${STAGE_ACCENT[stage]}44`, borderRadius: 999, padding: '2px 8px' }}>{items.length}</span>
                </div>
                <div style={{ display: 'grid', gap: 10 }}>
                  {items.map((p, i) => (
                    <article key={p.id ?? `${stage}-${i}`} style={{ background: 'linear-gradient(145deg, rgba(15,23,42,.78), rgba(3,7,18,.68))', border: '1px solid rgba(255,255,255,.1)', borderRadius: 16, padding: 14 }}>
                      <strong style={{ color: '#fff', display: 'block', fontSize: 13, fontWeight: 800 }}>{p.business_name || p.name || c('unnamed', l)}</strong>
                      {p.contact_email && <span style={{ display: 'block', marginTop: 4, fontSize: 11, color: 'rgba(255,255,255,.5)' }}>{p.contact_email}</span>}
                      {p.notes && <p style={{ fontSize: 12, margin: '8px 0 0', color: 'rgba(255,255,255,.55)', lineHeight: 1.5 }}>{p.notes}</p>}
                    </article>
                  ))}
                  {items.length === 0 && <p style={{ color: 'rgba(255,255,255,.25)', fontSize: 13, margin: 0 }}>—</p>}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}

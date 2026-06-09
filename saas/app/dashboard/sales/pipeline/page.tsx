'use client'

import { useEffect, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'
const COPY = {
  eyebrow:    { en: 'Sales', es: 'Ventas', pt: 'Vendas', pl: 'Sprzedaż', ru: 'Продажи' },
  title:      { en: 'Sales Pipeline', es: 'Pipeline de Ventas', pt: 'Pipeline de Vendas', pl: 'Pipeline Sprzedaży', ru: 'Пайплайн продаж' },
  subtitle:   { en: 'Track prospects from discovery to client.', es: 'Sigue a los prospectos desde el descubrimiento hasta el cierre.', pt: 'Acompanhe os prospects do descobrimento ao cliente.', pl: 'Śledź prospektów od odkrycia do klienta.', ru: 'Отслеживайте потенциальных клиентов от поиска до закрытия.' },
  loading:    { en: 'Loading pipeline…', es: 'Cargando pipeline…', pt: 'Carregando pipeline…', pl: 'Ładowanie pipeline…', ru: 'Загрузка пайплайна…' },
  noLeads:    { en: 'No leads', es: 'Sin leads', pt: 'Sem leads', pl: 'Brak leadów', ru: 'Нет лидов' },
  unnamed:    { en: 'Unnamed company', es: 'Empresa sin nombre', pt: 'Empresa sem nome', pl: 'Firma bez nazwy', ru: 'Компания без названия' },
  noIndustry: { en: 'No industry', es: 'Sin industria', pt: 'Sem indústria', pl: 'Brak branży', ru: 'Без отрасли' },
  noCountry:  { en: 'No country', es: 'Sin país', pt: 'Sem país', pl: 'Brak kraju', ru: 'Без страны' },
  noEmail:    { en: 'No email', es: 'Sin email', pt: 'Sem email', pl: 'Brak emaila', ru: 'Без email' },
  draft:      { en: 'Draft:', es: 'Borrador:', pt: 'Rascunho:', pl: 'Szkic:', ru: 'Черновик:' },
  statuses: {
    discovered:   { en: 'Discovered',   es: 'Descubierto',  pt: 'Descoberto',  pl: 'Odkryty',        ru: 'Обнаружен' },
    approved:     { en: 'Approved',     es: 'Aprobado',     pt: 'Aprovado',    pl: 'Zatwierdzony',   ru: 'Одобрен' },
    draft_ready:  { en: 'Draft Ready',  es: 'Borrador listo', pt: 'Rascunho pronto', pl: 'Szkic gotowy', ru: 'Черновик готов' },
    sketch_ready: { en: 'Sketch Ready', es: 'Esquema listo', pt: 'Esboço pronto', pl: 'Szkic gotowy', ru: 'Эскиз готов' },
    sent:         { en: 'Sent',         es: 'Enviado',      pt: 'Enviado',     pl: 'Wysłany',        ru: 'Отправлен' },
    replied:      { en: 'Replied',      es: 'Respondió',    pt: 'Respondeu',   pl: 'Odpowiedział',   ru: 'Ответил' },
    client:       { en: 'Client',       es: 'Cliente',      pt: 'Cliente',     pl: 'Klient',         ru: 'Клиент' },
    draft_failed: { en: 'Draft Failed', es: 'Borrador fallido', pt: 'Rascunho falhou', pl: 'Szkic nieudany', ru: 'Ошибка черновика' },
  },
}

function c(key: string, lang: string): string {
  return (COPY as any)[key]?.[lang as Lang] ?? (COPY as any)[key]?.en ?? key
}

const STATUS_ACCENT: Record<string, string> = {
  discovered: '#7dd3fc', approved: '#86efac', draft_ready: '#fde68a', sketch_ready: '#c4b5fd',
  sent: '#fdba74', replied: '#1af0ff', client: '#4ade80', draft_failed: '#f87171',
}

type Lead = {
  id: string; company?: string; contact_name?: string; email?: string
  industry?: string; country?: string; language?: string; status?: string
  draft_subject?: string; draft_body?: string; last_error?: string
}

const STATUSES = ['discovered', 'approved', 'draft_ready', 'sketch_ready', 'sent', 'replied', 'client', 'draft_failed']

export default function SalesPipelinePage() {
  const { lang } = useI18n()
  const l = ['en', 'es', 'pt', 'pl', 'ru'].includes(lang) ? lang : 'en'

  const [leads, setLeads]     = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch('/api/sales/pipeline')
      .then(r => r.json())
      .then(data => { if (!cancelled) setLeads(data.leads ?? []) })
      .catch(() => { if (!cancelled) setLeads([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const grouped = STATUSES.map(status => ({
    status,
    leads: leads.filter(l => (l.status || 'discovered') === status),
  }))

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: 'clamp(18px,4vw,40px) 0 80px', color: 'var(--text-primary)' }}>

      {/* Header */}
      <div style={{ background: 'radial-gradient(circle at 20% 10%, rgba(26,240,255,.18), transparent 24rem), linear-gradient(135deg, rgba(255,255,255,.08), rgba(255,255,255,.02))', border: '1px solid rgba(26,240,255,.18)', borderRadius: 28, padding: 'clamp(20px,4vw,32px)', marginBottom: 22 }}>
        <p className="sb-eyebrow">💼 {c('eyebrow', l)}</p>
        <h1 style={{ fontSize: 'clamp(22px,4vw,36px)', fontWeight: 900, letterSpacing: '-.04em', lineHeight: 1.1, margin: '8px 0 10px' }}>{c('title', l)}</h1>
        <p style={{ color: 'rgba(255,255,255,.62)', fontSize: 14, lineHeight: 1.7, maxWidth: 520, margin: 0 }}>{c('subtitle', l)}</p>
      </div>

      {loading && <p style={{ color: 'rgba(255,255,255,.5)', fontSize: 14 }}>{c('loading', l)}</p>}

      {!loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(200px, 1fr))', gap: 14, overflowX: 'auto', alignItems: 'start' }}>
          {grouped.map(group => {
            const accent = STATUS_ACCENT[group.status] || '#7dd3fc'
            const statusLabel = (COPY.statuses as any)[group.status]?.[l as Lang] || group.status
            return (
              <section key={group.status} style={{ background: 'linear-gradient(145deg, rgba(15,23,42,.6), rgba(3,7,18,.5))', border: '1px solid rgba(255,255,255,.08)', borderTop: `3px solid ${accent}`, borderRadius: 18, padding: 14, minHeight: 120 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <h2 style={{ margin: 0, fontSize: 11, fontWeight: 900, letterSpacing: '.1em', textTransform: 'uppercase', color: accent }}>{statusLabel}</h2>
                  <span style={{ fontSize: 11, fontWeight: 900, color: accent, background: `${accent}18`, border: `1px solid ${accent}44`, borderRadius: 999, padding: '2px 7px' }}>{group.leads.length}</span>
                </div>

                {group.leads.length === 0 && (
                  <p style={{ color: 'rgba(255,255,255,.25)', fontSize: 12, margin: 0 }}>{c('noLeads', l)}</p>
                )}

                {group.leads.map(lead => (
                  <article key={lead.id} style={{ background: 'rgba(0,0,0,.25)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 12, padding: 12, marginBottom: 10 }}>
                    <strong style={{ display: 'block', fontSize: 13, fontWeight: 800, color: '#fff' }}>{lead.company || c('unnamed', l)}</strong>
                    <div style={{ marginTop: 4, fontSize: 11, color: 'rgba(255,255,255,.5)' }}>
                      {lead.industry || c('noIndustry', l)} · {lead.country || c('noCountry', l)}
                    </div>
                    <div style={{ marginTop: 2, fontSize: 11, color: 'rgba(255,255,255,.5)' }}>
                      {lead.email || c('noEmail', l)}
                    </div>
                    {lead.draft_subject && (
                      <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 8, background: 'rgba(255,195,0,.06)', color: 'rgba(255,255,255,.75)', fontSize: 11 }}>
                        <strong style={{ color: '#ffc300' }}>{c('draft', l)}</strong> {lead.draft_subject}
                      </div>
                    )}
                    {lead.last_error && (
                      <div style={{ marginTop: 8, color: '#f87171', fontSize: 11 }}>{lead.last_error}</div>
                    )}
                  </article>
                ))}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}

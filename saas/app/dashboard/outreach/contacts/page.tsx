'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'

type Lead = {
  id: string
  business_name?: string
  business_url?: string
  source_platform?: string
  status?: 'pending' | 'approved' | 'rejected'
  outreach_message?: string
  created_at?: string
}

const FILTERS = ['all', 'pending', 'approved', 'rejected'] as const
type Filter = typeof FILTERS[number]

const TOGGLE_LABELS: Record<string, { more: string; less: string }> = {
  en: { more: 'Show full draft', less: 'Hide draft' },
  es: { more: 'Ver borrador completo', less: 'Ocultar borrador' },
  pt: { more: 'Ver rascunho completo', less: 'Ocultar rascunho' },
  pl: { more: 'Pokaż pełny szkic', less: 'Ukryj szkic' },
  ru: { more: 'Показать черновик', less: 'Скрыть черновик' },
}

const STATUS_COLOR: Record<string, string> = {
  pending: '#fde68a',
  approved: '#86efac',
  rejected: '#fca5a5',
}

type ContactsCopy = {
  eyebrow: string
  title: string
  subtitle: string
  discoverNew: string
  loadError: string
  genericLoadError: string
  loading: string
  empty: string
  analyzeFirst: string
  unnamedBusiness: string
  approve: string
  approved: string
  reject: string
  rejected: string
  openEngine: string
  filters: Record<Filter, string>
  statuses: Record<string, string>
}

const COPY: Record<string, ContactsCopy> = {
  en: {
    eyebrow: 'Contacts',
    title: 'Your analyzed leads, ready for a human call.',
    subtitle: 'Each lead was profiled by AI. Approve the ones worth contacting, reject the rest.',
    discoverNew: '+ Discover new lead',
    loadError: 'Could not load contacts.',
    genericLoadError: 'Something went wrong loading contacts.',
    loading: 'Loading contacts…',
    empty: 'No leads here yet.',
    analyzeFirst: 'Analyze your first lead',
    unnamedBusiness: 'Unnamed business',
    approve: 'Approve',
    approved: 'Approved',
    reject: 'Reject',
    rejected: 'Rejected',
    openEngine: 'Open engine',
    filters: {
      all: 'All',
      pending: 'Pending',
      approved: 'Approved',
      rejected: 'Rejected',
    },
    statuses: {
      pending: 'pending',
      approved: 'approved',
      rejected: 'rejected',
    },
  },
  pt: {
    eyebrow: 'Contatos',
    title: 'Seus leads analisados, prontos para revisão humana.',
    subtitle: 'Cada lead foi perfilado pela IA. Aprove os que valem contato e rejeite o restante.',
    discoverNew: '+ Descobrir novo lead',
    loadError: 'Não foi possível carregar os contatos.',
    genericLoadError: 'Algo deu errado ao carregar os contatos.',
    loading: 'Carregando contatos…',
    empty: 'Ainda não há leads aqui.',
    analyzeFirst: 'Analisar seu primeiro lead',
    unnamedBusiness: 'Negócio sem nome',
    approve: 'Aprovar',
    approved: 'Aprovado',
    reject: 'Rejeitar',
    rejected: 'Rejeitado',
    openEngine: 'Abrir motor',
    filters: {
      all: 'Todos',
      pending: 'Pendentes',
      approved: 'Aprovados',
      rejected: 'Rejeitados',
    },
    statuses: {
      pending: 'pendente',
      approved: 'aprovado',
      rejected: 'rejeitado',
    },
  },
  es: {
    eyebrow: 'Contactos',
    title: 'Tus leads analizados, listos para revisión humana.',
    subtitle: 'Cada lead fue perfilado por IA. Aprueba los que valen la pena contactar y rechaza el resto.',
    discoverNew: '+ Descubrir nuevo lead',
    loadError: 'No se pudieron cargar los contactos.',
    genericLoadError: 'Algo salió mal al cargar los contactos.',
    loading: 'Cargando contactos…',
    empty: 'Aún no hay leads aquí.',
    analyzeFirst: 'Analizar tu primer lead',
    unnamedBusiness: 'Negocio sin nombre',
    approve: 'Aprobar',
    approved: 'Aprobado',
    reject: 'Rechazar',
    rejected: 'Rechazado',
    openEngine: 'Abrir motor',
    filters: {
      all: 'Todos',
      pending: 'Pendientes',
      approved: 'Aprobados',
      rejected: 'Rechazados',
    },
    statuses: {
      pending: 'pendiente',
      approved: 'aprobado',
      rejected: 'rechazado',
    },
  },
  pl: {
    eyebrow: 'Kontakty',
    title: 'Twoje przeanalizowane leady, gotowe do ludzkiej oceny.',
    subtitle: 'Każdy lead został sprofilowany przez AI. Zatwierdź te warte kontaktu i odrzuć resztę.',
    discoverNew: '+ Odkryj nowy lead',
    loadError: 'Nie można załadować kontaktów.',
    genericLoadError: 'Coś poszło nie tak podczas ładowania kontaktów.',
    loading: 'Ładowanie kontaktów…',
    empty: 'Nie ma tu jeszcze leadów.',
    analyzeFirst: 'Przeanalizuj pierwszy lead',
    unnamedBusiness: 'Firma bez nazwy',
    approve: 'Zatwierdź',
    approved: 'Zatwierdzony',
    reject: 'Odrzuć',
    rejected: 'Odrzucony',
    openEngine: 'Otwórz silnik',
    filters: {
      all: 'Wszystkie',
      pending: 'Oczekujące',
      approved: 'Zatwierdzone',
      rejected: 'Odrzucone',
    },
    statuses: {
      pending: 'oczekuje',
      approved: 'zatwierdzony',
      rejected: 'odrzucony',
    },
  },
  ru: {
    eyebrow: 'Контакты',
    title: 'Ваши проанализированные лиды, готовые к проверке.',
    subtitle: 'Каждый lead был профилирован AI. Одобрите тех, с кем стоит связаться, и отклоните остальных.',
    discoverNew: '+ Найти новый lead',
    loadError: 'Не удалось загрузить контакты.',
    genericLoadError: 'Что-то пошло не так при загрузке контактов.',
    loading: 'Загрузка контактов…',
    empty: 'Здесь пока нет лидов.',
    analyzeFirst: 'Проанализировать первый lead',
    unnamedBusiness: 'Компания без названия',
    approve: 'Одобрить',
    approved: 'Одобрен',
    reject: 'Отклонить',
    rejected: 'Отклонён',
    openEngine: 'Открыть движок',
    filters: {
      all: 'Все',
      pending: 'Ожидают',
      approved: 'Одобрены',
      rejected: 'Отклонены',
    },
    statuses: {
      pending: 'ожидает',
      approved: 'одобрен',
      rejected: 'отклонён',
    },
  },
}

function copyFor(lang: string): ContactsCopy {
  return COPY[lang] || COPY.en
}

export default function OutreachContactsPage() {
  const { lang } = useI18n()
  const copy = copyFor(lang)

  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [busyId, setBusyId] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(3)

  // Fit exactly as many whole lead cards as the screen has room for.
  useEffect(() => {
    function recalc() {
      setPageSize(Math.max(1, Math.floor((window.innerHeight - 400) / 215)))
    }
    recalc()
    window.addEventListener('resize', recalc)
    return () => window.removeEventListener('resize', recalc)
  }, [])

  async function load() {
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/outreach/queue?limit=100', { cache: 'no-store' })
      const data = await res.json()

      if (!res.ok) {
        setError(data?.error || copy.loadError)
        setLeads([])
        return
      }

      setLeads(Array.isArray(data.outreach) ? data.outreach : [])
    } catch {
      setError(copy.genericLoadError)
      setLeads([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang])

  async function setStatus(id: string, status: 'approved' | 'rejected') {
    setBusyId(id)

    try {
      const res = await fetch('/api/outreach/queue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })

      const data = await res.json()

      if (res.ok && data.outreach) {
        setError('')
        setLeads((previous) =>
          previous.map((lead) => (lead.id === id ? { ...lead, ...data.outreach } : lead)),
        )
      } else {
        setError(String(data?.error || `Could not set status to ${status}.`))
      }
    } catch {
      setError(`Could not set status to ${status}. Please retry.`)
    } finally {
      setBusyId('')
    }
  }

  const visible = filter === 'all'
    ? leads
    : leads.filter((lead) => (lead.status || 'pending') === filter)

  const countByStatus = (status: string) => leads.filter((l) => (l.status || 'pending') === status).length

  // Pagination flags hoisted out of the JSX. Keeping a `>=` comparison inline in
  // a <button>'s attributes makes a naive tag-scanning lint read the first `>`
  // as the tag close — so it never sees the onClick after it and reports a false
  // "dead button". Hoisting also reads cleaner.
  const atFirstPage = page === 0
  const atLastPage = (page + 1) * pageSize >= visible.length
  const hasMultiplePages = visible.length > pageSize

  return (
    <main style={{ color: 'var(--text-primary)' }}>
      <header className="sb-console" style={{ paddingBottom: 12 }}>
        <div className="sb-console__row">
          <div style={{ minWidth: 0 }}>
            <span className="sb-eyebrow">🗂️ {copy.eyebrow}</span>
            <h1 style={{ fontSize: 22, margin: '4px 0' }}>{copy.title}</h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 18, flexWrap: 'wrap' }}>
            <div className="sb-telemetry" style={{ marginTop: 0, borderTop: 0 }}>
              <div style={{ paddingTop: 0 }}><b className="gold">{leads.length}</b><span>{copy.filters.all}</span></div>
              <div style={{ paddingTop: 0 }}><b className="warn">{countByStatus('pending')}</b><span>{copy.filters.pending}</span></div>
              <div style={{ paddingTop: 0 }}><b className="ok">{countByStatus('approved')}</b><span>{copy.filters.approved}</span></div>
              <div style={{ paddingTop: 0 }}><b style={{ color: '#fca5a5' }}>{countByStatus('rejected')}</b><span>{copy.filters.rejected}</span></div>
            </div>
            <Link className="sb-button-primary" href="/dashboard/outreach/discovery" style={{ whiteSpace: 'nowrap', fontSize: 13, padding: '9px 16px' }}>
              {copy.discoverNew}
            </Link>
          </div>
        </div>
      </header>

      <div className="sb-cta-row" style={{ marginBottom: 16 }}>
        {FILTERS.map((filterKey) => (
          <button
            key={filterKey}
            type="button"
            onClick={() => { setFilter(filterKey); setPage(0) }}
            className={filter === filterKey ? 'sb-button-primary' : 'sb-button-secondary'}
            style={{ fontSize: 12, padding: '7px 14px' }}
          >
            {copy.filters[filterKey]}
          </button>
        ))}
      </div>

      {loading ? <p className="sb-body">{copy.loading}</p> : null}

      {error && !loading ? (
        <p className="sb-caption" style={{ color: '#fca5a5' }}>
          {error}
        </p>
      ) : null}

      {!loading && !error && visible.length === 0 ? (
        <div className="sb-empty">
          <p className="sb-body" style={{ margin: 0 }}>
            {copy.empty}
          </p>

          <div className="sb-cta-row" style={{ justifyContent: 'center', marginTop: 14 }}>
            <Link className="sb-button-primary" href="/dashboard/outreach/discovery">
              {copy.analyzeFirst}
            </Link>
          </div>
        </div>
      ) : null}

      <section style={{ display: 'grid', gap: 12 }}>
        {visible.slice(page * pageSize, page * pageSize + pageSize).map((lead) => {
          const status = lead.status || 'pending'

          return (
            <article key={lead.id} style={{ borderTop: '1px solid rgba(255,255,255,.07)', borderLeft: `2px solid ${STATUS_COLOR[status] || 'rgba(255,255,255,.2)'}`, padding: '12px 0 12px 12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <h2 className="sb-h3" style={{ margin: 0 }}>
                    {lead.business_name || copy.unnamedBusiness}
                  </h2>

                  {lead.business_url ? (
                    <a href={lead.business_url} target="_blank" rel="noreferrer" className="sb-caption" style={{ color: '#7dd3fc' }}>
                      {lead.business_url}
                    </a>
                  ) : null}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, alignSelf: 'flex-start', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {lead.source_platform === 'strategist' ? (
                    <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', color: '#c4b5fd', border: '1px solid rgba(196,181,253,.5)', borderRadius: 999, padding: '4px 10px' }}>
                      🧠 Strategist
                    </span>
                  ) : null}
                  {lead.created_at ? (
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,.45)', fontFamily: 'ui-monospace, Menlo, monospace' }}>
                      {new Date(lead.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                    </span>
                  ) : null}
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 800,
                      letterSpacing: '.08em',
                      textTransform: 'uppercase',
                      color: STATUS_COLOR[status] || '#fff',
                      border: `1px solid ${STATUS_COLOR[status] || '#fff'}`,
                      borderRadius: 999,
                      padding: '4px 12px',
                    }}
                  >
                    {copy.statuses[status] || status}
                  </span>
                </div>
              </div>

              {lead.outreach_message ? (
                <div style={{ marginTop: 10 }}>
                  <p
                    className="sb-body"
                    style={
                      expandedId === lead.id
                        ? { fontSize: 13.5, margin: 0, whiteSpace: 'pre-wrap' }
                        : { fontSize: 13.5, margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }
                    }
                  >
                    {lead.outreach_message}
                  </p>
                  <button
                    type="button"
                    onClick={() => setExpandedId(expandedId === lead.id ? null : lead.id)}
                    style={{ background: 'none', border: 'none', color: '#7dd3fc', fontSize: 12, fontWeight: 800, cursor: 'pointer', padding: '6px 0 0', letterSpacing: '.04em' }}
                  >
                    {expandedId === lead.id ? (TOGGLE_LABELS[lang] || TOGGLE_LABELS.en).less + ' ▴' : (TOGGLE_LABELS[lang] || TOGGLE_LABELS.en).more + ' ▾'}
                  </button>
                </div>
              ) : null}

              <div className="sb-cta-row" style={{ marginTop: 10 }}>
                <button
                  className="sb-button-primary"
                  type="button"
                  style={{ fontSize: 12, padding: '7px 14px' }}
                  disabled={busyId === lead.id || status === 'approved'}
                  onClick={() => setStatus(lead.id, 'approved')}
                >
                  {status === 'approved' ? copy.approved : copy.approve}
                </button>

                <button
                  className="sb-button-secondary"
                  type="button"
                  style={{ fontSize: 12, padding: '7px 14px' }}
                  disabled={busyId === lead.id || status === 'rejected'}
                  onClick={() => setStatus(lead.id, 'rejected')}
                >
                  {status === 'rejected' ? copy.rejected : copy.reject}
                </button>

                <Link className="sb-button-secondary" href="/dashboard/outreach/outreach" style={{ fontSize: 12, padding: '7px 14px' }}>
                  {copy.openEngine}
                </Link>
              </div>
            </article>
          )
        })}
      </section>

      {hasMultiplePages ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, marginTop: 16, borderTop: '1px solid rgba(255,255,255,.08)', paddingTop: 12 }}>
          <button type="button" className="sb-button-secondary" style={{ fontSize: 13, padding: '7px 16px', opacity: atFirstPage ? .4 : 1 }} disabled={atFirstPage} onClick={() => setPage(page - 1)}>‹</button>
          <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13, color: 'rgba(255,255,255,.7)' }}>{page + 1} / {Math.max(1, Math.ceil(visible.length / pageSize))}</span>
          <button type="button" className="sb-button-secondary" style={{ fontSize: 13, padding: '7px 16px', opacity: atLastPage ? .4 : 1 }} disabled={atLastPage} onClick={() => setPage(page + 1)}>›</button>
        </div>
      ) : null}
    </main>
  )
}

'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'

type Lead = {
  id: string
  business_name?: string
  business_url?: string
  status?: 'pending' | 'approved' | 'rejected'
  created_at?: string
}

type OutreachCopy = {
  eyebrow: string
  title: string
  subtitle: string
  loadError: string
  genericLoadError: string
  loading: string
  sendsLeft: string
  of: string
  totalLeads: string
  pending: string
  approved: string
  rejected: string
  recentLeads: string
  viewAll: string
  noLeadsStart: string
  discoveryLink: string
  unnamedBusiness: string
  tools: Array<{
    icon: string
    title: string
    desc: string
    href: string
  }>
  statuses: Record<string, string>
}

const STATUS_COLOR: Record<string, string> = {
  pending: '#fde68a',
  approved: '#86efac',
  rejected: '#fca5a5',
}

const COPY: Record<string, OutreachCopy> = {
  en: {
    eyebrow: 'Outreach',
    title: 'Your outreach command center.',
    subtitle: 'Analyze businesses, review AI-prepared leads, and move prospects through the pipeline — all from one place.',
    loadError: 'Could not load outreach data.',
    genericLoadError: 'Something went wrong loading outreach.',
    loading: 'Loading…',
    sendsLeft: 'sends left today',
    of: 'of',
    totalLeads: 'Total leads',
    pending: 'Pending',
    approved: 'Approved',
    rejected: 'Rejected',
    recentLeads: 'Recent leads',
    viewAll: 'View all →',
    noLeadsStart: 'No leads yet. Start with',
    discoveryLink: 'Discovery',
    unnamedBusiness: 'Unnamed business',
    tools: [
      { icon: '🔎', title: 'Discovery', desc: 'Analyze a new business and queue it.', href: '/dashboard/outreach/discovery' },
      { icon: '📇', title: 'Contacts', desc: 'Review and approve analyzed leads.', href: '/dashboard/outreach/contacts' },
      { icon: '📊', title: 'Pipeline', desc: 'Track prospects by stage.', href: '/dashboard/outreach/pipeline' },
      { icon: '⚙️', title: 'Engine', desc: 'Turn a lead into an approved campaign.', href: '/dashboard/outreach/outreach' },
    ],
    statuses: {
      pending: 'pending',
      approved: 'approved',
      rejected: 'rejected',
    },
  },

  pt: {
    eyebrow: 'Prospecção',
    title: 'Seu centro de comando de prospecção.',
    subtitle: 'Analise negócios, revise leads preparados por IA e mova prospects pelo pipeline — tudo em um só lugar.',
    loadError: 'Não foi possível carregar os dados de prospecção.',
    genericLoadError: 'Algo deu errado ao carregar a prospecção.',
    loading: 'Carregando…',
    sendsLeft: 'envios restantes hoje',
    of: 'de',
    totalLeads: 'Total de leads',
    pending: 'Pendentes',
    approved: 'Aprovados',
    rejected: 'Rejeitados',
    recentLeads: 'Leads recentes',
    viewAll: 'Ver todos →',
    noLeadsStart: 'Ainda não há leads. Comece com',
    discoveryLink: 'Descoberta',
    unnamedBusiness: 'Negócio sem nome',
    tools: [
      { icon: '🔎', title: 'Descoberta', desc: 'Analise um novo negócio e coloque-o na fila.', href: '/dashboard/outreach/discovery' },
      { icon: '📇', title: 'Contatos', desc: 'Revise e aprove leads analisados.', href: '/dashboard/outreach/contacts' },
      { icon: '📊', title: 'Pipeline', desc: 'Acompanhe prospects por estágio.', href: '/dashboard/outreach/pipeline' },
      { icon: '⚙️', title: 'Motor', desc: 'Transforme um lead em uma campanha aprovada.', href: '/dashboard/outreach/outreach' },
    ],
    statuses: {
      pending: 'pendente',
      approved: 'aprovado',
      rejected: 'rejeitado',
    },
  },

  es: {
    eyebrow: 'Prospección',
    title: 'Tu centro de comando de prospección.',
    subtitle: 'Analiza negocios, revisa leads preparados por IA y mueve prospectos por el pipeline — todo desde un solo lugar.',
    loadError: 'No se pudieron cargar los datos de prospección.',
    genericLoadError: 'Algo salió mal al cargar la prospección.',
    loading: 'Cargando…',
    sendsLeft: 'envíos restantes hoy',
    of: 'de',
    totalLeads: 'Total de leads',
    pending: 'Pendientes',
    approved: 'Aprobados',
    rejected: 'Rechazados',
    recentLeads: 'Leads recientes',
    viewAll: 'Ver todos →',
    noLeadsStart: 'Aún no hay leads. Empieza con',
    discoveryLink: 'Descubrimiento',
    unnamedBusiness: 'Negocio sin nombre',
    tools: [
      { icon: '🔎', title: 'Descubrimiento', desc: 'Analiza un nuevo negocio y ponlo en cola.', href: '/dashboard/outreach/discovery' },
      { icon: '📇', title: 'Contactos', desc: 'Revisa y aprueba leads analizados.', href: '/dashboard/outreach/contacts' },
      { icon: '📊', title: 'Pipeline', desc: 'Rastrea prospectos por etapa.', href: '/dashboard/outreach/pipeline' },
      { icon: '⚙️', title: 'Motor', desc: 'Convierte un lead en una campaña aprobada.', href: '/dashboard/outreach/outreach' },
    ],
    statuses: {
      pending: 'pendiente',
      approved: 'aprobado',
      rejected: 'rechazado',
    },
  },

  pl: {
    eyebrow: 'Pozyskiwanie',
    title: 'Centrum dowodzenia pozyskiwaniem.',
    subtitle: 'Analizuj firmy, sprawdzaj leady przygotowane przez AI i przesuwaj prospekty przez pipeline — wszystko w jednym miejscu.',
    loadError: 'Nie można załadować danych outreach.',
    genericLoadError: 'Coś poszło nie tak podczas ładowania outreach.',
    loading: 'Ładowanie…',
    sendsLeft: 'wysyłek pozostało dziś',
    of: 'z',
    totalLeads: 'Łącznie leady',
    pending: 'Oczekujące',
    approved: 'Zatwierdzone',
    rejected: 'Odrzucone',
    recentLeads: 'Ostatnie leady',
    viewAll: 'Zobacz wszystkie →',
    noLeadsStart: 'Brak leadów. Zacznij od',
    discoveryLink: 'Odkrywania',
    unnamedBusiness: 'Firma bez nazwy',
    tools: [
      { icon: '🔎', title: 'Odkrywanie', desc: 'Przeanalizuj nową firmę i dodaj ją do kolejki.', href: '/dashboard/outreach/discovery' },
      { icon: '📇', title: 'Kontakty', desc: 'Sprawdzaj i zatwierdzaj przeanalizowane leady.', href: '/dashboard/outreach/contacts' },
      { icon: '📊', title: 'Pipeline', desc: 'Śledź prospekty według etapów.', href: '/dashboard/outreach/pipeline' },
      { icon: '⚙️', title: 'Silnik', desc: 'Zamień lead w zatwierdzoną kampanię.', href: '/dashboard/outreach/outreach' },
    ],
    statuses: {
      pending: 'oczekuje',
      approved: 'zatwierdzony',
      rejected: 'odrzucony',
    },
  },

  ru: {
    eyebrow: 'Аутрич',
    title: 'Ваш командный центр аутрича.',
    subtitle: 'Анализируйте компании, проверяйте лиды, подготовленные AI, и продвигайте prospects по pipeline — всё в одном месте.',
    loadError: 'Не удалось загрузить данные аутрича.',
    genericLoadError: 'Что-то пошло не так при загрузке аутрича.',
    loading: 'Загрузка…',
    sendsLeft: 'отправок осталось сегодня',
    of: 'из',
    totalLeads: 'Всего лидов',
    pending: 'Ожидают',
    approved: 'Одобрены',
    rejected: 'Отклонены',
    recentLeads: 'Последние лиды',
    viewAll: 'Посмотреть все →',
    noLeadsStart: 'Лидов пока нет. Начните с',
    discoveryLink: 'Поиска',
    unnamedBusiness: 'Компания без названия',
    tools: [
      { icon: '🔎', title: 'Поиск', desc: 'Проанализируйте новую компанию и добавьте её в очередь.', href: '/dashboard/outreach/discovery' },
      { icon: '📇', title: 'Контакты', desc: 'Проверяйте и утверждайте проанализированные лиды.', href: '/dashboard/outreach/contacts' },
      { icon: '📊', title: 'Pipeline', desc: 'Отслеживайте prospects по этапам.', href: '/dashboard/outreach/pipeline' },
      { icon: '⚙️', title: 'Движок', desc: 'Превратите lead в утверждённую кампанию.', href: '/dashboard/outreach/outreach' },
    ],
    statuses: {
      pending: 'ожидает',
      approved: 'одобрен',
      rejected: 'отклонён',
    },
  },
}

function copyFor(lang: string): OutreachCopy {
  return COPY[lang] || COPY.en
}

export default function OutreachHubPage() {
  const { lang } = useI18n()
  const copy = copyFor(lang)

  const [leads, setLeads] = useState<Lead[]>([])
  const [sendLimit, setSendLimit] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    ;(async () => {
      try {
        const res = await fetch('/api/outreach/queue?limit=100', { cache: 'no-store' })
        const data = await res.json()

        if (!active) return

        if (!res.ok) setError(data?.error || copy.loadError)

        setLeads(Array.isArray(data.outreach) ? data.outreach : [])
        setSendLimit(data.sendLimit ?? null)
      } catch {
        if (active) setError(copy.genericLoadError)
      } finally {
        if (active) setLoading(false)
      }
    })()

    return () => {
      active = false
    }
  }, [copy.genericLoadError, copy.loadError])

  const count = (status: string) => leads.filter((lead) => (lead.status || 'pending') === status).length

  const stats = [
    { label: copy.totalLeads, value: leads.length, accent: '#fff' },
    { label: copy.pending, value: count('pending'), accent: STATUS_COLOR.pending },
    { label: copy.approved, value: count('approved'), accent: STATUS_COLOR.approved },
    { label: copy.rejected, value: count('rejected'), accent: STATUS_COLOR.rejected },
  ]

  const recent = leads.slice(0, 5)
  const remaining = typeof sendLimit?.remaining === 'number' ? sendLimit.remaining : null
  const dailyLimit = typeof sendLimit?.limit === 'number' ? sendLimit.limit : null

  return (
    <main className="sb-glass" style={{ padding: 24 }}>
      <div style={{ marginBottom: 20 }}>
        <span className="sb-eyebrow">{copy.eyebrow}</span>

        <h1 className="sb-h2" style={{ marginTop: 10 }}>
          {copy.title}
        </h1>

        <p className="sb-body" style={{ maxWidth: 640 }}>
          {copy.subtitle}
        </p>

        {remaining !== null && dailyLimit !== null ? (
          <p className="sb-caption" style={{ marginTop: 4 }}>
            {remaining} {copy.of} {dailyLimit} {copy.sendsLeft}.
          </p>
        ) : null}
      </div>

      {loading ? <p className="sb-body">{copy.loading}</p> : null}

      {error && !loading ? (
        <p className="sb-caption" style={{ color: '#fca5a5' }}>
          {error}
        </p>
      ) : null}

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 12, marginBottom: 24 }}>
        {stats.map((stat) => (
          <div key={stat.label} className="sb-card" style={{ padding: 18 }}>
            <div style={{ fontSize: 32, fontWeight: 900, color: stat.accent }}>{stat.value}</div>
            <div className="sb-caption">{stat.label}</div>
          </div>
        ))}
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14, marginBottom: 24 }}>
        {copy.tools.map((tool) => (
          <Link
            key={tool.title}
            href={tool.href}
            className="sb-card"
            style={{ padding: 20, textDecoration: 'none', color: '#fff', display: 'block' }}
          >
            <div style={{ fontSize: 26 }}>{tool.icon}</div>
            <h2 className="sb-h3" style={{ margin: '10px 0 4px' }}>{tool.title}</h2>
            <p className="sb-body" style={{ fontSize: 14, margin: 0 }}>{tool.desc}</p>
          </Link>
        ))}
      </section>

      <section className="sb-card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
          <h2 className="sb-h3" style={{ margin: 0 }}>{copy.recentLeads}</h2>

          <Link className="sb-caption" href="/dashboard/outreach/contacts" style={{ color: '#7dd3fc' }}>
            {copy.viewAll}
          </Link>
        </div>

        {recent.length === 0 && !loading ? (
          <p className="sb-body" style={{ margin: 0 }}>
            {copy.noLeadsStart}{' '}
            <Link href="/dashboard/outreach/discovery" style={{ color: '#7dd3fc' }}>
              {copy.discoveryLink}
            </Link>
            .
          </p>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {recent.map((lead) => {
              const status = lead.status || 'pending'

              return (
                <div
                  key={lead.id}
                  style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,.08)' }}
                >
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {lead.business_name || lead.business_url || copy.unnamedBusiness}
                  </span>

                  <span style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', color: STATUS_COLOR[status] }}>
                    {copy.statuses[status] || status}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </main>
  )
}

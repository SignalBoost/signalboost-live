'use client'

import { useCallback, useEffect, useState } from 'react'

const GOLD = '#ffc300'

const COPY = {
  en: {
    eyebrow: '🛰️ Admin',
    title: 'Overview',
    refresh: '↻ Refresh',
    refreshing: 'Refreshing…',
    loading: 'Loading…',
    accounts: 'Accounts',
    registeredUsers: 'Registered users',
    teamMembers: 'Team members',
    subscriptions: 'Subscriptions',
    planDist: 'Plan distribution',
    contentActivity: 'Content & activity',
    reviews: 'Reviews',
    approved: 'approved',
    campaigns: 'Campaigns',
    active: 'active',
    sitesBuilt: 'Sites built',
    published: 'published',
    outreachLeads: 'Outreach leads',
    notInstrumented: 'Not yet instrumented',
    notInstrumentedBody: "Revenue/MRR, AI usage & cost, email performance, and system health aren't tracked yet — they need Stripe data, request logging, and telemetry wired in. Those become real once that instrumentation exists. Everything above is live data counted from your database.",
    generated: 'Generated',
    errorDefault: 'Could not load overview.',
    errorGeneric: 'Something went wrong loading the overview.',
  },
  es: {
    eyebrow: '🛰️ Admin',
    title: 'Resumen',
    refresh: '↻ Actualizar',
    refreshing: 'Actualizando…',
    loading: 'Cargando…',
    accounts: 'Cuentas',
    registeredUsers: 'Usuarios registrados',
    teamMembers: 'Miembros del equipo',
    subscriptions: 'Suscripciones',
    planDist: 'Distribución de planes',
    contentActivity: 'Contenido y actividad',
    reviews: 'Reseñas',
    approved: 'aprobadas',
    campaigns: 'Campañas',
    active: 'activas',
    sitesBuilt: 'Sitios creados',
    published: 'publicados',
    outreachLeads: 'Contactos de alcance',
    notInstrumented: 'Aún no instrumentado',
    notInstrumentedBody: 'Los ingresos/MRR, el uso de IA, el rendimiento del correo y la salud del sistema aún no se rastrean — requieren datos de Stripe, registro de solicitudes y telemetría. Todo lo anterior son datos en vivo de tu base de datos.',
    generated: 'Generado',
    errorDefault: 'No se pudo cargar el resumen.',
    errorGeneric: 'Algo salió mal al cargar el resumen.',
  },
  pt: {
    eyebrow: '🛰️ Admin',
    title: 'Visão geral',
    refresh: '↻ Atualizar',
    refreshing: 'Atualizando…',
    loading: 'Carregando…',
    accounts: 'Contas',
    registeredUsers: 'Usuários registrados',
    teamMembers: 'Membros da equipe',
    subscriptions: 'Assinaturas',
    planDist: 'Distribuição de planos',
    contentActivity: 'Conteúdo e atividade',
    reviews: 'Avaliações',
    approved: 'aprovadas',
    campaigns: 'Campanhas',
    active: 'ativas',
    sitesBuilt: 'Sites criados',
    published: 'publicados',
    outreachLeads: 'Leads de alcance',
    notInstrumented: 'Ainda não instrumentado',
    notInstrumentedBody: 'Receita/MRR, uso de IA, desempenho de e-mail e saúde do sistema ainda não são rastreados — precisam de dados do Stripe, registro de requisições e telemetria. Tudo acima são dados ao vivo do seu banco de dados.',
    generated: 'Gerado',
    errorDefault: 'Não foi possível carregar a visão geral.',
    errorGeneric: 'Algo deu errado ao carregar a visão geral.',
  },
  pl: {
    eyebrow: '🛰️ Admin',
    title: 'Przegląd',
    refresh: '↻ Odśwież',
    refreshing: 'Odświeżanie…',
    loading: 'Ładowanie…',
    accounts: 'Konta',
    registeredUsers: 'Zarejestrowani użytkownicy',
    teamMembers: 'Członkowie zespołu',
    subscriptions: 'Subskrypcje',
    planDist: 'Rozkład planów',
    contentActivity: 'Treści i aktywność',
    reviews: 'Recenzje',
    approved: 'zatwierdzone',
    campaigns: 'Kampanie',
    active: 'aktywne',
    sitesBuilt: 'Zbudowane strony',
    published: 'opublikowane',
    outreachLeads: 'Leady kontaktowe',
    notInstrumented: 'Jeszcze nie zainstrumentowane',
    notInstrumentedBody: 'Przychody/MRR, użycie AI, wydajność e-mail i kondycja systemu nie są jeszcze śledzone — wymagają danych Stripe, logowania żądań i telemetrii. Wszystko powyżej to dane na żywo z Twojej bazy danych.',
    generated: 'Wygenerowano',
    errorDefault: 'Nie udało się załadować przeglądu.',
    errorGeneric: 'Coś poszło nie tak podczas ładowania przeglądu.',
  },
  ru: {
    eyebrow: '🛰️ Admin',
    title: 'Обзор',
    refresh: '↻ Обновить',
    refreshing: 'Обновление…',
    loading: 'Загрузка…',
    accounts: 'Аккаунты',
    registeredUsers: 'Зарегистрированные пользователи',
    teamMembers: 'Члены команды',
    subscriptions: 'Подписки',
    planDist: 'Распределение планов',
    contentActivity: 'Контент и активность',
    reviews: 'Отзывы',
    approved: 'одобрено',
    campaigns: 'Кампании',
    active: 'активных',
    sitesBuilt: 'Созданные сайты',
    published: 'опубликовано',
    outreachLeads: 'Лиды для охвата',
    notInstrumented: 'Ещё не инструментировано',
    notInstrumentedBody: 'Доходы/MRR, использование ИИ, эффективность email и состояние системы пока не отслеживаются — для этого нужны данные Stripe, логирование запросов и телеметрия. Всё вышеперечисленное — живые данные из вашей базы данных.',
    generated: 'Сгенерировано',
    errorDefault: 'Не удалось загрузить обзор.',
    errorGeneric: 'Что-то пошло не так при загрузке обзора.',
  },
}

type Lang = keyof typeof COPY

function getLang(): Lang {
  if (typeof navigator === 'undefined') return 'en'
  const l = navigator.language?.slice(0, 2)
  return (l in COPY ? l : 'en') as Lang
}

type Overview = {
  generatedAt: string
  content: {
    reviews: number
    approvedReviews: number
    campaigns: number
    activeCampaigns: number
    projects: number
    publishedProjects: number
    leads: number
    approvedLeads: number
  }
  accounts: {
    totalUsers: number
    teamMembers: number
    subscriptions: number
    plans: Record<string, number>
  }
}

function Stat({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div style={{ borderLeft: '2px solid rgba(26,240,255,.4)', paddingLeft: 14 }}>
      <div style={{ fontSize: 26, fontWeight: 800, color: '#9ff7ff', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', letterSpacing: '-.02em' }}>{value}</div>
      <div className="sb-caption" style={{ marginTop: 2, textTransform: 'uppercase', letterSpacing: '.1em', fontSize: 10, fontWeight: 800 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: 'rgba(255,255,255,.45)', marginTop: 3 }}>{sub}</div>}
    </div>
  )
}

export default function AdminOverviewPage() {
  const [data, setData] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const c = COPY[getLang()]

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/admin/overview', { cache: 'no-store' })
      const d = await res.json()
      if (!res.ok) { setError(d?.error || c.errorDefault); setLoading(false); return }
      setData(d)
    } catch {
      setError(c.errorGeneric)
    } finally {
      setLoading(false)
    }
  }, [c])

  useEffect(() => { load() }, [load])

  return (
    <main style={{ color: 'var(--text-primary)', maxWidth: 1000, margin: '0 auto' }}>
      <header className="sb-console" style={{ paddingBottom: 12 }}>
        <div className="sb-console__row">
          <div>
            <span className="sb-eyebrow">{c.eyebrow}</span>
            <h1 style={{ fontSize: 22, margin: '4px 0' }}>{c.title}</h1>
          </div>
          <button onClick={load} disabled={loading} className="sb-button-secondary" style={{ opacity: loading ? 0.6 : 1, fontSize: 13, padding: '9px 16px' }}>
            {loading ? c.refreshing : c.refresh}
          </button>
        </div>
      </header>

      {error && <p className="sb-caption" style={{ color: '#fca5a5', marginBottom: 12 }}>{error}</p>}
      {loading && !data && <p className="sb-body">{c.loading}</p>}

      {data && (
        <>
          <h2 className="sb-eyebrow" style={{ display: 'block', marginBottom: 12 }}>{c.accounts}</h2>
          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 14, marginBottom: 22 }}>
            <Stat label={c.registeredUsers} value={data.accounts.totalUsers} />
            <Stat label={c.teamMembers} value={data.accounts.teamMembers} />
            <Stat label={c.subscriptions} value={data.accounts.subscriptions} />
          </section>

          {Object.keys(data.accounts.plans).length > 0 && (
            <section style={{ borderTop: '1px solid rgba(255,255,255,.08)', paddingTop: 14, marginBottom: 22 }}>
              <h3 className="sb-eyebrow" style={{ display: 'block', marginBottom: 10 }}>{c.planDist}</h3>
              <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
                {Object.entries(data.accounts.plans).map(([plan, n]) => (
                  <div key={plan}>
                    <span style={{ fontSize: 22, fontWeight: 800, color: GOLD }}>{n}</span>
                    <span className="sb-caption" style={{ marginLeft: 6, textTransform: 'capitalize' }}>{plan}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <h2 className="sb-eyebrow" style={{ display: 'block', marginBottom: 12, marginTop: 4 }}>{c.contentActivity}</h2>
          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 14, marginBottom: 22 }}>
            <Stat label={c.reviews} value={data.content.reviews} sub={`${data.content.approvedReviews} ${c.approved}`} />
            <Stat label={c.campaigns} value={data.content.campaigns} sub={`${data.content.activeCampaigns} ${c.active}`} />
            <Stat label={c.sitesBuilt} value={data.content.projects} sub={`${data.content.publishedProjects} ${c.published}`} />
            <Stat label={c.outreachLeads} value={data.content.leads} sub={`${data.content.approvedLeads} ${c.approved}`} />
          </section>

          <section style={{ borderLeft: '2px solid rgba(255,195,0,.5)', paddingLeft: 14 }}>
            <h3 style={{ margin: 0, fontSize: 13, fontWeight: 900, color: '#ffc300' }}>{c.notInstrumented}</h3>
            <p className="sb-caption" style={{ margin: '6px 0 0' }}>{c.notInstrumentedBody}</p>
          </section>

          <p className="sb-caption" style={{ marginTop: 18, opacity: 0.5 }}>
            {c.generated} {new Date(data.generatedAt).toLocaleString()}
          </p>
        </>
      )}
    </main>
  )
}

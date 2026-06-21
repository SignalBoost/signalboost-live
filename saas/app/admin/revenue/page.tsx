'use client'

import { useCallback, useEffect, useState } from 'react'

const GOLD = '#ffc300'

type Breakdown = { line: string; plan: string; count: number; mrr: number }
type Revenue = {
  generatedAt: string
  pricesResolved: boolean
  totals: { mrr: number; arr: number; activeWebsite: number; activePodcast: number; activeTotal: number }
  breakdown: Breakdown[]
}

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'

const COPY: Record<Lang, {
  eyebrow: string
  title: string
  refresh: string
  refreshing: string
  loading: string
  noAccess: string
  noAccessSub: string
  stripePriceWarn: string
  mrr: string
  arr: string
  activeSubs: string
  activeWebsite: string
  activePodcast: string
  byPlan: string
  noSubs: string
  active: string
  perMonth: string
  footer: string
}> = {
  en: {
    eyebrow: '💰 Admin · Revenue',
    title: 'Live MRR from Stripe',
    refresh: '↻ Refresh',
    refreshing: 'Refreshing…',
    loading: 'Loading…',
    noAccess: 'Revenue',
    noAccessSub: 'Only the account owner can view revenue.',
    stripePriceWarn: "Stripe prices couldn't be read, so MRR may show $0. Check that STRIPE_SECRET_KEY and the STRIPE_PRICE_* variables are set correctly in your environment.",
    mrr: 'MRR (monthly recurring)',
    arr: 'ARR (annual run-rate)',
    activeSubs: 'Active subscriptions',
    activeWebsite: 'Active website plans',
    activePodcast: 'Active podcast plans',
    byPlan: 'By plan',
    noSubs: 'No active subscriptions yet.',
    active: 'active',
    perMonth: '/mo',
    footer: 'From active subscriptions in your database, priced live from Stripe. This is a dashboard estimate, not an accounting ledger — reconcile against Stripe for official figures. Generated',
  },
  es: {
    eyebrow: '💰 Admin · Ingresos',
    title: 'MRR en vivo desde Stripe',
    refresh: '↻ Actualizar',
    refreshing: 'Actualizando…',
    loading: 'Cargando…',
    noAccess: 'Ingresos',
    noAccessSub: 'Solo el propietario de la cuenta puede ver los ingresos.',
    stripePriceWarn: 'No se pudieron leer los precios de Stripe, por lo que el MRR puede mostrar $0. Verifica que STRIPE_SECRET_KEY y las variables STRIPE_PRICE_* estén configuradas correctamente.',
    mrr: 'MRR (recurrente mensual)',
    arr: 'ARR (tasa anual)',
    activeSubs: 'Suscripciones activas',
    activeWebsite: 'Planes de sitio web activos',
    activePodcast: 'Planes de podcast activos',
    byPlan: 'Por plan',
    noSubs: 'Aún no hay suscripciones activas.',
    active: 'activos',
    perMonth: '/mes',
    footer: 'De las suscripciones activas en tu base de datos, con precios en vivo desde Stripe. Esta es una estimación del panel, no un libro contable — reconcilia con Stripe para cifras oficiales. Generado',
  },
  pt: {
    eyebrow: '💰 Admin · Receita',
    title: 'MRR ao vivo do Stripe',
    refresh: '↻ Atualizar',
    refreshing: 'Atualizando…',
    loading: 'Carregando…',
    noAccess: 'Receita',
    noAccessSub: 'Apenas o proprietário da conta pode ver a receita.',
    stripePriceWarn: 'Os preços do Stripe não puderam ser lidos, então o MRR pode mostrar $0. Verifique se STRIPE_SECRET_KEY e as variáveis STRIPE_PRICE_* estão configuradas corretamente.',
    mrr: 'MRR (recorrente mensal)',
    arr: 'ARR (taxa anual)',
    activeSubs: 'Assinaturas ativas',
    activeWebsite: 'Planos de site ativos',
    activePodcast: 'Planos de podcast ativos',
    byPlan: 'Por plano',
    noSubs: 'Nenhuma assinatura ativa ainda.',
    active: 'ativos',
    perMonth: '/mês',
    footer: 'Das assinaturas ativas no seu banco de dados, com preços ao vivo do Stripe. Esta é uma estimativa do painel, não um livro contábil — reconcilie com o Stripe para números oficiais. Gerado',
  },
  pl: {
    eyebrow: '💰 Admin · Przychody',
    title: 'MRR na żywo ze Stripe',
    refresh: '↻ Odśwież',
    refreshing: 'Odświeżanie…',
    loading: 'Ładowanie…',
    noAccess: 'Przychody',
    noAccessSub: 'Tylko właściciel konta może przeglądać przychody.',
    stripePriceWarn: 'Nie udało się odczytać cen ze Stripe, więc MRR może wynosić $0. Sprawdź, czy STRIPE_SECRET_KEY i zmienne STRIPE_PRICE_* są poprawnie ustawione.',
    mrr: 'MRR (miesięczny cykliczny)',
    arr: 'ARR (roczna stopa)',
    activeSubs: 'Aktywne subskrypcje',
    activeWebsite: 'Aktywne plany stron',
    activePodcast: 'Aktywne plany podcastów',
    byPlan: 'Według planu',
    noSubs: 'Brak aktywnych subskrypcji.',
    active: 'aktywnych',
    perMonth: '/mies.',
    footer: 'Z aktywnych subskrypcji w Twojej bazie danych, z cenami na żywo ze Stripe. To szacunek panelu, nie księga rachunkowa — porównaj ze Stripe w celu uzyskania oficjalnych danych. Wygenerowano',
  },
  ru: {
    eyebrow: '💰 Админ · Доходы',
    title: 'MRR в реальном времени из Stripe',
    refresh: '↻ Обновить',
    refreshing: 'Обновление…',
    loading: 'Загрузка…',
    noAccess: 'Доходы',
    noAccessSub: 'Только владелец аккаунта может просматривать доходы.',
    stripePriceWarn: 'Цены Stripe не удалось прочитать, поэтому MRR может показывать $0. Убедитесь, что STRIPE_SECRET_KEY и переменные STRIPE_PRICE_* настроены правильно.',
    mrr: 'MRR (ежемесячный)',
    arr: 'ARR (годовая ставка)',
    activeSubs: 'Активные подписки',
    activeWebsite: 'Активные планы сайтов',
    activePodcast: 'Активные планы подкастов',
    byPlan: 'По плану',
    noSubs: 'Активных подписок пока нет.',
    active: 'активных',
    perMonth: '/мес.',
    footer: 'Из активных подписок в вашей базе данных, с ценами в реальном времени из Stripe. Это оценка панели, а не бухгалтерская книга — сверяйтесь со Stripe для официальных данных. Сгенерировано',
  },
}

function getLang(): Lang {
  if (typeof window !== 'undefined') { const s = localStorage.getItem('signalboost_language'); if (s && (s in COPY)) return s as any }
  if (typeof navigator === 'undefined') return 'en'
  const l = navigator.language?.slice(0, 2).toLowerCase()
  if (l === 'es') return 'es'
  if (l === 'pt') return 'pt'
  if (l === 'pl') return 'pl'
  if (l === 'ru') return 'ru'
  return 'en'
}

function money(n: number) {
  return '$' + n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

export default function AdminRevenuePage() {
  const [data, setData] = useState<Revenue | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notAllowed, setNotAllowed] = useState(false)
  const c = COPY[getLang()]

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/admin/revenue', { cache: 'no-store' })
      if (res.status === 401 || res.status === 403) { setNotAllowed(true); setLoading(false); return }
      const d = await res.json()
      if (!res.ok) { setError(d?.error || 'Could not load revenue.'); setLoading(false); return }
      setData(d)
    } catch {
      setError('Something went wrong loading revenue.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (notAllowed) {
    return (
      <main style={{ padding: 24, color: '#fff', maxWidth: 720, margin: '0 auto' }}>
        <div className="sb-empty" style={{ marginTop: 60 }}>
          <h1 className="sb-h3" style={{ marginTop: 0 }}>{c.noAccess}</h1>
          <p className="sb-body" style={{ margin: 0 }}>{c.noAccessSub}</p>
        </div>
      </main>
    )
  }

  return (
    <main style={{ color: 'var(--text-primary)', maxWidth: 920, margin: '0 auto' }}>
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
          {!data.pricesResolved && (
            <div style={{ borderLeft: '2px solid rgba(252,165,165,.6)', paddingLeft: 14, marginBottom: 16 }}>
              <p className="sb-caption" style={{ margin: 0, color: '#fca5a5' }}>
                {c.stripePriceWarn}
              </p>
            </div>
          )}

          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 14, marginBottom: 22 }}>
            <div style={{ borderLeft: '2px solid rgba(255,195,0,.55)', paddingLeft: 14 }}>
              <div style={{ fontSize: 30, fontWeight: 800, color: GOLD, fontFamily: 'ui-monospace, Menlo, monospace', letterSpacing: '-.02em' }}>{money(data.totals.mrr)}</div>
              <div className="sb-caption" style={{ marginTop: 2, textTransform: 'uppercase', letterSpacing: '.1em', fontSize: 10, fontWeight: 800 }}>{c.mrr}</div>
            </div>
            <div style={{ borderLeft: '2px solid rgba(26,240,255,.4)', paddingLeft: 14 }}>
              <div style={{ fontSize: 30, fontWeight: 800, color: '#9ff7ff', fontFamily: 'ui-monospace, Menlo, monospace', letterSpacing: '-.02em' }}>{money(data.totals.arr)}</div>
              <div className="sb-caption" style={{ marginTop: 2, textTransform: 'uppercase', letterSpacing: '.1em', fontSize: 10, fontWeight: 800 }}>{c.arr}</div>
            </div>
            <div style={{ borderLeft: '2px solid rgba(134,239,172,.5)', paddingLeft: 14 }}>
              <div style={{ fontSize: 30, fontWeight: 800, color: '#86efac', fontFamily: 'ui-monospace, Menlo, monospace', letterSpacing: '-.02em' }}>{data.totals.activeTotal}</div>
              <div className="sb-caption" style={{ marginTop: 2, textTransform: 'uppercase', letterSpacing: '.1em', fontSize: 10, fontWeight: 800 }}>{c.activeSubs}</div>
            </div>
          </section>

          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 14, marginBottom: 22 }}>
            <div style={{ borderLeft: '2px solid rgba(125,211,252,.45)', paddingLeft: 14 }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#7dd3fc', fontFamily: 'ui-monospace, Menlo, monospace' }}>{data.totals.activeWebsite}</div>
              <div className="sb-caption" style={{ textTransform: 'uppercase', letterSpacing: '.1em', fontSize: 10, fontWeight: 800 }}>{c.activeWebsite}</div>
            </div>
            <div style={{ borderLeft: '2px solid rgba(196,181,253,.45)', paddingLeft: 14 }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#c4b5fd', fontFamily: 'ui-monospace, Menlo, monospace' }}>{data.totals.activePodcast}</div>
              <div className="sb-caption" style={{ textTransform: 'uppercase', letterSpacing: '.1em', fontSize: 10, fontWeight: 800 }}>{c.activePodcast}</div>
            </div>
          </section>

          <h2 className="sb-eyebrow" style={{ display: 'block', marginBottom: 10 }}>{c.byPlan}</h2>
          {data.breakdown.length === 0 ? (
            <div className="sb-empty">{c.noSubs}</div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {data.breakdown.map(b => (
                <div key={`${b.line}:${b.plan}`} style={{ borderTop: '1px solid rgba(255,255,255,.07)', padding: '12px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <div>
                    <strong style={{ color: '#fff', textTransform: 'capitalize' }}>{b.line} · {b.plan}</strong>
                    <div className="sb-caption" style={{ marginTop: 2 }}>{b.count} {c.active}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: GOLD, fontFamily: 'ui-monospace, Menlo, monospace' }}>{money(b.mrr)}</div>
                    <div className="sb-caption">{c.perMonth}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <p className="sb-caption" style={{ marginTop: 18, opacity: 0.55 }}>
            {c.footer} {new Date(data.generatedAt).toLocaleString()}.
          </p>
        </>
      )}
    </main>
  )
}

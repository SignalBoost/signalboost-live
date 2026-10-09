'use client'

import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { uiText } from '@/lib/i18n/uiText'

const GOLD = '#ffc300'

type Breakdown = { line: string; plan: string; count: number; mrr: number }
type Revenue = {
  generatedAt: string
  pricesResolved: boolean
  totals: { mrr: number; arr: number; activeWebsite: number; activePodcast: number; activeTotal: number }
  breakdown: Breakdown[]
}

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru' | 'de' | 'fr' | 'it' | 'ja' | 'ko' | 'ar'

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
    eyebrow: uiText('generatedUi.u_62cd7f01157204c5'),
    title: uiText('generatedUi.u_081276c1f045a8e8'),
    refresh: uiText('generatedUi.u_9cbbfc3a6bd90021'),
    refreshing: uiText('generatedUi.u_1c0def7be0607b96'),
    loading: uiText('generatedUi.u_ba3bbbe10d8bef66'),
    noAccess: uiText('generatedUi.u_c4b7330bd91e0c97'),
    noAccessSub: uiText('generatedUi.u_13c79d778b19c315'),
    stripePriceWarn: uiText('generatedUi.u_4461ddaff93a0bfc'),
    mrr: uiText('generatedUi.u_4d6f9064a0fbeeb6'),
    arr: uiText('generatedUi.u_47a1aeaaeccf89e4'),
    activeSubs: uiText('generatedUi.u_df0a5aac1933a9f8'),
    activeWebsite: uiText('generatedUi.u_69296894c28bab9f'),
    activePodcast: uiText('generatedUi.u_214814a1b7d44362'),
    byPlan: uiText('generatedUi.u_9ea817b82fb38fef'),
    noSubs: uiText('generatedUi.u_0efad23779a4d47c'),
    active: uiText('generatedUi.u_96879611650f80a8'),
    perMonth: uiText('generatedUi.u_dcc954337afd7f3c'),
    footer: uiText('generatedUi.u_00210fd619b065e6'),
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
  de: {
    eyebrow: '💰 Admin · Umsatz',
    title: 'Live-MRR von Stripe',
    refresh: '↻ Aktualisieren',
    refreshing: 'Wird aktualisiert…',
    loading: 'Wird geladen…',
    noAccess: 'Umsatz',
    noAccessSub: 'Nur der Kontoinhaber kann Umsätze einsehen.',
    stripePriceWarn: 'Stripe-Preise konnten nicht gelesen werden, daher zeigt MRR möglicherweise $0 an. Prüfen Sie, ob STRIPE_SECRET_KEY und die STRIPE_PRICE_*-Variablen in Ihrer Umgebung korrekt gesetzt sind.',
    mrr: 'MRR (monatlich wiederkehrend)',
    arr: 'ARR (jährliche Run-Rate)',
    activeSubs: 'Aktive Abonnements',
    activeWebsite: 'Aktive Website-Pläne',
    activePodcast: 'Aktive Podcast-Pläne',
    byPlan: 'Nach Tarif',
    noSubs: 'Noch keine aktiven Abonnements.',
    active: 'aktiv',
    perMonth: '/Monat',
    footer: 'Aus aktiven Abonnements in Ihrer Datenbank, live über Stripe bepreist. Dies ist eine Dashboard-Schätzung, kein Buchhaltungsjournal – gleichen Sie für offizielle Zahlen mit Stripe ab. Erstellt',
  },
  fr: {
    eyebrow: '💰 Administration · Revenus',
    title: 'MRR en direct depuis Stripe',
    refresh: '↻ Actualiser',
    refreshing: 'Actualisation…',
    loading: 'Chargement…',
    noAccess: 'Chiffre d’affaires',
    noAccessSub: 'Seul le propriétaire du compte peut consulter les revenus.',
    stripePriceWarn: 'Les prix Stripe n’ont pas pu être lus ; le MRR peut donc afficher $0. Vérifiez que STRIPE_SECRET_KEY et les variables STRIPE_PRICE_* sont correctement définies dans votre environnement.',
    mrr: 'MRR (récurrent mensuel)',
    arr: 'ARR (revenu annuel récurrent)',
    activeSubs: 'Abonnements actifs',
    activeWebsite: 'Forfaits de site web actifs',
    activePodcast: 'Plans de podcast actifs',
    byPlan: 'Par formule',
    noSubs: 'Aucun abonnement actif pour l\'instant.',
    active: 'actif',
    perMonth: '/mois',
    footer: 'À partir des abonnements actifs de votre base de données, tarifés en direct depuis Stripe. Il s\'agit d\'une estimation du tableau de bord, pas d\'un registre comptable — rapprochez-la de Stripe pour obtenir les chiffres officiels. Généré',
  },
  it: {
    eyebrow: '💰 Amministrazione · Ricavi',
    title: 'MRR in tempo reale da Stripe',
    refresh: '↻ Aggiorna',
    refreshing: 'Aggiornamento…',
    loading: 'Caricamento…',
    noAccess: 'Ricavi',
    noAccessSub: 'Solo il proprietario dell’account può visualizzare i ricavi.',
    stripePriceWarn: 'Impossibile leggere i prezzi di Stripe, quindi l’MRR potrebbe mostrare $0. Verifica che STRIPE_SECRET_KEY e le variabili STRIPE_PRICE_* siano impostate correttamente nel tuo ambiente.',
    mrr: 'MRR (ricorrente mensile)',
    arr: 'ARR (run-rate annuale)',
    activeSubs: 'Abbonamenti attivi',
    activeWebsite: 'Piani di siti web attivi',
    activePodcast: 'Piani podcast attivi',
    byPlan: 'Per piano',
    noSubs: 'Ancora nessun abbonamento attivo.',
    active: 'attivo',
    perMonth: '/mese',
    footer: 'Dagli abbonamenti attivi nel tuo database, con prezzi in tempo reale da Stripe. Questa è una stima della dashboard, non un registro contabile: confrontala con Stripe per i dati ufficiali. Generato',
  },
  ja: {
    eyebrow: '💰 管理 · 収益',
    title: 'Stripe のリアルタイム MRR',
    refresh: '↻ 更新',
    refreshing: '更新中…',
    loading: '読み込み中…',
    noAccess: '収益',
    noAccessSub: '収益を表示できるのはアカウント所有者のみです。',
    stripePriceWarn: 'Stripe の価格を読み取れなかったため、MRR が $0 と表示される場合があります。環境で STRIPE_SECRET_KEY と STRIPE_PRICE_* 変数が正しく設定されているか確認してください。',
    mrr: 'MRR（月次経常収益）',
    arr: 'ARR（年間ランレート）',
    activeSubs: '有効なサブスクリプション',
    activeWebsite: '有効なウェブサイトプラン',
    activePodcast: 'アクティブなポッドキャストプラン',
    byPlan: 'プラン別',
    noSubs: '有効なサブスクリプションはまだありません。',
    active: '有効',
    perMonth: '/月',
    footer: 'データベース内の有効なサブスクリプションをもとに、Stripe のリアルタイム価格で算出しています。これはダッシュボード上の推定値であり、会計台帳ではありません。正式な数値は Stripe と照合してください。生成日時',
  },
  ko: {
    eyebrow: '💰 관리자 · 매출',
    title: 'Stripe 실시간 MRR',
    refresh: '↻ 새로 고침',
    refreshing: '새로 고치는 중…',
    loading: '불러오는 중…',
    noAccess: '매출',
    noAccessSub: '계정 소유자만 수익을 볼 수 있습니다.',
    stripePriceWarn: 'Stripe 가격을 읽을 수 없어 MRR이 $0으로 표시될 수 있습니다. 환경에 STRIPE_SECRET_KEY 및 STRIPE_PRICE_* 변수가 올바르게 설정되어 있는지 확인하세요.',
    mrr: 'MRR(월간 반복 매출)',
    arr: 'ARR(연간 런레이트)',
    activeSubs: '활성 구독',
    activeWebsite: '활성 웹사이트 플랜',
    activePodcast: '활성 팟캐스트 계획',
    byPlan: '요금제별',
    noSubs: '아직 활성 구독이 없습니다.',
    active: '활성',
    perMonth: '/월',
    footer: '데이터베이스의 활성 구독을 기준으로 Stripe의 실시간 가격을 적용했습니다. 이는 대시보드 추정치이며 회계 원장이 아닙니다. 공식 수치는 Stripe와 대조하세요. 생성 시각',
  },
  ar: {
    eyebrow: '💰 الإدارة · الإيرادات',
    title: 'MRR مباشر من Stripe',
    refresh: '↻ تحديث',
    refreshing: 'جارٍ التحديث…',
    loading: 'جارٍ التحميل…',
    noAccess: 'الإيرادات',
    noAccessSub: 'يمكن لمالك الحساب فقط عرض الإيرادات.',
    stripePriceWarn: 'تعذّرت قراءة أسعار Stripe، لذا قد يظهر MRR بقيمة $0. تحقّق من ضبط STRIPE_SECRET_KEY ومتغيرات STRIPE_PRICE_* بشكل صحيح في بيئتك.',
    mrr: 'MRR (الإيرادات الشهرية المتكررة)',
    arr: 'ARR (معدل الإيرادات السنوي)',
    activeSubs: 'الاشتراكات النشطة',
    activeWebsite: 'خطط المواقع الإلكترونية النشطة',
    activePodcast: 'خطط البودكاست النشطة',
    byPlan: 'حسب الخطة',
    noSubs: 'لا توجد اشتراكات نشطة بعد.',
    active: 'نشط',
    perMonth: '/شهريًا',
    footer: 'مستمدة من الاشتراكات النشطة في قاعدة بياناتك، بأسعار مباشرة من Stripe. هذا تقدير للوحة المعلومات وليس دفترًا محاسبيًا — طابِقه مع Stripe للحصول على الأرقام الرسمية. تم الإنشاء',
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
  if (l === 'de') return 'de'
  if (l === 'fr') return 'fr'
  if (l === 'it') return 'it'
  if (l === 'ja') return 'ja'
  if (l === 'ko') return 'ko'
  if (l === 'ar') return 'ar'
  return 'en'
}

function money(n: number) {
  return '$' + n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

export default function AdminRevenuePage() {
  const { lang: activeLang } = useI18n()
  const [data, setData] = useState<Revenue | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notAllowed, setNotAllowed] = useState(false)
  const c = COPY[(activeLang in COPY ? activeLang : 'en') as keyof typeof COPY]

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/admin/revenue', { cache: 'no-store' })
      if (res.status === 401 || res.status === 403) { setNotAllowed(true); setLoading(false); return }
      const d = await res.json()
      if (!res.ok) { setError(d?.error || "Could not load revenue."); setLoading(false); return }
      setData(d)
    } catch {
      setError("Something went wrong loading revenue.")
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

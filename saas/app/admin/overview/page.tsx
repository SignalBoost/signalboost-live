'use client'

import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { uiText } from '@/lib/i18n/uiText'

const GOLD = '#ffc300'

const COPY = {
  en: { eyebrow: uiText('generatedUi.u_60f398c733f942ff'), title: uiText('generatedUi.u_d4b1ea5708dd5329'), refresh: uiText('generatedUi.u_9cbbfc3a6bd90021'), refreshing: uiText('generatedUi.u_1c0def7be0607b96'), loading: uiText('generatedUi.u_ba3bbbe10d8bef66'), accounts: uiText('generatedUi.u_8a7c8b67fe8bde8b'), registeredUsers: uiText('generatedUi.u_6d3f7c7e3040438d'), teamMembers: uiText('generatedUi.u_74156382383b39d1'), subscriptions: uiText('generatedUi.u_a151f2e912fe8d5b'), planDist: uiText('generatedUi.u_413283722778dc73'), contentActivity: uiText('generatedUi.u_2e221c274137bb6b'), reviews: uiText('generatedUi.u_84cb7871b741c32e'), approved: uiText('generatedUi.u_2687f86ed6784b8a'), campaigns: uiText('generatedUi.u_30e9a089397b25b0'), active: uiText('generatedUi.u_96879611650f80a8'), sitesBuilt: uiText('generatedUi.u_49a29486b89b920e'), published: uiText('generatedUi.u_b04e5ea201bb040c'), outreachLeads: uiText('generatedUi.u_0e654db33f13ff9c'), liveStatus: uiText('generatedUi.u_3e17bbb302699aa1'), liveStatusBody: uiText('generatedUi.u_0e55db9c51ccf0c8'), generated: uiText('generatedUi.u_827ec8d9f99d0521'), errorDefault: uiText('generatedUi.u_8f4d59ff26bd2479'), errorGeneric: uiText('generatedUi.u_efbc054fb0d9b6f9') },
  es: { eyebrow: '🛰️ Admin', title: 'Resumen', refresh: '↻ Actualizar', refreshing: 'Actualizando…', loading: 'Cargando…', accounts: 'Cuentas', registeredUsers: 'Usuarios registrados', teamMembers: 'Miembros del equipo', subscriptions: 'Suscripciones', planDist: 'Distribución de planes', contentActivity: 'Contenido y actividad', reviews: 'Reseñas', approved: 'aprobadas', campaigns: 'Campañas', active: 'activas', sitesBuilt: 'Sitios creados', published: 'publicados', outreachLeads: 'Contactos de alcance', liveStatus: 'Estado de datos en vivo', liveStatusBody: 'Esta vista está conectada a la base de datos de la plataforma. Las métricas sin actividad muestran cero hasta que los flujos de producto, alcance, facturación o telemetría generen nuevos eventos.', generated: 'Generado', errorDefault: 'No se pudo cargar el resumen.', errorGeneric: 'Algo salió mal al cargar el resumen.' },
  pt: { eyebrow: '🛰️ Admin', title: 'Visão geral', refresh: '↻ Atualizar', refreshing: 'Atualizando…', loading: 'Carregando…', accounts: 'Contas', registeredUsers: 'Usuários registrados', teamMembers: 'Membros da equipe', subscriptions: 'Assinaturas', planDist: 'Distribuição de planos', contentActivity: 'Conteúdo e atividade', reviews: 'Avaliações', approved: 'aprovadas', campaigns: 'Campanhas', active: 'ativas', sitesBuilt: 'Sites criados', published: 'publicados', outreachLeads: 'Leads de alcance', liveStatus: 'Status dos dados ao vivo', liveStatusBody: 'Esta visão está conectada ao banco de dados da plataforma. Métricas sem atividade mostram zero até que os fluxos de produto, alcance, faturamento ou telemetria criem novos eventos.', generated: 'Gerado', errorDefault: 'Não foi possível carregar a visão geral.', errorGeneric: 'Algo deu errado ao carregar a visão geral.' },
  pl: { eyebrow: '🛰️ Admin', title: 'Przegląd', refresh: '↻ Odśwież', refreshing: 'Odświeżanie…', loading: 'Ładowanie…', accounts: 'Konta', registeredUsers: 'Zarejestrowani użytkownicy', teamMembers: 'Członkowie zespołu', subscriptions: 'Subskrypcje', planDist: 'Rozkład planów', contentActivity: 'Treści i aktywność', reviews: 'Recenzje', approved: 'zatwierdzone', campaigns: 'Kampanie', active: 'aktywne', sitesBuilt: 'Zbudowane strony', published: 'opublikowane', outreachLeads: 'Leady kontaktowe', liveStatus: 'Status danych na żywo', liveStatusBody: 'Ten widok jest połączony z bazą danych platformy. Metryki bez aktywności pokazują zero, dopóki przepływy produktu, outreachu, rozliczeń lub telemetrii nie utworzą nowych zdarzeń.', generated: 'Wygenerowano', errorDefault: 'Nie udało się załadować przeglądu.', errorGeneric: 'Coś poszło nie tak podczas ładowania przeglądu.' },
  ru: { eyebrow: '🛰️ Admin', title: 'Обзор', refresh: '↻ Обновить', refreshing: 'Обновление…', loading: 'Загрузка…', accounts: 'Аккаунты', registeredUsers: 'Зарегистрированные пользователи', teamMembers: 'Члены команды', subscriptions: 'Подписки', planDist: 'Распределение планов', contentActivity: 'Контент и активность', reviews: 'Отзывы', approved: 'одобрено', campaigns: 'Кампании', active: 'активных', sitesBuilt: 'Созданные сайты', published: 'опубликовано', outreachLeads: 'Лиды для охвата', liveStatus: 'Статус данных в реальном времени', liveStatusBody: 'Этот вид подключён к базе данных платформы. Метрики без активности показывают ноль, пока продуктовые, outreach, биллинговые или телеметрические процессы не создадут новые события.', generated: 'Сгенерировано', errorDefault: 'Не удалось загрузить обзор.', errorGeneric: 'Что-то пошло не так при загрузке обзора.' },
  de: { eyebrow: '🛰️ Admin', title: 'Übersicht', refresh: '↻ Aktualisieren', refreshing: 'Wird aktualisiert…', loading: 'Wird geladen…', accounts: 'Konten', registeredUsers: 'Registrierte Benutzer', teamMembers: 'Teammitglieder', subscriptions: 'Abonnements', planDist: 'Verteilung planen', contentActivity: 'Inhalte & Aktivität', reviews: 'Bewertungen', approved: 'genehmigt', campaigns: 'Kampagnen', active: 'aktiv', sitesBuilt: 'Erstellte Websites', published: 'veröffentlicht', outreachLeads: 'Outreach-Leads', liveStatus: 'Live-Datenstatus', liveStatusBody: 'Diese Ansicht ist mit der Plattformdatenbank verbunden. Kennzahlen ohne Aktivität zeigen null, bis neue Ereignisse durch Produkt-, Outreach-, Abrechnungs- oder Telemetrie-Workflows erzeugt werden.', generated: 'Generiert', errorDefault: 'Übersicht konnte nicht geladen werden.', errorGeneric: 'Beim Laden der Übersicht ist ein Fehler aufgetreten.' },
  fr: { eyebrow: '🛰️ Administration', title: 'Vue d’ensemble', refresh: '↻ Actualiser', refreshing: 'Actualisation…', loading: 'Chargement…', accounts: 'Comptes', registeredUsers: 'Utilisateurs inscrits', teamMembers: 'Membres de l\'équipe', subscriptions: 'Abonnements', planDist: 'Planifier la diffusion', contentActivity: 'Contenu et activité', reviews: 'Avis', approved: 'approuvé', campaigns: 'Campagnes', active: 'actif', sitesBuilt: 'Sites créés', published: 'publié', outreachLeads: 'Prospects de prospection', liveStatus: 'État des données en direct', liveStatusBody: 'Cette vue est connectée à la base de données de la plateforme. Les métriques sans activité affichent zéro jusqu\'à ce que de nouveaux événements soient créés par les workflows produit, prospection, facturation ou télémétrie.', generated: 'Généré', errorDefault: 'Impossible de charger la vue d\'ensemble.', errorGeneric: 'Une erreur s\'est produite lors du chargement de l\'aperçu.' },
  it: { eyebrow: '🛰️ Amministrazione', title: 'Panoramica', refresh: '↻ Aggiorna', refreshing: 'Aggiornamento…', loading: 'Caricamento…', accounts: 'Account', registeredUsers: 'Utenti registrati', teamMembers: 'Membri del team', subscriptions: 'Abbonamenti', planDist: 'Pianifica la distribuzione', contentActivity: 'Contenuti e attività', reviews: 'Recensioni', approved: 'approvato', campaigns: 'Campagne', active: 'attivo', sitesBuilt: 'Siti creati', published: 'pubblicato', outreachLeads: 'Lead di outreach', liveStatus: 'Stato dei dati in tempo reale', liveStatusBody: 'Questa vista è collegata al database della piattaforma. Le metriche senza attività mostrano zero finché i workflow di prodotto, outreach, fatturazione o telemetria non creano nuovi eventi.', generated: 'Generato', errorDefault: 'Impossibile caricare la panoramica.', errorGeneric: 'Si è verificato un errore durante il caricamento della panoramica.' },
  ja: { eyebrow: '🛰️ 管理', title: '概要', refresh: '↻ 更新', refreshing: '更新中…', loading: '読み込み中…', accounts: 'アカウント', registeredUsers: '登録ユーザー', teamMembers: 'チームメンバー', subscriptions: 'サブスクリプション', planDist: '配信を計画', contentActivity: 'コンテンツとアクティビティ', reviews: 'レビュー', approved: '承認済み', campaigns: 'キャンペーン', active: '有効', sitesBuilt: '構築済みサイト', published: '公開済み', outreachLeads: 'アウトリーチ見込み客', liveStatus: 'ライブデータのステータス', liveStatusBody: 'このビューはプラットフォームのデータベースに接続されています。アクティビティのない指標は、製品、アウトリーチ、請求、テレメトリーのワークフローによって新しいイベントが作成されるまでゼロと表示されます。', generated: '生成済み', errorDefault: '概要を読み込めませんでした。', errorGeneric: '概要の読み込み中に問題が発生しました。' },
  ko: { eyebrow: '🛰️ 관리자', title: '개요', refresh: '↻ 새로 고침', refreshing: '새로 고치는 중…', loading: '불러오는 중…', accounts: '계정', registeredUsers: '등록된 사용자', teamMembers: '팀원', subscriptions: '구독', planDist: '배포 계획', contentActivity: '콘텐츠 및 활동', reviews: '리뷰', approved: '승인됨', campaigns: '캠페인', active: '활성', sitesBuilt: '구축된 사이트', published: '게시됨', outreachLeads: '아웃리치 리드', liveStatus: '실시간 데이터 상태', liveStatusBody: '이 보기는 플랫폼 데이터베이스에 연결되어 있습니다. 활동이 없는 지표는 제품, 아웃리치, 결제 또는 텔레메트리 워크플로에서 새 이벤트가 생성될 때까지 0으로 표시됩니다.', generated: '생성됨', errorDefault: '개요를 불러올 수 없습니다.', errorGeneric: '개요를 불러오는 중 문제가 발생했습니다.' },
  ar: { eyebrow: '🛰️ الإدارة', title: 'نظرة عامة', refresh: '↻ تحديث', refreshing: 'جارٍ التحديث…', loading: 'جارٍ التحميل…', accounts: 'الحسابات', registeredUsers: 'المستخدمون المسجّلون', teamMembers: 'أعضاء الفريق', subscriptions: 'الاشتراكات', planDist: 'تخطيط التوزيع', contentActivity: 'المحتوى والنشاط', reviews: 'المراجعات', approved: 'تمت الموافقة', campaigns: 'الحملات', active: 'نشط', sitesBuilt: 'المواقع المنشأة', published: 'منشور', outreachLeads: 'العملاء المحتملون للتواصل', liveStatus: 'حالة البيانات المباشرة', liveStatusBody: 'هذا العرض متصل بقاعدة بيانات المنصة. تعرض المقاييس التي لا نشاط فيها صفرًا إلى أن تُنشئ مسارات عمل المنتج أو التواصل أو الفوترة أو القياس عن بُعد أحداثًا جديدة.', generated: 'تم الإنشاء', errorDefault: 'تعذّر تحميل النظرة العامة.', errorGeneric: 'حدث خطأ أثناء تحميل النظرة العامة.' },
}

type Lang = keyof typeof COPY
function getLang(): Lang { if (typeof window !== 'undefined') { const s = localStorage.getItem('signalboost_language'); if (s && (s in COPY)) return s as any }; if (typeof navigator === 'undefined') return 'en'; const l = navigator.language?.slice(0, 2); return (l in COPY ? l : 'en') as Lang }

type Overview = {
  generatedAt: string
  content: { reviews: number; approvedReviews: number; campaigns: number; activeCampaigns: number; projects: number; publishedProjects: number; leads: number; approvedLeads: number }
  accounts: { totalUsers: number; teamMembers: number; subscriptions: number; plans: Record<string, number> }
}

function Stat({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div style={{ borderInlineStart: '2px solid rgba(26,240,255,.4)', paddingInlineStart: 14 }}>
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
  const { lang: activeLang } = useI18n()
  const c = COPY[(activeLang in COPY ? activeLang : 'en') as keyof typeof COPY]

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
                    <span className="sb-caption" style={{ marginInlineStart: 6, textTransform: 'capitalize' }}>{plan}</span>
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

          <section style={{ borderInlineStart: '2px solid rgba(255,195,0,.5)', paddingInlineStart: 14 }}>
            <h3 style={{ margin: 0, fontSize: 13, fontWeight: 900, color: '#ffc300' }}>{c.liveStatus}</h3>
            <p className="sb-caption" style={{ margin: '6px 0 0' }}>{c.liveStatusBody}</p>
          </section>

          <p className="sb-caption" style={{ marginTop: 18, opacity: 0.5 }}>
            {c.generated} {new Date(data.generatedAt).toLocaleString()}
          </p>
        </>
      )}
    </main>
  )
}

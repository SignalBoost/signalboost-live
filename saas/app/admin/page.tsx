'use client'

import { useEffect, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { ADMIN_SIDEBAR } from '@/lib/platform/unifiedPlatform'
import { uiText } from '@/lib/i18n/uiText'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru' | 'de' | 'fr' | 'it' | 'ja' | 'ko' | 'ar'
type MetricValues = Record<string, number | string>

const COPY: Record<Lang, {
  eyebrow: string
  title: string
  body: string
  role: string
  open: string
  loading: string
  updated: string
  live: string
  noActivity: string
  notConnected: string
  noneYet: string
  sectionStatus: string
}> = {
  en: {
    eyebrow: uiText('generatedUi.u_f7d0be450adb7b21'),
    title: uiText('generatedUi.u_4936fe9b0bc13549'),
    body: uiText('generatedUi.u_95bedab368641b18'),
    role: "Restricted: Owner/Admin",
    open: uiText('generatedUi.u_6992a7968a788794'),
    loading: uiText('generatedUi.u_3746550ab2d2d3c9'),
    updated: uiText('generatedUi.u_3a5ecca188c0579c'),
    live: uiText('generatedUi.u_0a165b533d15643d'),
    noActivity: uiText('generatedUi.u_0a12b92ce7899469'),
    notConnected: uiText('generatedUi.u_0303e18246708180'),
    noneYet: uiText('generatedUi.u_adb85cf22bfc3254'),
    sectionStatus: uiText('generatedUi.u_bf1e0a124a3d6d84'),
  },
  es: {
    eyebrow: 'Consola del propietario',
    title: 'Centro de mando SignalBoost en vivo',
    body: 'Navegación owner/admin conectada a métricas reales: cuentas, outreach, uso de IA, suscripciones, salud del sistema y controles administrativos.',
    role: 'Restringido: Propietario/Admin',
    open: 'Abrir consola en vivo',
    loading: 'Cargando métricas en vivo…',
    updated: 'Actualizado',
    live: 'Métricas en vivo',
    noActivity: 'Sin actividad todavía',
    notConnected: 'No conectado',
    noneYet: 'Nada aún',
    sectionStatus: 'Resumen de sección en vivo',
  },
  pt: {
    eyebrow: 'Console do proprietário',
    title: 'Centro de comando SignalBoost ao vivo',
    body: 'Navegação owner/admin conectada a métricas reais: contas, outreach, uso de IA, assinaturas, saúde do sistema e controles administrativos.',
    role: 'Restrito: Proprietário/Admin',
    open: 'Abrir console ao vivo',
    loading: 'Carregando métricas ao vivo…',
    updated: 'Atualizado',
    live: 'Métricas ao vivo',
    noActivity: 'Sem atividade ainda',
    notConnected: 'Não conectado',
    noneYet: 'Nada ainda',
    sectionStatus: 'Resumo da seção ao vivo',
  },
  pl: {
    eyebrow: 'Konsola właściciela',
    title: 'Centrum dowodzenia SignalBoost na żywo',
    body: 'Nawigacja owner/admin połączona z rzeczywistymi metrykami: konta, outreach, użycie AI, subskrypcje, zdrowie systemu i kontrole administracyjne.',
    role: 'Dostęp ograniczony: Właściciel/Admin',
    open: 'Otwórz konsolę live',
    loading: 'Ładowanie metryk live…',
    updated: 'Zaktualizowano',
    live: 'Metryki live',
    noActivity: 'Brak aktywności',
    notConnected: 'Nie połączono',
    noneYet: 'Jeszcze brak',
    sectionStatus: 'Podsumowanie sekcji live',
  },
  ru: {
    eyebrow: 'Консоль владельца',
    title: 'Живой командный центр SignalBoost',
    body: 'Навигация owner/admin подключена к реальным метрикам: аккаунты, outreach, использование ИИ, подписки, здоровье системы и административные элементы.',
    role: 'Доступ ограничен: Владелец/Администратор',
    open: 'Открыть live-консоль',
    loading: 'Загрузка live-метрик…',
    updated: 'Обновлено',
    live: 'Live-метрики',
    noActivity: 'Пока нет активности',
    notConnected: 'Не подключено',
    noneYet: 'Пока нет',
    sectionStatus: 'Live-сводка раздела',
  },
  de: {
    eyebrow: 'Inhaberkonsole',
    title: 'SignalBoost-Live-Kommandozentrale',
    body: 'Inhaber-/Admin-Navigation mit echten Plattformmetriken: Konten, Outreach, KI-Nutzung, Abonnements, Systemzustand und Admin-Steuerung.',
    role: "Eingeschränkt: Eigentümer/Admin",
    open: 'Live-Konsole öffnen',
    loading: 'Live-Metriken werden geladen…',
    updated: 'Aktualisiert',
    live: 'Live-Kennzahlen',
    noActivity: 'Noch keine Aktivität',
    notConnected: 'Nicht verbunden',
    noneYet: 'Noch keine',
    sectionStatus: 'Live-Zusammenfassung des Abschnitts',
  },
  fr: {
    eyebrow: 'Console du propriétaire',
    title: 'Centre de commande SignalBoost en direct',
    body: 'Navigation propriétaire/administrateur reliée aux métriques réelles de la plateforme : comptes, prospection, utilisation de l\'IA, abonnements, santé du système et contrôles d\'administration.',
    role: "Restreint : Propriétaire/Admin",
    open: 'Ouvrir la console en direct',
    loading: 'Chargement des métriques en direct…',
    updated: 'Mis à jour',
    live: 'Métriques en direct',
    noActivity: 'Aucune activité pour l\'instant',
    notConnected: 'Non connecté',
    noneYet: 'Aucun pour l’instant',
    sectionStatus: 'Résumé de la section en direct',
  },
  it: {
    eyebrow: 'Console del proprietario',
    title: 'Centro di comando SignalBoost live',
    body: 'Navigazione proprietario/amministratore collegata alle metriche reali della piattaforma: account, outreach, utilizzo AI, abbonamenti, stato del sistema e controlli amministrativi.',
    role: "Riservato: Proprietario/Admin",
    open: 'Apri console live',
    loading: 'Caricamento metriche in tempo reale…',
    updated: 'Aggiornato',
    live: 'Metriche in tempo reale',
    noActivity: 'Ancora nessuna attività',
    notConnected: 'Non connesso',
    noneYet: 'Ancora nessuno',
    sectionStatus: 'Riepilogo della sezione in tempo reale',
  },
  ja: {
    eyebrow: 'オーナーコンソール',
    title: 'SignalBoost ライブ コマンドセンター',
    body: '実際のプラットフォーム指標に接続されたオーナー／管理者ナビゲーション：アカウント、アウトリーチ、AI 使用量、サブスクリプション、システムの状態、管理コントロール。',
    role: "制限: オーナー/管理者",
    open: 'ライブコンソールを開く',
    loading: 'ライブ指標を読み込み中…',
    updated: '更新済み',
    live: 'リアルタイム指標',
    noActivity: 'まだアクティビティはありません',
    notConnected: '未接続',
    noneYet: 'まだありません',
    sectionStatus: 'セクションのライブ概要',
  },
  ko: {
    eyebrow: '소유자 콘솔',
    title: 'SignalBoost 실시간 커맨드 센터',
    body: '실제 플랫폼 지표에 연결된 소유자/관리자 탐색: 계정, 아웃리치, AI 사용량, 구독, 시스템 상태, 관리자 제어.',
    role: "제한됨: 소유자/관리자",
    open: '실시간 콘솔 열기',
    loading: '실시간 지표 로드 중…',
    updated: '업데이트됨',
    live: '실시간 지표',
    noActivity: '아직 활동 없음',
    notConnected: '연결되지 않음',
    noneYet: '아직 없음',
    sectionStatus: '섹션 실시간 요약',
  },
  ar: {
    eyebrow: 'وحدة تحكم المالك',
    title: 'مركز قيادة SignalBoost المباشر',
    body: 'تنقّل المالك/المسؤول متصل بمقاييس المنصة الفعلية: الحسابات والتواصل واستخدام AI والاشتراكات وسلامة النظام وعناصر التحكم الإدارية.',
    role: "مقيَّد: المالك/المسؤول",
    open: 'فتح وحدة التحكم المباشرة',
    loading: 'جارٍ تحميل المقاييس المباشرة…',
    updated: 'تم التحديث',
    live: 'مقاييس مباشرة',
    noActivity: 'لا يوجد نشاط بعد',
    notConnected: 'غير متصل',
    noneYet: 'لا شيء بعد',
    sectionStatus: 'ملخص القسم المباشر',
  },
}

function copyFor(lang: string): typeof COPY.en {
  return COPY[(['en', 'es', 'pt', 'pl', 'ru', 'de', 'fr', 'it', 'ja', 'ko', 'ar'].includes(lang) ? lang : 'en') as Lang]
}

function value(values: MetricValues, key: string, fallback: string | number = 0): string | number {
  const v = values[key]
  if (typeof v === 'number') return v.toLocaleString()
  if (typeof v === 'string' && v.length) return v
  return fallback
}

function sectionSummary(href: string, values: MetricValues, c: typeof COPY.en): [string, string][] {
  switch (href) {
    case '/admin':
      return [['Users', String(value(values, 'overview-0'))], ['Outreach', String(value(values, 'overview-12'))], ['Leads', String(value(values, 'overview-13'))]]
    case '/admin/system':
      return [['API errors', String(value(values, 'sys-0'))], ['Supabase', String(value(values, 'sys-2', c.notConnected))], ['Daily jobs', String(value(values, 'sys-5'))]]
    case '/admin/sales':
      return [['Prospects', String(value(values, 'sales-0'))], ['Released', String(value(values, 'sales-4'))], ['Response', String(value(values, 'sales-9', '0%'))]]
    case '/admin/ai':
      return [['AI tasks', String(value(values, 'ai-0'))], ['Errors', String(value(values, 'ai-3'))], ['Latency', String(value(values, 'ai-4', c.noActivity))]]
    case '/admin/settings/roles':
      return [['Access', 'Owner/Admin'], ['Status', 'Protected'], ['Audit', String(value(values, 'sys-0'))]]
    case '/admin/partners':
      return [['Partners', String(value(values, 'partners-0'))], ['Top category', String(value(values, 'partners-4', c.noneYet))], ['Monitor', c.live]]
    case '/admin/saas':
      return [['Accounts', String(value(values, 'saas-0'))], ['Sites', String(value(values, 'saas-3'))], ['AI usage', String(value(values, 'saas-7'))]]
    case '/admin/adm':
      return [['Sessions', String(value(values, 'adm-0'))], ['Messages', String(value(values, 'adm-7'))], ['Monitor', c.live]]
    default:
      return [[c.sectionStatus, c.live]]
  }
}

export default function AdminLandingPage() {
  const { lang } = useI18n()
  const c = copyFor(lang)
  const [values, setValues] = useState<MetricValues>({})
  const [generatedAt, setGeneratedAt] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    fetch('/api/admin/section-metrics', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active) return
        setValues(data?.values || {})
        setGeneratedAt(data?.generatedAt || '')
      })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  return (
    <div className="sb-cockpit-stack">
      <section className="sb-admin-topbar" role="banner" aria-label={c.eyebrow}>
        <div>
          <p className="sb-eyebrow">{c.eyebrow}</p>
          <h1>{c.title}</h1>
          <p className="sb-body">{c.body}</p>
          {generatedAt ? <p className="sb-caption" style={{ marginTop: 10 }}>{c.updated}: {new Date(generatedAt).toLocaleString()}</p> : null}
        </div>
        <span className="sb-role-pill">{c.role}</span>
      </section>

      {loading ? <p className="sb-caption">{c.loading}</p> : null}

      <section className="sb-cockpit-grid" aria-label={uiText('generatedUi.u_526d8e0d47e07ebc')}>
        {ADMIN_SIDEBAR.map(item => {
          const rows = sectionSummary(item.href, values, c)
          return (
            <a key={item.href} className="sb-neon-panel" href={item.href} aria-label={`${c.open} ${item.label}`}>
              <p><span aria-hidden="true">{item.icon}</span> {item.label}</p>
              <strong>{rows[0]?.[1] ?? c.live}</strong>
              <span>{rows[0]?.[0] ?? c.sectionStatus}</span>
              <div style={{ display: 'grid', gap: 6, marginTop: 14 }}>
                {rows.slice(1).map(([label, rowValue]) => (
                  <small key={label} style={{ color: 'rgba(226,232,240,.7)', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <span>{label}</span>
                    <b style={{ color: '#9ff7ff' }}>{rowValue}</b>
                  </small>
                ))}
              </div>
              <span style={{ marginTop: 14, color: '#ffc300' }}>{c.open} →</span>
            </a>
          )
        })}
      </section>
    </div>
  )
}

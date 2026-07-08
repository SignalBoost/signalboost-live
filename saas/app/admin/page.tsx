'use client'

import { useEffect, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { ADMIN_SIDEBAR } from '@/lib/platform/unifiedPlatform'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'
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
    eyebrow: 'Owner Console',
    title: 'Live SignalBoost command center',
    body: 'Owner/admin navigation connected to real platform metrics: accounts, outreach, AI usage, subscriptions, system health, and admin controls.',
    role: 'Restricted: Owner/Admin',
    open: 'Open live console',
    loading: 'Loading live metrics…',
    updated: 'Updated',
    live: 'Live metrics',
    noActivity: 'No activity yet',
    notConnected: 'Not connected',
    noneYet: 'None yet',
    sectionStatus: 'Live section summary',
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
}

function copyFor(lang: string): typeof COPY.en {
  return COPY[(['en', 'es', 'pt', 'pl', 'ru'].includes(lang) ? lang : 'en') as Lang]
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

      <section className="sb-cockpit-grid" aria-label="Admin console live sections">
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

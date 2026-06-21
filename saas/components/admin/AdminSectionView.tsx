'use client'

import { useEffect, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { AdminSectionConfig, translateSection } from '@/lib/admin/sections'
import { COCKPIT_PANELS, CRM_STAGES, EXECUTIVE_RECOMMENDATIONS, FINANCIAL_LEDGER, FORECASTS, KPI_DASHBOARD } from '@/lib/platform/unifiedPlatform'

const COPY: Record<string, Record<string, string>> = {
  en: {
    eyebrow: 'NASA-style admin console',
    forecasting: 'Forecasting',
    financialLedger: 'Financial ledger',
    kpiCockpit: 'KPI cockpit',
    marketplace: 'Marketplace',
    saas: 'SaaS',
    unifiedEngagement: 'Unified engagement index',
    crmPipeline: 'CRM pipeline',
    conciergeRecs: 'Concierge recommendations',
    filters: 'Filters: date range \u2022 product \u2022 country \u2022 plan \u2022 role',
    telemetryReady: 'Telemetry-ready. Connect analytics tables/events to activate live records for this cockpit panel.',
    notTracked: 'Not tracked yet',
    telemetrySignal: 'Telemetry-ready signal',
  },
  es: {
    eyebrow: 'Consola admin estilo NASA',
    forecasting: 'Pron\u00f3sticos',
    financialLedger: 'Libro financiero',
    kpiCockpit: 'Cabina KPI',
    marketplace: 'Marketplace',
    saas: 'SaaS',
    unifiedEngagement: '\u00cdndice de participaci\u00f3n unificado',
    crmPipeline: 'Pipeline CRM',
    conciergeRecs: 'Recomendaciones del concierge',
    filters: 'Filtros: rango de fechas \u2022 producto \u2022 pa\u00eds \u2022 plan \u2022 rol',
    telemetryReady: 'Telemetr\u00eda lista. Conecta tablas/eventos de an\u00e1lisis para activar registros en vivo en este panel.',
    notTracked: 'A\u00fan no rastreado',
    telemetrySignal: 'Se\u00f1al de telemetr\u00eda lista',
  },
  pt: {
    eyebrow: 'Console admin estilo NASA',
    forecasting: 'Previs\u00f5es',
    financialLedger: 'Livro financeiro',
    kpiCockpit: 'Cabine KPI',
    marketplace: 'Marketplace',
    saas: 'SaaS',
    unifiedEngagement: '\u00cdndice de engajamento unificado',
    crmPipeline: 'Pipeline CRM',
    conciergeRecs: 'Recomenda\u00e7\u00f5es do concierge',
    filters: 'Filtros: intervalo de datas \u2022 produto \u2022 pa\u00eds \u2022 plano \u2022 fun\u00e7\u00e3o',
    telemetryReady: 'Telemetria pronta. Conecte tabelas/eventos de an\u00e1lise para ativar registros ao vivo neste painel.',
    notTracked: 'Ainda n\u00e3o rastreado',
    telemetrySignal: 'Sinal de telemetria pronto',
  },
  pl: {
    eyebrow: 'Konsola admin w stylu NASA',
    forecasting: 'Prognozy',
    financialLedger: 'Ksi\u0119ga finansowa',
    kpiCockpit: 'Kokpit KPI',
    marketplace: 'Marketplace',
    saas: 'SaaS',
    unifiedEngagement: 'Zunifikowany wska\u017anik zaanga\u017cowania',
    crmPipeline: 'Pipeline CRM',
    conciergeRecs: 'Rekomendacje concierge',
    filters: 'Filtry: zakres dat \u2022 produkt \u2022 kraj \u2022 plan \u2022 rola',
    telemetryReady: 'Telemetria gotowa. Pod\u0142\u0105cz tabele/zdarzenia analityczne, aby aktywowa\u0107 rekordy na \u017cywo w tym panelu.',
    notTracked: 'Jeszcze nie \u015bledzone',
    telemetrySignal: 'Sygna\u0142 telemetrii gotowy',
  },
  ru: {
    eyebrow: '\u041a\u043e\u043d\u0441\u043e\u043b\u044c \u0430\u0434\u043c\u0438\u043d\u0438\u0441\u0442\u0440\u0430\u0442\u043e\u0440\u0430 \u0432 \u0441\u0442\u0438\u043b\u0435 NASA',
    forecasting: '\u041f\u0440\u043e\u0433\u043d\u043e\u0437\u044b',
    financialLedger: '\u0424\u0438\u043d\u0430\u043d\u0441\u043e\u0432\u0430\u044f \u043a\u043d\u0438\u0433\u0430',
    kpiCockpit: '\u041a\u0430\u0431\u0438\u043d\u0430 KPI',
    marketplace: '\u041c\u0430\u0440\u043a\u0435\u0442\u043f\u043b\u0435\u0439\u0441',
    saas: 'SaaS',
    unifiedEngagement: '\u0415\u0434\u0438\u043d\u044b\u0439 \u0438\u043d\u0434\u0435\u043a\u0441 \u0432\u043e\u0432\u043b\u0435\u0447\u0451\u043d\u043d\u043e\u0441\u0442\u0438',
    crmPipeline: 'Pipeline CRM',
    conciergeRecs: '\u0420\u0435\u043a\u043e\u043c\u0435\u043d\u0434\u0430\u0446\u0438\u0438 \u043a\u043e\u043d\u0441\u044c\u0435\u0440\u0436\u0430',
    filters: '\u0424\u0438\u043b\u044c\u0442\u0440\u044b: \u0434\u0438\u0430\u043f\u0430\u0437\u043e\u043d \u0434\u0430\u0442 \u2022 \u043f\u0440\u043e\u0434\u0443\u043a\u0442 \u2022 \u0441\u0442\u0440\u0430\u043d\u0430 \u2022 \u043f\u043b\u0430\u043d \u2022 \u0440\u043e\u043b\u044c',
    telemetryReady: '\u0422\u0435\u043b\u0435\u043c\u0435\u0442\u0440\u0438\u044f \u0433\u043e\u0442\u043e\u0432\u0430. \u041f\u043e\u0434\u043a\u043b\u044e\u0447\u0438\u0442\u0435 \u0430\u043d\u0430\u043b\u0438\u0442\u0438\u0447\u0435\u0441\u043a\u0438\u0435 \u0442\u0430\u0431\u043b\u0438\u0446\u044b/\u0441\u043e\u0431\u044b\u0442\u0438\u044f \u0434\u043b\u044f \u0430\u043a\u0442\u0438\u0432\u0430\u0446\u0438\u0438 \u0437\u0430\u043f\u0438\u0441\u0435\u0439 \u0432 \u0440\u0435\u0430\u043b\u044c\u043d\u043e\u043c \u0432\u0440\u0435\u043c\u0435\u043d\u0438.',
    notTracked: '\u0415\u0449\u0451 \u043d\u0435 \u043e\u0442\u0441\u043b\u0435\u0436\u0438\u0432\u0430\u0435\u0442\u0441\u044a',
    telemetrySignal: '\u0421\u0438\u0433\u043d\u0430\u043b \u0442\u0435\u043b\u0435\u043c\u0435\u0442\u0440\u0438\u0438 \u0433\u043e\u0442\u043e\u0432',
  },
}

function useLang(): string {
  if (typeof window !== 'undefined') { const s = localStorage.getItem('signalboost_language'); if (s && (s in COPY)) return s as any }
  if (typeof navigator === 'undefined') return 'en'
  const lang = navigator.language?.slice(0, 2).toLowerCase()
  return COPY[lang] ? lang : 'en'
}

export default function AdminSectionView({ section: rawSection }: { section: AdminSectionConfig }) {
  const { lang: activeLang } = useI18n()
  const t = COPY[(activeLang in COPY ? activeLang : 'en') as keyof typeof COPY]
  const section = translateSection(rawSection, activeLang in COPY ? activeLang : 'en')

  // Live metric values from real tables; keys that have no backing source are
  // simply absent here and fall back to the honest "Not tracked yet" placeholder.
  const [live, setLive] = useState<Record<string, number> | null>(null)
  useEffect(() => {
    let active = true
    fetch('/api/admin/section-metrics', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (active && d && d.values) setLive(d.values) })
      .catch(() => {})
    return () => { active = false }
  }, [])

  const liveValue = (key: string): string | number | undefined => {
    const v = live ? (live as any)[key] : undefined
    if (typeof v === 'number') return v.toLocaleString()
    if (typeof v === 'string' && v.length) return v
    return undefined
  }

  return (
    <div className="sb-cockpit-stack" role="region" aria-label={`${section.title} admin console section`}>
      <header className="sb-cockpit-hero">
        <span className="sb-eyebrow">{t.eyebrow}</span>
        <h2>{section.title}</h2>
        <p>{section.description}</p>
      </header>

      <section className="sb-cockpit-grid" aria-label="Dashboard panels">
        {section.metrics.map(metric => (
          <article key={metric.key} className="sb-neon-panel" tabIndex={0}>
            <p>{metric.label}</p>
            <strong>{liveValue(metric.key) ?? metric.value ?? t.notTracked}</strong>
            <span>{metric.helper ?? t.telemetrySignal}</span>
          </article>
        ))}
      </section>

      <section className="sb-mission-grid" aria-label="Unified operational intelligence">
        <article className="sb-glass-panel">
          <h3>{t.forecasting}</h3>
          {FORECASTS.map(item => (
            <p key={item.horizon}>
              <strong>{item.horizon}</strong> · {item.revenue} · campaign {item.campaignSuccess} · upsell {item.upsellLikelihood}
            </p>
          ))}
        </article>
        <article className="sb-glass-panel">
          <h3>{t.financialLedger}</h3>
          {Object.entries(FINANCIAL_LEDGER).map(([key, value]) => (
            <p key={key}><strong>{key.replace(/([A-Z])/g, ' $1')}</strong> · {value}</p>
          ))}
        </article>
        <article className="sb-glass-panel">
          <h3>{t.kpiCockpit}</h3>
          <p><strong>{t.marketplace}</strong> · {KPI_DASHBOARD.marketplace.join(' · ')}</p>
          <p><strong>{t.saas}</strong> · {KPI_DASHBOARD.saas.join(' · ')}</p>
          <p><strong>{t.unifiedEngagement}</strong> · {KPI_DASHBOARD.unifiedEngagementIndex}</p>
        </article>
        <article className="sb-glass-panel">
          <h3>{t.crmPipeline}</h3>
          {CRM_STAGES.map(stage => (
            <p key={stage.stage}>
              <strong>{stage.stage}</strong> · {Math.round(stage.probability * 100)}% · {stage.automation}
            </p>
          ))}
        </article>
      </section>

      <section className="sb-orbit-table" aria-label={section.tableTitle}>
        <div className="sb-orbit-table__header">
          <h3>{section.tableTitle}</h3>
          <span>{t.filters}</span>
        </div>
        <table>
          <thead>
            <tr>{section.tableColumns.map(c => <th key={c}>{c}</th>)}</tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={section.tableColumns.length}>{t.telemetryReady}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="sb-mission-grid" aria-label="Executive recommendations">
        {COCKPIT_PANELS.slice(0, 3).map(panel => (
          <article key={panel.title} className="sb-glass-panel">
            <h3>{panel.title}</h3>
            <p><strong>{panel.value}</strong></p>
            <p>{panel.status}</p>
          </article>
        ))}
        <article className="sb-glass-panel">
          <h3>{t.conciergeRecs}</h3>
          {EXECUTIVE_RECOMMENDATIONS.map(item => <p key={item}>• {item}</p>)}
        </article>
      </section>
    </div>
  )
}

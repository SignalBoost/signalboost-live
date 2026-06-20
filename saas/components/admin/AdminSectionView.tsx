import { AdminSectionConfig } from '@/lib/admin/sections'
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
    filters: 'Filters: date range • product • country • plan • role',
    telemetryReady: 'Telemetry-ready. Connect analytics tables/events to activate live records for this cockpit panel.',
    notTracked: 'Not tracked yet',
    telemetrySignal: 'Telemetry-ready signal',
  },
  es: {
    eyebrow: 'Consola admin estilo NASA',
    forecasting: 'Pronósticos',
    financialLedger: 'Libro financiero',
    kpiCockpit: 'Cabina KPI',
    marketplace: 'Marketplace',
    saas: 'SaaS',
    unifiedEngagement: 'Índice de participación unificado',
    crmPipeline: 'Pipeline CRM',
    conciergeRecs: 'Recomendaciones del concierge',
    filters: 'Filtros: rango de fechas • producto • país • plan • rol',
    telemetryReady: 'Telemetría lista. Conecta tablas/eventos de análisis para activar registros en vivo en este panel.',
    notTracked: 'Aún no rastreado',
    telemetrySignal: 'Señal de telemetría lista',
  },
  pt: {
    eyebrow: 'Console admin estilo NASA',
    forecasting: 'Previsões',
    financialLedger: 'Livro financeiro',
    kpiCockpit: 'Cabine KPI',
    marketplace: 'Marketplace',
    saas: 'SaaS',
    unifiedEngagement: 'Índice de engajamento unificado',
    crmPipeline: 'Pipeline CRM',
    conciergeRecs: 'Recomendações do concierge',
    filters: 'Filtros: intervalo de datas • produto • país • plano • função',
    telemetryReady: 'Telemetria pronta. Conecte tabelas/eventos de análise para ativar registros ao vivo neste painel.',
    notTracked: 'Ainda não rastreado',
    telemetrySignal: 'Sinal de telemetria pronto',
  },
  pl: {
    eyebrow: 'Konsola admin w stylu NASA',
    forecasting: 'Prognozy',
    financialLedger: 'Księga finansowa',
    kpiCockpit: 'Kokpit KPI',
    marketplace: 'Marketplace',
    saas: 'SaaS',
    unifiedEngagement: 'Zunifikowany wskaźnik zaangażowania',
    crmPipeline: 'Pipeline CRM',
    conciergeRecs: 'Rekomendacje concierge',
    filters: 'Filtry: zakres dat • produkt • kraj • plan • rola',
    telemetryReady: 'Telemetria gotowa. Podłącz tabele/zdarzenia analityczne, aby aktywować rekordy na żywo w tym panelu.',
    notTracked: 'Jeszcze nie śledzone',
    telemetrySignal: 'Sygnał telemetrii gotowy',
  },
  ru: {
    eyebrow: 'Консоль администратора в стиле NASA',
    forecasting: 'Прогнозы',
    financialLedger: 'Финансовая книга',
    kpiCockpit: 'Кабина KPI',
    marketplace: 'Маркетплейс',
    saas: 'SaaS',
    unifiedEngagement: 'Единый индекс вовлечённости',
    crmPipeline: 'Pipeline CRM',
    conciergeRecs: 'Рекомендации консьержа',
    filters: 'Фильтры: диапазон дат • продукт • страна • план • роль',
    telemetryReady: 'Телеметрия готова. Подключите аналитические таблицы/события для активации записей в реальном времени.',
    notTracked: 'Ещё не отслеживается',
    telemetrySignal: 'Сигнал телеметрии готов',
  },
}

function useLang(): string {
  if (typeof navigator === 'undefined') return 'en'
  const lang = navigator.language?.slice(0, 2).toLowerCase()
  return COPY[lang] ? lang : 'en'
}

export default function AdminSectionView({ section }: { section: AdminSectionConfig }) {
  const lang = useLang()
  const t = COPY[lang]

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
            <strong>{metric.value ?? t.notTracked}</strong>
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

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useI18n } from '@/components/i18n/I18nProvider'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'

const COPY: Record<Lang, {
  eyebrow: string
  title: string
  subtitle: string
  examplePipeline: string
  recentEvents: string
  noEvents: string
  time: string
  event: string
  status: string
  source: string
  statusUnknown: string
  sourceDefault: string
  sourceLive: string
  sourceDerived: string
}> = {
  en: {
    eyebrow: 'Owner/Admin Governance',
    title: 'COS governance telemetry',
    subtitle: 'Live where connected to COS campaign queue and decision logs. Any fallback or empty-state figures are marked as examples until telemetry is available.',
    examplePipeline: 'Example governance pipeline',
    recentEvents: 'Recent governance events',
    noEvents: 'No live governance events yet. Demo examples are intentionally not shown as live activity.',
    time: 'Time',
    event: 'Event',
    status: 'Status',
    source: 'Source',
    statusUnknown: 'unknown',
    sourceDefault: 'live/default mix',
    sourceLive: 'cos_decisions live log',
    sourceDerived: 'derived telemetry/example',
  },
  es: {
    eyebrow: 'Gobernanza Propietario/Admin',
    title: 'Telemetría de gobernanza COS',
    subtitle: 'En vivo cuando está conectado a la cola de campañas COS y los registros de decisiones. Las cifras de respaldo o estado vacío se marcan como ejemplos hasta que la telemetría esté disponible.',
    examplePipeline: 'Pipeline de gobernanza de ejemplo',
    recentEvents: 'Eventos de gobernanza recientes',
    noEvents: 'Aún no hay eventos de gobernanza en vivo. Los ejemplos de demostración no se muestran intencionalmente como actividad en vivo.',
    time: 'Hora',
    event: 'Evento',
    status: 'Estado',
    source: 'Fuente',
    statusUnknown: 'desconocido',
    sourceDefault: 'mezcla en vivo/predeterminada',
    sourceLive: 'registro en vivo cos_decisions',
    sourceDerived: 'telemetría derivada/ejemplo',
  },
  pt: {
    eyebrow: 'Governança Proprietário/Admin',
    title: 'Telemetria de governança COS',
    subtitle: 'Ao vivo quando conectado à fila de campanhas COS e aos registros de decisões. Quaisquer valores de fallback ou estado vazio são marcados como exemplos até que a telemetria esteja disponível.',
    examplePipeline: 'Pipeline de governança de exemplo',
    recentEvents: 'Eventos de governança recentes',
    noEvents: 'Ainda não há eventos de governança ao vivo. Exemplos de demonstração não são mostrados intencionalmente como atividade ao vivo.',
    time: 'Hora',
    event: 'Evento',
    status: 'Status',
    source: 'Fonte',
    statusUnknown: 'desconhecido',
    sourceDefault: 'mistura ao vivo/padrão',
    sourceLive: 'log ao vivo cos_decisions',
    sourceDerived: 'telemetria derivada/exemplo',
  },
  pl: {
    eyebrow: 'Zarządzanie Właściciel/Admin',
    title: 'Telemetria zarządzania COS',
    subtitle: 'Na żywo, gdy połączono z kolejką kampanii COS i dziennikami decyzji. Wszelkie wartości zastępcze lub stanu pustego są oznaczone jako przykłady do czasu udostępnienia telemetrii.',
    examplePipeline: 'Przykładowy potok zarządzania',
    recentEvents: 'Ostatnie zdarzenia zarządzania',
    noEvents: 'Brak aktywnych zdarzeń zarządzania. Przykłady demonstracyjne celowo nie są wyświetlane jako aktywność na żywo.',
    time: 'Czas',
    event: 'Zdarzenie',
    status: 'Status',
    source: 'Źródło',
    statusUnknown: 'nieznany',
    sourceDefault: 'mieszanka na żywo/domyślna',
    sourceLive: 'dziennik na żywo cos_decisions',
    sourceDerived: 'telemetria pochodna/przykład',
  },
  ru: {
    eyebrow: 'Управление Владелец/Администратор',
    title: 'Телеметрия управления COS',
    subtitle: 'В реальном времени при подключении к очереди кампаний COS и журналам решений. Любые резервные или пустые значения помечены как примеры до получения телеметрии.',
    examplePipeline: 'Пример конвейера управления',
    recentEvents: 'Последние события управления',
    noEvents: 'Живых событий управления пока нет. Демонстрационные примеры намеренно не отображаются как живая активность.',
    time: 'Время',
    event: 'Событие',
    status: 'Статус',
    source: 'Источник',
    statusUnknown: 'неизвестно',
    sourceDefault: 'живая/стандартная смесь',
    sourceLive: 'живой журнал cos_decisions',
    sourceDerived: 'производная телеметрия/пример',
  },
}

export default function Page() {
  const { lang } = useI18n()
  const c = COPY[(lang as Lang) || 'en'] || COPY.en
  const [data, setData] = useState<any>(null)

  useEffect(() => {
    let active = true
    fetch('/api/cos/governance-router', { cache: 'no-store' })
      .then(res => res.ok ? res.json() : null)
      .then(json => { if (active) setData(json) })
      .catch(() => { if (active) setData(null) })
    return () => { active = false }
  }, [])

  const pipelines = Array.isArray(data?.pipelines) ? data.pipelines : []
  const timeline = Array.isArray(data?.timeline) ? data.timeline.slice(0, 8) : []

  return (
    <div className="sb-cockpit-stack">
      <header className="sb-cockpit-hero">
        <span className="sb-eyebrow">{c.eyebrow}</span>
        <h2>{c.title}</h2>
        <p>{c.subtitle}</p>
      </header>
      <section className="sb-cockpit-grid" aria-label={c.recentEvents}>
        {pipelines.length ? pipelines.map((p: any) => (
          <article className="sb-neon-panel" key={p.id}>
            <p>{p.name}</p>
            <strong>{p.healthScore ?? '—'}%</strong>
            <span>Status: {p.status || c.statusUnknown} · Source: {p.telemetry?.source || c.sourceDefault}</span>
          </article>
        )) : (
          <article className="sb-neon-panel">
            <p>{c.examplePipeline}</p>
            <strong>Demo</strong>
            <span>{c.sourceDerived}</span>
          </article>
        )}
      </section>
      <section className="sb-orbit-table" aria-label={c.recentEvents}>
        <div className="sb-orbit-table__header">
          <h3>{c.recentEvents}</h3>
          <Link href="/admin/timeline">Open full timeline →</Link>
        </div>
        <table>
          <thead>
            <tr>
              <th>{c.time}</th>
              <th>{c.event}</th>
              <th>{c.status}</th>
              <th>{c.source}</th>
            </tr>
          </thead>
          <tbody>
            {timeline.length ? timeline.map((e: any) => (
              <tr key={e.id}>
                <td>{e.timestamp ? new Date(e.timestamp).toLocaleString() : '—'}</td>
                <td>{e.title}</td>
                <td>{e.status}</td>
                <td>{e.telemetry?.row ? c.sourceLive : c.sourceDerived}</td>
              </tr>
            )) : (
              <tr><td colSpan={4}>{c.noEvents}</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  )
}

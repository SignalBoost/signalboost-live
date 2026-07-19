'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useI18n } from '@/components/i18n/I18nProvider'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'

const COPY: Record<Lang, {
  eyebrow: string
  title: string
  subtitle: string
  tableTitle: string
  noEvents: string
  time: string
  type: string
  event: string
  status: string
  source: string
  sourceLive: string
  sourceDerived: string
  govLink: string
}> = {
  en: {
    eyebrow: 'Owner/Admin Timeline',
    title: 'Governance and operational timeline',
    subtitle: 'Events are loaded from COS decision logs and governance telemetry when available; derived/demo rows are labelled by source.',
    tableTitle: 'Timeline',
    noEvents: 'No live timeline events yet.',
    time: 'Time',
    type: 'Type',
    event: 'Event',
    status: 'Status',
    source: 'Source',
    sourceLive: 'cos_decisions live log',
    sourceDerived: 'derived telemetry/example',
    govLink: 'Governance dashboard →',
  },
  es: {
    eyebrow: 'Línea de tiempo Propietario/Admin',
    title: 'Línea de tiempo de gobernanza y operaciones',
    subtitle: 'Los eventos se cargan desde los registros de decisiones COS y la telemetría de gobernanza cuando están disponibles; las filas derivadas/demo están etiquetadas por fuente.',
    tableTitle: 'Línea de tiempo',
    noEvents: 'Aún no hay eventos de línea de tiempo en vivo.',
    time: 'Hora',
    type: 'Tipo',
    event: 'Evento',
    status: 'Estado',
    source: 'Fuente',
    sourceLive: 'registro en vivo cos_decisions',
    sourceDerived: 'telemetría derivada/ejemplo',
    govLink: 'Panel de gobernanza →',
  },
  pt: {
    eyebrow: 'Linha do tempo Proprietário/Admin',
    title: 'Linha do tempo de governança e operações',
    subtitle: 'Os eventos são carregados dos registros de decisões COS e da telemetria de governança quando disponíveis; as linhas derivadas/demo são rotuladas por fonte.',
    tableTitle: 'Linha do tempo',
    noEvents: 'Ainda não há eventos de linha do tempo ao vivo.',
    time: 'Hora',
    type: 'Tipo',
    event: 'Evento',
    status: 'Status',
    source: 'Fonte',
    sourceLive: 'log ao vivo cos_decisions',
    sourceDerived: 'telemetria derivada/exemplo',
    govLink: 'Painel de governança →',
  },
  pl: {
    eyebrow: 'Oś czasu Właściciel/Admin',
    title: 'Oś czasu zarządzania i operacji',
    subtitle: 'Zdarzenia są ładowane z dzienników decyzji COS i telemetrii zarządzania, gdy są dostępne; wiersze pochodne/demo są oznaczone źródłem.',
    tableTitle: 'Oś czasu',
    noEvents: 'Brak aktywnych zdarzeń na osi czasu.',
    time: 'Czas',
    type: 'Typ',
    event: 'Zdarzenie',
    status: 'Status',
    source: 'Źródło',
    sourceLive: 'dziennik na żywo cos_decisions',
    sourceDerived: 'telemetria pochodna/przykład',
    govLink: 'Panel zarządzania →',
  },
  ru: {
    eyebrow: 'Хронология Владелец/Администратор',
    title: 'Хронология управления и операций',
    subtitle: 'События загружаются из журналов решений COS и телеметрии управления при наличии; производные/демонстрационные строки помечены источником.',
    tableTitle: 'Хронология',
    noEvents: 'Живых событий хронологии пока нет.',
    time: 'Время',
    type: 'Тип',
    event: 'Событие',
    status: 'Статус',
    source: 'Источник',
    sourceLive: 'живой журнал cos_decisions',
    sourceDerived: 'производная телеметрия/пример',
    govLink: 'Панель управления →',
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

  const timeline = Array.isArray(data?.timeline) ? data.timeline : []

  return (
    <div className="sb-cockpit-stack">
      <header className="sb-cockpit-hero">
        <span className="sb-eyebrow">{c.eyebrow}</span>
        <h2>{c.title}</h2>
        <p>{c.subtitle}</p>
      </header>
      <section className="sb-orbit-table" aria-label={c.tableTitle}>
        <div className="sb-orbit-table__header">
          <h3>{c.tableTitle}</h3>
          <Link href="/admin/governance">{c.govLink}</Link>
        </div>
        <table>
          <thead>
            <tr>
              <th>{c.time}</th>
              <th>{c.type}</th>
              <th>{c.event}</th>
              <th>{c.status}</th>
              <th>{c.source}</th>
            </tr>
          </thead>
          <tbody>
            {timeline.length ? timeline.map((e: any) => (
              <tr key={e.id}>
                <td>{e.timestamp ? new Date(e.timestamp).toLocaleString() : '—'}</td>
                <td>{e.type}</td>
                <td>{e.title}</td>
                <td>{e.status}</td>
                <td>{e.telemetry?.row ? c.sourceLive : c.sourceDerived}</td>
              </tr>
            )) : (
              <tr><td colSpan={5}>{c.noEvents}</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  )
}

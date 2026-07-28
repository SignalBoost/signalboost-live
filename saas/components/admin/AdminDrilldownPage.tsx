import { LocalizedText } from '@/components/i18n/LocalizedText'
import Link from 'next/link'
import { uiText } from '@/lib/i18n/uiText'

type EventRow = { label: string; status: string; detail: string }

type Props = {
  title: string
  status: string
  timestamp?: string
  action: string
  events?: EventRow[]
  externalUrl?: string
  externalLabel?: string
}

export default function AdminDrilldownPage({ title, status, timestamp, action, events = [], externalUrl, externalLabel }: Props) {
  const checkedAt = timestamp ?? new Date().toISOString()
  const rows = events.length ? events : [
    { label: title, status, detail: uiText('generatedUi.u_398d01042b127196') },
  ]

  return (
    <div className="sb-cockpit-stack" role="region" aria-label={`${title} drill-down`}>
      <header className="sb-cockpit-hero">
        <span className="sb-eyebrow">{uiText('generatedUi.u_7d2e0881506b6483')}</span>
        <h2>{title}</h2>
        <p><LocalizedText fallback={uiText('generatedUi.u_b42613578508d093')} /><strong>{status}</strong></p>
        <p>{uiText('generatedUi.u_687d605a57800f2d')}<time dateTime={checkedAt}>{checkedAt}</time></p>
        <p>{uiText('generatedUi.u_71491e52821fca31')}{action}</p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 18 }}>
          <Link className="sb-service-pill" href="/admin/system">{uiText('generatedUi.u_1dd420666c8817ef')}</Link>
          {externalUrl ? (
            <a className="sb-service-pill" href={externalUrl} target="_blank" rel="noopener noreferrer">
              {externalLabel ?? uiText('generatedUi.u_1a04f28192af20d3')} →
            </a>
          ) : null}
        </div>
      </header>

      <section className="sb-orbit-table" aria-label={uiText('generatedUi.u_84cbcc59a755c54f')}>
        <div className="sb-orbit-table__header">
          <h3><LocalizedText fallback={uiText('generatedUi.u_84cbcc59a755c54f')} /></h3>
          <span>{checkedAt}</span>
        </div>
        <table>
          <thead><tr><th>{uiText('generatedUi.u_4e1f49a9c8ae8a15')}</th><th>{uiText('generatedUi.u_920e413c7d411b61')}</th><th>{uiText('generatedUi.u_45989de49fb7f66d')}</th></tr></thead>
          <tbody>
            {rows.map((event) => (
              <tr key={`${event.label}-${event.detail}`}>
                <td>{event.label}</td>
                <td>{event.status}</td>
                <td>{event.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}

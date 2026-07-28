import { LocalizedText } from '@/components/i18n/LocalizedText'
import Link from 'next/link'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


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
    { label: title, status, detail: uiCopy('u_43d40344c1666576') },
  ]

  return (
    <div className="sb-cockpit-stack" role="region" aria-label={`${title} drill-down`}>
      <header className="sb-cockpit-hero">
        <span className="sb-eyebrow">{uiCopy('u_8ed1dd280b35dddb')}</span>
        <h2>{title}</h2>
        <p><LocalizedText fallback={uiCopy('u_4ffee8ee6af5c252')} /><strong>{status}</strong></p>
        <p>{uiCopy('u_5212666d81c46ec3')}<time dateTime={checkedAt}>{checkedAt}</time></p>
        <p>{uiCopy('u_8adc03e1bd75a229')}{action}</p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 18 }}>
          <Link className="sb-service-pill" href="/admin/system">{uiCopy('u_eb06575878c90689')}</Link>
          {externalUrl ? (
            <a className="sb-service-pill" href={externalUrl} target="_blank" rel="noopener noreferrer">
              {externalLabel ?? uiCopy('u_ff09b9c9f30e6392')} →
            </a>
          ) : null}
        </div>
      </header>

      <section className="sb-orbit-table" aria-label={uiCopy('u_4cc3e45057da5406')}>
        <div className="sb-orbit-table__header">
          <h3><LocalizedText fallback={uiCopy('u_fbaaf344b210283e')} /></h3>
          <span>{checkedAt}</span>
        </div>
        <table>
          <thead><tr><th>{uiCopy('u_ed9311a577262aff')}</th><th>{uiCopy('u_2e8737f141c8fa5b')}</th><th>{uiCopy('u_dfeb5f6e94f69e9a')}</th></tr></thead>
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

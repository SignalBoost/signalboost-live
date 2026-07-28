import Link from 'next/link'
import { uiText } from '@/lib/i18n/uiText'

type Props = { params: Promise<{ drilldown?: string[] }> }

export default async function AdminDrilldownFallbackPage({ params }: Props) {
  const { drilldown = [] } = await params
  const path = `/admin/${drilldown.join('/')}`

  return (
    <div className="sb-cockpit-stack">
      <header className="sb-cockpit-hero">
        <span className="sb-eyebrow">{uiText('generatedUi.u_8f356c3f8ea695ae')}</span>
        <h2>{uiText('generatedUi.u_854907d60f0780a2')}</h2>
        <p>{uiText('generatedUi.u_2d921cdd79693599')}</p>
      </header>
      <section className="sb-glass-panel sb-admin-action-card" aria-label={uiText('generatedUi.u_9c12e1643c70fa1f')}>
        <h3>{path}</h3>
        <p>{uiText('generatedUi.u_4a2bc995ecd33008')}</p>
        <Link className="sb-admin-action-card__cue" href="/admin">{uiText('generatedUi.u_b99a6f6e1503c890')}</Link>
      </section>
    </div>
  )
}

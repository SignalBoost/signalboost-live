import Link from 'next/link'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


type Props = { params: Promise<{ drilldown?: string[] }> }

export default async function AdminDrilldownFallbackPage({ params }: Props) {
  const { drilldown = [] } = await params
  const path = `/admin/${drilldown.join('/')}`

  return (
    <div className="sb-cockpit-stack">
      <header className="sb-cockpit-hero">
        <span className="sb-eyebrow">{uiCopy('u_0fd669b925bf3f4c')}</span>
        <h2>{uiCopy('u_69ce2ebdf2eb71b7')}</h2>
        <p>{uiCopy('u_51be576b12329506')}</p>
      </header>
      <section className="sb-glass-panel sb-admin-action-card" aria-label={uiCopy('u_b60e9f7d3c5cb14a')}>
        <h3>{path}</h3>
        <p>{uiCopy('u_b5eb4408a4a11870')}</p>
        <Link className="sb-admin-action-card__cue" href="/admin">{uiCopy('u_b07f847e1deb2cce')}</Link>
      </section>
    </div>
  )
}

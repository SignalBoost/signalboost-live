import Link from 'next/link'

function titleFromSlug(slug: string[]): string {
  return slug.join(' / ').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function recommendedAction(slug: string[]): string {
  if (slug.includes('settings')) return 'Review the control, confirm owner intent, and save changes only when the operational impact is clear.'
  if (slug.includes('errors') || slug.includes('logs') || slug.includes('deployments')) return 'Investigate the latest records, resolve the root cause, and re-check system health.'
  if (slug.includes('billing') || slug.includes('revenue')) return 'Compare live platform records with the payment provider before making financial decisions.'
  return 'Review the latest related activity and use filters from the parent admin console to narrow the investigation.'
}

export default function AdminDrilldownPage({ params }: { params: { slug: string[] } }) {
  const slug = params.slug || []
  const title = titleFromSlug(slug)
  const isVercel = slug.join('/') === 'integrations/vercel'
  const isSupabase = slug.join('/') === 'integrations/supabase'
  const dashboardUrl = isVercel ? process.env.NEXT_PUBLIC_VERCEL_PROJECT_URL : isSupabase ? process.env.NEXT_PUBLIC_SUPABASE_DASHBOARD_URL : ''

  return (
    <main className="sb-cockpit-stack" aria-label={`${title} admin drill-down`}>
      <header className="sb-cockpit-hero">
        <span className="sb-eyebrow">Owner/Admin drill-down</span>
        <h2>{title}</h2>
        <p>Safe live destination for this admin console card. This page is protected by the shared /admin owner/admin layout.</p>
      </header>

      <section className="sb-mission-grid" aria-label="Current status and actions">
        <article className="sb-glass-panel">
          <h3>Current status</h3>
          <p><strong>Route</strong> · /admin/{slug.join('/')}</p>
          <p><strong>Data</strong> · No activity yet</p>
          <p>No secrets, private tokens, or service keys are exposed in this view.</p>
        </article>
        <article className="sb-glass-panel">
          <h3>Latest related rows/logs</h3>
          <p>No activity yet</p>
        </article>
        <article className="sb-glass-panel">
          <h3>Recommended owner/admin action</h3>
          <p>{recommendedAction(slug)}</p>
          <Link className="sb-button-secondary" href="/admin">Back to admin console</Link>
        </article>
      </section>

      {(isVercel || isSupabase) && (
        <section className="sb-glass-panel" aria-label="External dashboard">
          <h3>{isVercel ? 'Vercel deployment dashboard' : 'Supabase project dashboard'}</h3>
          {dashboardUrl ? (
            <a className="sb-button-secondary" href={dashboardUrl} target="_blank" rel="noopener noreferrer">
              {isVercel ? 'Open Vercel Dashboard' : 'Open Supabase Dashboard'}
            </a>
          ) : (
            <p>Set {isVercel ? 'NEXT_PUBLIC_VERCEL_PROJECT_URL' : 'NEXT_PUBLIC_SUPABASE_DASHBOARD_URL'} to enable the safe public dashboard shortcut.</p>
          )}
        </section>
      )}
    </main>
  )
}

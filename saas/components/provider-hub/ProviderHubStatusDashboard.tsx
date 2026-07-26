'use client'

import { useEffect, useState } from 'react'

type Connection = {
  schemaVersion: string
  tenantId: string
  environmentId: string
  connectionId: string
  providerId: string
  state: string
  authentication: {
    method: string
    configured: boolean
    maskedFields: Record<string, string>
  }
  updatedAt: string
}

type StatusSurface = {
  schemaVersion: string
  mode: 'self_service' | 'enterprise_admin'
  connection: Connection | null
  allowedActions: readonly string[]
  notices: readonly string[]
}

export default function ProviderHubStatusDashboard({ endpoint, title }: { endpoint: string; title: string }) {
  const [surface, setSurface] = useState<StatusSurface | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    fetch(endpoint, { method: 'GET', cache: 'no-store' })
      .then(async response => {
        const body = await response.json() as StatusSurface & { error?: string }
        if (!response.ok) throw new Error(body.error || 'Unable to load Provider Hub status.')
        if (active) setSurface(body)
      })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Unable to load Provider Hub status.') })
    return () => { active = false }
  }, [endpoint])

  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: '32px 20px' }}>
      <header style={{ marginBottom: 24 }}>
        <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase' }}>Provider Hub</p>
        <h1 style={{ margin: '8px 0' }}>{title}</h1>
        <p>This dashboard is read-only. It never reveals, copies, decrypts, or returns provider credentials.</p>
      </header>

      {error ? <section role="alert"><h2>Status unavailable</h2><p>{error}</p></section> : null}
      {!error && !surface ? <p>Loading connection status…</p> : null}

      {surface ? (
        <section aria-label="Provider connection status" style={{ display: 'grid', gap: 16 }}>
          <div style={{ border: '1px solid #d1d5db', borderRadius: 12, padding: 20 }}>
            <h2 style={{ marginTop: 0 }}>{surface.connection ? surface.connection.providerId : 'No provider configured'}</h2>
            {surface.connection ? (
              <dl style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, 1fr) 2fr', gap: 10 }}>
                <dt>Connection state</dt><dd>{surface.connection.state}</dd>
                <dt>Authentication</dt><dd>{surface.connection.authentication.method}</dd>
                <dt>Credentials configured</dt><dd>{surface.connection.authentication.configured ? 'Yes' : 'No'}</dd>
                <dt>Tenant</dt><dd>{surface.connection.tenantId}</dd>
                <dt>Environment</dt><dd>{surface.connection.environmentId}</dd>
                <dt>Connection ID</dt><dd>{surface.connection.connectionId}</dd>
                <dt>Updated</dt><dd>{new Date(surface.connection.updatedAt).toLocaleString()}</dd>
              </dl>
            ) : <p>No connection metadata is available for this authenticated scope.</p>}
          </div>

          {surface.connection && Object.keys(surface.connection.authentication.maskedFields).length > 0 ? (
            <div style={{ border: '1px solid #d1d5db', borderRadius: 12, padding: 20 }}>
              <h2 style={{ marginTop: 0 }}>Configured fields</h2>
              <ul>{Object.entries(surface.connection.authentication.maskedFields).map(([name, status]) => <li key={name}>{name}: {status}</li>)}</ul>
            </div>
          ) : null}

          <div style={{ border: '1px solid #d1d5db', borderRadius: 12, padding: 20 }}>
            <h2 style={{ marginTop: 0 }}>Available actions</h2>
            <ul>{surface.allowedActions.map(action => <li key={action}>{action.replaceAll('_', ' ')}</li>)}</ul>
            {surface.notices.length > 0 ? <><h3>Notices</h3><ul>{surface.notices.map(notice => <li key={notice}>{notice}</li>)}</ul></> : null}
          </div>
        </section>
      ) : null}
    </main>
  )
}

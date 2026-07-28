'use client'

import { LocalizedText } from '@/components/i18n/LocalizedText'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { uiText } from '@/lib/i18n/uiText'

export default function Page() {
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
        <span className="sb-eyebrow">{uiText('generatedUi.u_4a4f90cdd55b1818')}</span>
        <h2><LocalizedText fallback={uiText('generatedUi.u_6a604216762692da')} /></h2>
        <p><LocalizedText fallback={uiText('generatedUi.u_bf5039af1318a470')} /></p>
      </header>
      <section className="sb-cockpit-grid" aria-label={uiText('generatedUi.u_d250c928f914748b')}>
        {pipelines.length ? pipelines.map((p: any) => (
          <article className="sb-neon-panel" key={p.id}>
            <p>{p.name}</p>
            <strong>{p.healthScore ?? '—'}%</strong>
            <span>{uiText('generatedUi.u_755c8b2a9fb11446')}{p.status || uiText('generatedUi.u_b23a6a8439c0dde5')}{uiText('generatedUi.u_8a02cbb790af2752')}{p.telemetry?.source || uiText('generatedUi.u_e7dc620fc244e9ec')}</span>
          </article>
        )) : (
          <article className="sb-neon-panel"><p><LocalizedText fallback={uiText('generatedUi.u_b2b13c154ea1326b')} /></p><strong>{uiText('generatedUi.u_8a2cc0673b1c4283')}</strong><span><LocalizedText fallback={uiText('generatedUi.u_6d9c35974a43994d')} /></span></article>
        )}
      </section>
      <section className="sb-orbit-table" aria-label={uiText('generatedUi.u_d40fefe6d23ea7ab')}>
        <div className="sb-orbit-table__header"><h3><LocalizedText fallback={uiText('generatedUi.u_d135d412f577d750')} /></h3><Link href="/admin/timeline">{uiText('generatedUi.u_24683c0c01591e0d')}</Link></div>
        <table><thead><tr><th>{uiText('generatedUi.u_33b93476cf597a33')}</th><th>{uiText('generatedUi.u_4e1f49a9c8ae8a15')}</th><th>{uiText('generatedUi.u_920e413c7d411b61')}</th><th>{uiText('generatedUi.u_0e570ca6fabe24f9')}</th></tr></thead><tbody>
          {timeline.length ? timeline.map((e: any) => <tr key={e.id}><td>{e.timestamp ? new Date(e.timestamp).toLocaleString() : '—'}</td><td>{e.title}</td><td>{e.status}</td><td>{e.telemetry?.row ? uiText('generatedUi.u_523a3044e4ce5bf7') : uiText('generatedUi.u_cf32c067f5ad6f88')}</td></tr>) : <tr><td colSpan={4}><LocalizedText fallback={uiText('generatedUi.u_45e7efd899770b40')} /></td></tr>}
        </tbody></table>
      </section>
    </div>
  )
}

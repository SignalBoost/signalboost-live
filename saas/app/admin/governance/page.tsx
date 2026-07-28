'use client'

import { LocalizedText } from '@/components/i18n/LocalizedText'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


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
        <span className="sb-eyebrow">{uiCopy('u_77d2602007790878')}</span>
        <h2><LocalizedText fallback={uiCopy('u_5724e1d1c4fffba9')} /></h2>
        <p><LocalizedText fallback={uiCopy('u_56ca69f8e8a4bd9b')} /></p>
      </header>
      <section className="sb-cockpit-grid" aria-label={uiCopy('u_eb9e010716a4b819')}>
        {pipelines.length ? pipelines.map((p: any) => (
          <article className="sb-neon-panel" key={p.id}>
            <p>{p.name}</p>
            <strong>{p.healthScore ?? '—'}%</strong>
            <span>{uiCopy('u_278b7f3de2b05a0f')}{p.status || uiCopy('u_6be3461d008fa6de')}{uiCopy('u_28e1b35eaebf517a')}{p.telemetry?.source || uiCopy('u_4ca162e524ff924d')}</span>
          </article>
        )) : (
          <article className="sb-neon-panel"><p><LocalizedText fallback={uiCopy('u_d1cedafcbc3a68e6')} /></p><strong>{uiCopy('u_801f55fa73f2217d')}</strong><span><LocalizedText fallback={uiCopy('u_6fdb7a2423d1a4a1')} /></span></article>
        )}
      </section>
      <section className="sb-orbit-table" aria-label={uiCopy('u_8d54ee8fdca55f5c')}>
        <div className="sb-orbit-table__header"><h3><LocalizedText fallback={uiCopy('u_834c7a31c494d52d')} /></h3><Link href="/admin/timeline">{uiCopy('u_386616ec3a82dde2')}</Link></div>
        <table><thead><tr><th>{uiCopy('u_cf135fe25010ca9e')}</th><th>{uiCopy('u_ff0a911ef8dd1faa')}</th><th>{uiCopy('u_7d761eb666ce4523')}</th><th>{uiCopy('u_5e16cc66ae23706c')}</th></tr></thead><tbody>
          {timeline.length ? timeline.map((e: any) => <tr key={e.id}><td>{e.timestamp ? new Date(e.timestamp).toLocaleString() : '—'}</td><td>{e.title}</td><td>{e.status}</td><td>{e.telemetry?.row ? uiCopy('u_427b7d4b8034a6c8') : uiCopy('u_d1f672d01f81bb64')}</td></tr>) : <tr><td colSpan={4}><LocalizedText fallback={uiCopy('u_eb82536c8de0430a')} /></td></tr>}
        </tbody></table>
      </section>
    </div>
  )
}

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
  const timeline = Array.isArray(data?.timeline) ? data.timeline : []
  return (
    <div className="sb-cockpit-stack">
      <header className="sb-cockpit-hero">
        <span className="sb-eyebrow">{uiText('generatedUi.u_d3fe9257141273d0')}</span>
        <h2><LocalizedText fallback={uiText('generatedUi.u_34990ce62c806ff4')} /></h2>
        <p>{uiText('generatedUi.u_7069862280fecf33')}</p>
      </header>
      <section className="sb-orbit-table" aria-label={uiText('generatedUi.u_1e7abccbeb6fd6ac')}>
        <div className="sb-orbit-table__header"><h3>{uiText('generatedUi.u_9dcff98e275f0cb9')}</h3><Link href="/admin/governance">{uiText('generatedUi.u_d8fd196b40544633')}</Link></div>
        <table><thead><tr><th>{uiText('generatedUi.u_33b93476cf597a33')}</th><th>{uiText('generatedUi.u_baaddf70fb5d432b')}</th><th>{uiText('generatedUi.u_4e1f49a9c8ae8a15')}</th><th>{uiText('generatedUi.u_920e413c7d411b61')}</th><th>{uiText('generatedUi.u_0e570ca6fabe24f9')}</th></tr></thead><tbody>
          {timeline.length ? timeline.map((e: any) => <tr key={e.id}><td>{e.timestamp ? new Date(e.timestamp).toLocaleString() : '—'}</td><td>{e.type}</td><td>{e.title}</td><td>{e.status}</td><td>{e.telemetry?.row ? uiText('generatedUi.u_523a3044e4ce5bf7') : uiText('generatedUi.u_cf32c067f5ad6f88')}</td></tr>) : <tr><td colSpan={5}><LocalizedText fallback={uiText('generatedUi.u_509efbbb4280695a')} /></td></tr>}
        </tbody></table>
      </section>
    </div>
  )
}

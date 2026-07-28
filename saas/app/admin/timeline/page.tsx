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
  const timeline = Array.isArray(data?.timeline) ? data.timeline : []
  return (
    <div className="sb-cockpit-stack">
      <header className="sb-cockpit-hero">
        <span className="sb-eyebrow">{uiCopy('u_668fb6153753f14a')}</span>
        <h2><LocalizedText fallback={uiCopy('u_66e75f6e12121142')} /></h2>
        <p>{uiCopy('u_3d692848bfb5cd90')}</p>
      </header>
      <section className="sb-orbit-table" aria-label={uiCopy('u_c5a97305fc46fd19')}>
        <div className="sb-orbit-table__header"><h3>{uiCopy('u_1f6016462ac93677')}</h3><Link href="/admin/governance">{uiCopy('u_664bf87b45e33248')}</Link></div>
        <table><thead><tr><th>{uiCopy('u_a7692a04e7246d9b')}</th><th>{uiCopy('u_0bbec8bf9b9b66bb')}</th><th>{uiCopy('u_f9e192928d661e4e')}</th><th>{uiCopy('u_97818750b7abc9f1')}</th><th>{uiCopy('u_6f6ebaa411ed1ced')}</th></tr></thead><tbody>
          {timeline.length ? timeline.map((e: any) => <tr key={e.id}><td>{e.timestamp ? new Date(e.timestamp).toLocaleString() : '—'}</td><td>{e.type}</td><td>{e.title}</td><td>{e.status}</td><td>{e.telemetry?.row ? uiCopy('u_e91c24eefc304f46') : uiCopy('u_509292e9c77d3a2c')}</td></tr>) : <tr><td colSpan={5}><LocalizedText fallback={uiCopy('u_e745872d2610dd42')} /></td></tr>}
        </tbody></table>
      </section>
    </div>
  )
}

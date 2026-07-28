// saas/components/enterprise/EnterpriseLaunchpadPath.tsx
'use client'

import { LocalizedText } from '@/components/i18n/LocalizedText'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { EnterpriseLaunchpadConfigurator, type LaunchpadApprovalPackage, type LaunchpadWorkspace } from './EnterpriseLaunchpadConfigurator.tsx'
import { uiText } from '@/lib/i18n/uiText'

type Step = { label: string; description: string; href: string }
type Props = { workspace: LaunchpadWorkspace; badge: string; title: string; subtitle: string; steps: Step[] }

export function EnterpriseLaunchpadPath({ workspace, badge, title, subtitle, steps }: Props) {
  const approvalKey = `launchpad:${workspace}:approval`
  const doneKey = `launchpad:${workspace}:done`
  const [approval, setApproval] = useState<LaunchpadApprovalPackage | null>(null)
  const [done, setDone] = useState<boolean[]>(() => steps.map(() => false))

  useEffect(() => {
    try {
      const savedApproval = localStorage.getItem(approvalKey)
      const savedDone = localStorage.getItem(doneKey)
      if (savedApproval) setApproval(JSON.parse(savedApproval))
      if (savedDone) setDone(JSON.parse(savedDone))
    } catch {}
  }, [approvalKey, doneKey])

  function approve(value: LaunchpadApprovalPackage) {
    setApproval(value)
    try { localStorage.setItem(approvalKey, JSON.stringify(value)) } catch {}
  }

  function toggle(index: number) {
    setDone((current) => {
      const next = current.map((value, itemIndex) => itemIndex === index ? !value : value)
      try { localStorage.setItem(doneKey, JSON.stringify(next)) } catch {}
      return next
    })
  }

  const completed = done.filter(Boolean).length
  return <main style={{ maxWidth: 920, margin: '0 auto', display: 'grid', gap: 16 }}>
    <Link href="/dashboard/launchpad" style={{ color: 'rgba(255,255,255,.55)', textDecoration: 'none', fontSize: 13 }}>{uiText('generatedUi.u_ca0d8beff2775837')}</Link>
    <header className="sb-console" style={{ margin: 0 }}>
      <span className="sb-eyebrow">{badge}</span>
      <h1 style={{ margin: '6px 0', fontSize: 24 }}>{title}</h1>
      <p style={{ margin: 0, color: 'rgba(255,255,255,.62)' }}>{subtitle}</p>
    </header>
    <EnterpriseLaunchpadConfigurator workspace={workspace} onApprove={approve} />
    {approval && <section aria-live="polite" style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20 }}><LocalizedText fallback={uiText('generatedUi.u_735fb6861e5e6b40')} /></h2>
          <p style={{ margin: '4px 0 0', color: 'rgba(255,255,255,.55)', fontSize: 13 }}>{approval.organization} · {approval.industry}</p>
        </div>
        <strong style={{ color: '#ffc300' }}>{completed}/{steps.length}{uiText('generatedUi.u_eebbf6457e46a7f6')}</strong>
      </div>
      {steps.map((step, index) => <article key={step.href} style={{ display: 'grid', gridTemplateColumns: '34px minmax(0,1fr) auto', gap: 12, alignItems: 'center', padding: 12, border: '1px solid rgba(255,255,255,.09)', borderRadius: 14 }}>
        <button type="button" onClick={() => toggle(index)} aria-label={`${done[index] ? 'Mark incomplete' : 'Mark complete'}: ${step.label}`} style={{ width: 30, height: 30, borderRadius: 999, border: done[index] ? '1px solid #86efac' : '1px solid rgba(255,255,255,.3)', background: done[index] ? '#86efac' : 'transparent', color: done[index] ? '#05210f' : '#fff', fontWeight: 900 }}>{done[index] ? '✓' : index + 1}</button>
        <div><strong style={{ display: 'block', color: done[index] ? '#86efac' : '#fff' }}>{step.label}</strong><span style={{ color: 'rgba(255,255,255,.55)', fontSize: 13 }}>{step.description}</span></div>
        <Link href={`${step.href}?source=${encodeURIComponent(approval.sourceUrl)}`} style={{ padding: '9px 13px', borderRadius: 10, background: '#ffc300', color: '#1a1300', fontWeight: 900, textDecoration: 'none', whiteSpace: 'nowrap' }}>{uiText('generatedUi.u_1d2902ca81b6d2db')}</Link>
      </article>)}
    </section>}
  </main>
}

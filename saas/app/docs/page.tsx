'use client'

import { useState } from 'react'
import Link from 'next/link'

const sections = [
  ['Start here', ['Create an account', 'Open the dashboard', 'Let AI suggest your first action']],
  ['Build', ['Generate a website', 'Choose a tone', 'Preview before publishing']],
  ['Grow', ['Collect reviews', 'Create audio and video', 'Run outreach through approvals']],
  ['Operate', ['Track metrics', 'Manage credits', 'Use admin controls safely']],
]

export default function DocsPage() {
  const [query, setQuery] = useState('')
  const filtered = sections.map(([title, items]) => [title, (items as string[]).filter(item => item.toLowerCase().includes(query.toLowerCase()) || (title as string).toLowerCase().includes(query.toLowerCase()))] as const).filter(([, items]) => items.length || !query)

  return (
    <main className="sb-page">
      <section className="sb-glass sb-stack" style={{ padding: 32 }}>
        <p className="sb-eyebrow">Docs</p>
        <h1 className="sb-h1">Find the next step fast.</h1>
        <p className="sb-body">Docs are grouped by human intent: start, build, grow, and operate. Scan the structure, then jump directly into the workspace.</p>
        <input className="sb-input" style={{ borderRadius: 999, padding: '14px 18px', maxWidth: 640 }} placeholder="Ask: how do I launch my first campaign?" value={query} onChange={e => setQuery(e.target.value)} />
      </section>

      <section className="sb-grid-4 sb-section-tight" aria-label="Docs quick navigation">
        {sections.map(([title]) => <a key={title as string} href={`#${String(title).toLowerCase().replaceAll(' ', '-')}`} className="sb-chip" style={{ textDecoration: 'none', justifyContent: 'center' }}>{title as string}</a>)}
      </section>

      <section className="sb-grid-2 sb-section">
        {filtered.map(([title, items]) => (
          <article id={String(title).toLowerCase().replaceAll(' ', '-')} key={title as string} className="sb-glass-soft sb-stack" style={{ padding: 24 }}>
            <p className="sb-eyebrow">{title as string}</p>
            {(items.length ? items : (sections.find(([sourceTitle]) => sourceTitle === title)?.[1] as string[])).map(item => (
              <div className="sb-glass-soft" style={{ padding: 16 }} key={item}>
                <h2 className="sb-h3">{item}</h2>
                <p className="sb-body" style={{ fontSize: 14, marginTop: 8 }}>SignalBoost will guide this step with suggestions, tone presets, and a preview before you commit.</p>
              </div>
            ))}
          </article>
        ))}
      </section>

      <section className="sb-section sb-glass sb-grid-2" style={{ padding: 28, alignItems: 'center' }}>
        <p className="sb-ai-prompt">“Start with a clear homepage, add proof, then approve one outreach campaign.”</p>
        <div className="sb-row" style={{ justifyContent: 'flex-end' }}>
          <Link className="sb-button sb-button-primary" href="/dashboard">Open dashboard</Link>
          <Link className="sb-button sb-button-secondary" href="/pricing">Compare plans</Link>
        </div>
      </section>
    </main>
  )
}

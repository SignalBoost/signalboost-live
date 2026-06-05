'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

const GOLD = '#ffc300'
const STORAGE_IDEA = 'launchpad:store:idea'
const STORAGE_DONE = 'launchpad:store:done'

const STEPS = [
  { label: 'Build your storefront site', desc: 'Publish a site that shows your products and brand.', href: '/dashboard/builder' },
  { label: 'Create product videos', desc: 'Produce short videos that show products in action.', href: '/dashboard/video' },
  { label: 'Collect product reviews', desc: 'Gather customer trust and reuse it in marketing.', href: '/dashboard/reviews' },
  { label: 'Launch marketing campaigns', desc: 'Generate localized promos and outreach for your store.', href: '/dashboard/promote' },
  { label: 'Track sales signals', desc: 'Monitor what works and where to focus next.', href: '/dashboard/metrics' },
]

export default function StoreLaunchpadPage() {
  const [experience, setExperience] = useState('guided')
  const [idea, setIdea] = useState('')
  const [done, setDone] = useState<boolean[]>(() => STEPS.map(() => false))

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setExperience(params.get('experience') || 'guided')
    try {
      setIdea(localStorage.getItem(STORAGE_IDEA) || '')
      const saved = localStorage.getItem(STORAGE_DONE)
      if (saved) setDone(JSON.parse(saved))
    } catch {}
  }, [])

  function saveIdea(value: string) {
    setIdea(value)
    try { localStorage.setItem(STORAGE_IDEA, value) } catch {}
  }

  function toggle(i: number) {
    setDone(prev => {
      const next = prev.map((v, idx) => (idx === i ? !v : v))
      try { localStorage.setItem(STORAGE_DONE, JSON.stringify(next)) } catch {}
      return next
    })
  }

  const completed = done.filter(Boolean).length

  return (
    <main style={{ minHeight: '100vh', padding: '40px 24px 80px', background: 'radial-gradient(circle at top left, rgba(255,195,0,.15), transparent 30%),linear-gradient(180deg,#050505,#0f1117)', color: '#fff' }}>
      <div style={{ maxWidth: 880, margin: '0 auto' }}>
        <Link href="/dashboard/launchpad" style={{ color: 'rgba(255,255,255,.5)', fontSize: 13, textDecoration: 'none' }}>← Back to Launchpad</Link>

        <div style={{ display: 'inline-flex', marginTop: 16, padding: '5px 12px', borderRadius: 999, background: 'rgba(255,195,0,.1)', border: '1px solid rgba(255,195,0,.2)', color: GOLD, fontWeight: 800, fontSize: 12 }}>
          🛒 STORE · {experience.toUpperCase()}
        </div>

        <h1 style={{ fontSize: 'clamp(32px,6vw,56px)', lineHeight: 1.05, margin: '18px 0 10px', letterSpacing: '-.04em' }}>
          Launch your online store, <span style={{ color: GOLD }}>step by step</span>
        </h1>
        <p style={{ color: 'rgba(255,255,255,.55)', lineHeight: 1.7, maxWidth: 640 }}>
          Sell online with a site, videos, reviews, and marketing. Describe what you sell, then work the steps.
        </p>

        <section style={{ marginTop: 28 }}>
          <label htmlFor="idea" style={{ display: 'block', fontWeight: 800, marginBottom: 8 }}>What do you want to sell?</label>
          <textarea
            id="idea"
            value={idea}
            onChange={e => saveIdea(e.target.value)}
            rows={3}
            placeholder="e.g. Handmade ceramics shipped across Europe."
            style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 14, padding: 14, color: '#fff', resize: 'vertical' }}
          />
        </section>

        <section style={{ marginTop: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
            <h2 style={{ margin: 0 }}>Your launch path</h2>
            <span style={{ color: GOLD, fontWeight: 800, fontSize: 13 }}>{completed}/{STEPS.length} done</span>
          </div>

          <div style={{ display: 'grid', gap: 14 }}>
            {STEPS.map((step, i) => (
              <article key={step.label} style={{ display: 'grid', gridTemplateColumns: '40px minmax(0,1fr) auto', gap: 14, alignItems: 'center', padding: 18, borderRadius: 20, background: done[i] ? 'rgba(134,239,172,.06)' : 'rgba(255,255,255,.03)', border: done[i] ? '1px solid rgba(134,239,172,.35)' : '1px solid rgba(255,255,255,.08)' }}>
                <button onClick={() => toggle(i)} aria-label="Toggle step complete" style={{ cursor: 'pointer', width: 32, height: 32, borderRadius: 999, border: done[i] ? '1px solid #86efac' : '1px solid rgba(255,255,255,.3)', background: done[i] ? '#86efac' : 'transparent', color: '#05210f', fontWeight: 900 }}>
                  {done[i] ? '✓' : i + 1}
                </button>
                <div style={{ minWidth: 0 }}>
                  <strong style={{ display: 'block' }}>{step.label}</strong>
                  <span style={{ color: 'rgba(255,255,255,.55)', fontSize: 14 }}>{step.desc}</span>
                </div>
                <Link href={step.href} style={{ whiteSpace: 'nowrap', padding: '10px 16px', borderRadius: 12, background: GOLD, color: '#1a1300', fontWeight: 800, textDecoration: 'none' }}>Open →</Link>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}

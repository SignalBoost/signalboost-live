'use client'

// saas/components/hub/ConsoleShell.tsx
// Hub Console — the horizontal multi-page shell ("sliding monitors").
// Owns: navigation (arrows, indicators, quick-jump), header chrome,
// language, and the single live data fetch shared by all pages.
// Adding a future page = one entry in the PAGES registry.

import { useCallback, useEffect, useState } from 'react'
import { Lang, LANGS, HubData, c, labelStyle, Dot } from './shared'
import DashboardPage from './pages/DashboardPage'
import KeyVaultPage from './pages/KeyVaultPage'

const PAGES = [
  { key: 'dashboard', icon: '🛰️', titleKey: 'pageDashboard', Component: DashboardPage },
  { key: 'vault',     icon: '🔐', titleKey: 'pageVault',     Component: KeyVaultPage },
] as const

export default function ConsoleShell() {
  const [lang, setLang] = useState<Lang>('en')
  const [idx, setIdx] = useState(0)
  const [data, setData] = useState<HubData | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setFailed(false)
    try {
      const res = await fetch('/api/hub/status?t=' + Date.now(), {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      })
      if (!res.ok) throw new Error(String(res.status))
      setData(await res.json())
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Bookmarkable pages via URL hash (#vault), plus keyboard arrows.
  useEffect(() => {
    const fromHash = () => {
      const h = window.location.hash.replace('#', '')
      const i = PAGES.findIndex(p => p.key === h)
      if (i >= 0) setIdx(i)
    }
    fromHash()
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      if (e.key === 'ArrowRight') setIdx(i => Math.min(i + 1, PAGES.length - 1))
      if (e.key === 'ArrowLeft') setIdx(i => Math.max(i - 1, 0))
    }
    window.addEventListener('hashchange', fromHash)
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('hashchange', fromHash); window.removeEventListener('keydown', onKey) }
  }, [])

  const go = (i: number) => {
    const next = Math.max(0, Math.min(i, PAGES.length - 1))
    setIdx(next)
    window.history.replaceState(null, '', '#' + PAGES[next].key)
  }

  const supaOk = !!data?.supabase.ok
  const stripeOk = !!data?.stripe.ok
  const vercelConfigured = !!data?.vercel.configured
  const vercelOk = !!data?.vercel.ok

  return (
    <div
      className="hub-root"
      onClickCapture={(event) => {
        const button = (event.target as HTMLElement).closest('button')
        const title = button?.getAttribute('title') || ''
        if (title.startsWith('↻')) window.setTimeout(() => { void load() }, 0)
      }}
      style={{ minHeight: '100vh', background: 'radial-gradient(1100px 500px at 80% -10%, rgba(26,240,255,.10), transparent 60%), radial-gradient(900px 480px at 0% 110%, rgba(255,195,0,.07), transparent 55%), linear-gradient(180deg, #0b1220 0%, #030712 100%)', color: '#fff', padding: '18px clamp(14px, 1.6vw, 34px) 14px', fontFamily: 'Inter, system-ui, -apple-system, sans-serif', overflow: 'hidden' }}
    >
      <style>{`.hub-card{transition:transform .18s ease, border-color .18s ease, box-shadow .18s ease;} .hub-card:hover{transform:translateY(-3px); box-shadow:0 24px 60px rgba(0,0,0,.55);} .hub-chip{transition:background .15s ease, color .15s ease, border-color .15s ease; cursor:pointer;} .hub-chip:hover{border-color:rgba(255,195,0,.6);} .hub-btn{transition:filter .15s ease, transform .12s ease; cursor:pointer;} .hub-btn:hover{transform:translateY(-1px); filter:brightness(1.25);} .hub-panel::-webkit-scrollbar{width:8px;} .hub-panel::-webkit-scrollbar-thumb{background:rgba(255,255,255,.14);border-radius:8px;} .hub-panel::-webkit-scrollbar-track{background:transparent;} @keyframes hubPulse{0%,100%{opacity:.45}50%{opacity:1}} .hub-loading{animation:hubPulse 1.4s ease infinite;} .hub-arrow{position:absolute;top:50%;transform:translateY(-50%);z-index:20;width:38px;height:64px;display:flex;align-items:center;justify-content:center;font-size:20px;color:rgba(255,255,255,.55);background:rgba(15,23,42,.6);border:1px solid rgba(255,255,255,.12);cursor:pointer;backdrop-filter:blur(8px);transition:color .15s ease, background .15s ease;} .hub-arrow:hover{color:#1af0ff;background:rgba(15,23,42,.85);} @media (min-width:1100px){ .hub-root{height:calc(100vh - 80px);min-height:0;} .hub-frame{display:flex;flex-direction:column;height:100%;min-height:0;} .hub-stage{flex:1;min-height:0;} .hub-main{grid-auto-rows:minmax(0,1fr);} .hub-panel{overflow-y:auto;min-height:0;} }`}</style>

      <div className="hub-frame" style={{ width: '100%' }}>
        {/* Shell header */}
        <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 14, marginBottom: 12, flexShrink: 0 }}>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 'clamp(22px, 2.6vw, 30px)', fontWeight: 800, letterSpacing: '-.02em', background: 'linear-gradient(90deg, #fff 30%, #1af0ff 75%, #ffc300 100%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>{c('title', lang)}</h1>
            <p style={{ margin: '3px 0 0', fontSize: 13, color: 'rgba(255,255,255,.55)' }}><span style={{ color: '#1af0ff' }}>{c('phaseBadge', lang)}</span></p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {/* Quick-jump */}
            <nav style={{ display: 'flex', gap: 6 }}>
              {PAGES.map((p, i) => (
                <button key={p.key} onClick={() => go(i)} className="hub-chip" style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 13px', borderRadius: 10, fontSize: 12.5, fontWeight: 700, background: idx === i ? 'rgba(255,195,0,.12)' : 'rgba(255,255,255,.04)', border: idx === i ? '1px solid rgba(255,195,0,.5)' : '1px solid rgba(255,255,255,.12)', color: idx === i ? '#ffc300' : 'rgba(255,255,255,.65)' }}>{p.icon} {c(p.titleKey, lang)}</button>
              ))}
            </nav>
            <div style={{ display: 'flex', gap: 6 }}>
              {LANGS.map(l => (
                <button key={l} onClick={() => setLang(l)} className="hub-chip" style={{ padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, textTransform: 'uppercase', background: lang === l ? 'rgba(26,240,255,.16)' : 'rgba(255,255,255,.04)', border: lang === l ? '1px solid rgba(26,240,255,.5)' : '1px solid rgba(255,255,255,.12)', color: lang === l ? '#1af0ff' : 'rgba(255,255,255,.6)' }}>{l}</button>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '8px 14px', borderRadius: 12, border: '1px solid rgba(255,255,255,.1)', background: 'rgba(255,255,255,.04)' }}>
              <span style={labelStyle}>{c('systemHealth', lang)}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}><Dot tone={loading ? 'yellow' : supaOk ? 'green' : 'red'} /> Supabase</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}><Dot tone={loading ? 'yellow' : stripeOk ? 'green' : 'red'} /> Stripe</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}><Dot tone={loading ? 'yellow' : !vercelConfigured ? 'yellow' : vercelOk ? 'green' : 'red'} /> Vercel</span>
            </div>
            <button onClick={load} className="hub-btn" style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid rgba(26,240,255,.4)', background: 'rgba(26,240,255,.1)', color: '#1af0ff', fontSize: 12.5, fontWeight: 700 }}>{loading ? '…' : '↻ ' + c('refresh', lang)}</button>
          </div>
        </header>

        {/* Sliding stage */}
        <div className="hub-stage" style={{ position: 'relative', overflow: 'hidden', flex: 1, minHeight: 0 }}>
          {idx > 0 && <button onClick={() => go(idx - 1)} className="hub-arrow" style={{ left: 0, borderRadius: '0 12px 12px 0', borderLeft: 'none' }}>‹</button>}
          {idx < PAGES.length - 1 && <button onClick={() => go(idx + 1)} className="hub-arrow" style={{ right: 0, borderRadius: '12px 0 0 12px', borderRight: 'none' }}>›</button>}
          <div style={{ display: 'flex', width: `${PAGES.length * 100}%`, height: '100%', transform: `translateX(-${idx * (100 / PAGES.length)}%)`, transition: 'transform .45s cubic-bezier(.22,.8,.3,1)' }}>
            {PAGES.map(p => (
              <div key={p.key} style={{ width: `${100 / PAGES.length}%`, height: '100%', minHeight: 0, padding: '2px 2px 0', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <p.Component lang={lang} data={data} loading={loading} failed={failed} />
              </div>
            ))}
          </div>
        </div>

        {/* Page indicators */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, paddingTop: 10, flexShrink: 0 }}>
          {PAGES.map((p, i) => (
            <button key={p.key} onClick={() => go(i)} aria-label={c(p.titleKey, lang)} style={{ width: idx === i ? 22 : 8, height: 8, borderRadius: 999, border: 'none', cursor: 'pointer', background: idx === i ? '#ffc300' : 'rgba(255,255,255,.22)', transition: 'all .25s ease' }} />
          ))}
        </div>
      </div>
    </div>
  )
}

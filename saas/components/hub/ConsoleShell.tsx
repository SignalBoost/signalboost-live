'use client'

// saas/components/hub/ConsoleShell.tsx
// Hub Console — direct workspace navigation for Dashboard, Vault, and Providers.

import { useCallback, useEffect, useState } from 'react'
import { Lang, LANGS, HubData, c, labelStyle, Dot } from './shared'
import DashboardPage from './pages/DashboardPage'
import ProviderExpansionPage from './pages/ProviderExpansionPage'

const PAGES = [
  { key: 'dashboard', icon: '🛰️', title: 'Dashboard', Component: DashboardPage },
  { key: 'providers', icon: '🧭', title: 'Providers', Component: ProviderExpansionPage },
] as const

type PageKey = typeof PAGES[number]['key']

function isRefreshButton(button: HTMLButtonElement | null): boolean {
  if (!button) return false
  const text = button.textContent || ''
  const title = button.getAttribute('title') || ''
  const haystack = `${text} ${title}`.toLowerCase()

  return (
    haystack.includes('refresh') ||
    haystack.includes('updated') ||
    haystack.includes('actualizar') ||
    haystack.includes('atualizar') ||
    haystack.includes('odśwież') ||
    haystack.includes('обновить') ||
    haystack.includes('↻')
  )
}

function navigateToFreshHub() {
  const nextUrl = new URL(window.location.href)
  nextUrl.searchParams.set('refresh', String(Date.now()))
  window.location.assign(nextUrl.toString())
}

export default function ConsoleShell({ initialPage = 'dashboard' }: { initialPage?: PageKey }) {
  const initialIdx = Math.max(0, PAGES.findIndex(p => p.key === initialPage))
  const [lang, setLang] = useState<Lang>('en')
  const [idx, setIdx] = useState(initialIdx)
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

  useEffect(() => {
    const onRefresh = () => { void load() }
    window.addEventListener('signalboost:hub-refresh', onRefresh)
    return () => window.removeEventListener('signalboost:hub-refresh', onRefresh)
  }, [load])

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

  const navButtonStyle = (active: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    padding: '7px 13px',
    borderRadius: 10,
    fontSize: 12.5,
    fontWeight: 700,
    background: active ? 'rgba(255,195,0,.12)' : 'rgba(255,255,255,.04)',
    border: active ? '1px solid rgba(255,195,0,.5)' : '1px solid rgba(255,255,255,.12)',
    color: active ? '#ffc300' : 'rgba(255,255,255,.65)',
    textDecoration: 'none',
  })

  return (
    <div
      className="hub-root"
      onClickCapture={(event) => {
        const button = (event.target as HTMLElement).closest('button')
        if (isRefreshButton(button)) {
          window.setTimeout(() => { void load() }, 0)
          window.setTimeout(navigateToFreshHub, 250)
        }
      }}
      style={{ minHeight: '100vh', background: 'radial-gradient(1100px 500px at 80% -10%, rgba(26,240,255,.10), transparent 60%), radial-gradient(900px 480px at 0% 110%, rgba(255,195,0,.07), transparent 55%), linear-gradient(180deg, #0b1220 0%, #030712 100%)', color: '#fff', padding: '18px clamp(14px, 1.6vw, 34px) 14px', fontFamily: 'Inter, system-ui, -apple-system, sans-serif', overflow: 'hidden' }}
    >
      <style>{`.hub-card{transition:transform .18s ease, border-color .18s ease, box-shadow .18s ease;} .hub-card:hover{transform:translateY(-3px); box-shadow:0 24px 60px rgba(0,0,0,.55);} .hub-chip{transition:background .15s ease, color .15s ease, border-color .15s ease; cursor:pointer;} .hub-chip:hover{border-color:rgba(255,195,0,.6);} .hub-btn{transition:filter .15s ease, transform .12s ease; cursor:pointer;} .hub-btn:hover{transform:translateY(-1px); filter:brightness(1.25);} .hub-panel::-webkit-scrollbar{width:8px;} .hub-panel::-webkit-scrollbar-thumb{background:rgba(255,255,255,.14);border-radius:8px;} .hub-panel::-webkit-scrollbar-track{background:transparent;} @keyframes hubPulse{0%,100%{opacity:.45}50%{opacity:1}} .hub-loading{animation:hubPulse 1.4s ease infinite;} @media (min-width:1100px){ .hub-root{height:calc(100vh - 80px);min-height:0;} .hub-frame{display:flex;flex-direction:column;height:100%;min-height:0;} .hub-stage{flex:1;min-height:0;} .hub-main{grid-auto-rows:minmax(0,1fr);} .hub-panel{overflow-y:auto;min-height:0;} }`}</style>

      <div className="hub-frame" style={{ width: '100%' }}>
        <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 14, marginBottom: 12, flexShrink: 0 }}>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 'clamp(22px, 2.6vw, 30px)', fontWeight: 800, letterSpacing: '-.02em', background: 'linear-gradient(90deg, #fff 30%, #1af0ff 75%, #ffc300 100%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>{c('title', lang)}</h1>
            <p style={{ margin: '3px 0 0', fontSize: 13, color: 'rgba(255,255,255,.55)' }}><span style={{ color: '#1af0ff' }}>{c('phaseBadge', lang)}</span></p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <nav style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button onClick={() => go(0)} className="hub-chip" style={navButtonStyle(idx === 0)}>🛰️ Dashboard</button>
              <a href="/hub/vault" className="hub-chip" style={navButtonStyle(false)}>🔐 Vault</a>
              <button onClick={() => go(1)} className="hub-chip" style={navButtonStyle(idx === 1)}>🧭 Providers</button>
            </nav>
            <div style={{ display: 'flex', gap: 6 }}>
              {LANGS.map(l => (
                <button key={l} onClick={() => setLang(l)} className="hub-chip" style={{ padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, textTransform: 'uppercase', background: lang === l ? 'rgba(26,240,255,.16)' : 'rgba(255,255,255,.04)', border: lang === l ? '1px solid rgba(26,240,255,.5)' : '1px solid rgba(255,255,255,.12)', color: lang === l ? '#1af0ff' : 'rgba(255,255,255,.6)' }}>{l}</button>
              ))}
            </div>
            {idx === 0 && <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '8px 14px', borderRadius: 12, border: '1px solid rgba(255,255,255,.1)', background: 'rgba(255,255,255,.04)' }}>
              <span style={labelStyle}>{c('systemHealth', lang)}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}><Dot tone={loading ? 'yellow' : supaOk ? 'green' : 'red'} /> Supabase</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}><Dot tone={loading ? 'yellow' : stripeOk ? 'green' : 'red'} /> Stripe</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}><Dot tone={loading ? 'yellow' : !vercelConfigured ? 'yellow' : vercelOk ? 'green' : 'red'} /> Vercel</span>
            </div>}
            <button onClick={load} className="hub-btn" style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid rgba(26,240,255,.4)', background: 'rgba(26,240,255,.1)', color: '#1af0ff', fontSize: 12.5, fontWeight: 700 }}>{loading ? '…' : '↻ ' + c('refresh', lang)}</button>
          </div>
        </header>

        <div className="hub-stage" style={{ position: 'relative', overflow: 'hidden', flex: 1, minHeight: 0 }}>
          <div style={{ display: 'flex', width: `${PAGES.length * 100}%`, height: '100%', transform: `translateX(-${idx * (100 / PAGES.length)}%)`, transition: 'transform .45s cubic-bezier(.22,.8,.3,1)' }}>
            {PAGES.map(p => (
              <div key={p.key} style={{ width: `${100 / PAGES.length}%`, height: '100%', minHeight: 0, padding: '2px 2px 0', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <p.Component lang={lang} data={data} loading={loading} failed={failed} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

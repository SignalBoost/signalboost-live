'use client'

// saas/app/hub/vault/page.tsx
// Standalone route for Vault / My Safe.
// Tall vertical workspace: the Vault reads like a long secure feed rather than
// a compressed monitor panel.

import { useCallback, useEffect, useState } from 'react'
import KeyVaultPage from '@/components/hub/pages/KeyVaultPage'
import { HubData, Lang, LANGS, c } from '@/components/hub/shared'

export default function HubVaultPage() {
  const [lang, setLang] = useState<Lang>('en')
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

  return (
    <main
      className="vault-standalone"
      style={{ minHeight: '100vh', background: 'radial-gradient(1100px 500px at 80% -10%, rgba(26,240,255,.10), transparent 60%), radial-gradient(900px 480px at 0% 110%, rgba(255,195,0,.07), transparent 55%), linear-gradient(180deg, #0b1220 0%, #030712 100%)', color: '#fff', padding: '18px clamp(14px, 2vw, 42px) 34px', fontFamily: 'Inter, system-ui, -apple-system, sans-serif', overflowX: 'hidden' }}
    >
      <style>{`.hub-card{transition:transform .18s ease, border-color .18s ease, box-shadow .18s ease;} .hub-card:hover{transform:translateY(-3px); box-shadow:0 24px 60px rgba(0,0,0,.55);} .hub-chip{transition:background .15s ease, color .15s ease, border-color .15s ease; cursor:pointer;} .hub-chip:hover{border-color:rgba(255,195,0,.6);} .hub-btn{transition:filter .15s ease, transform .12s ease; cursor:pointer;} .hub-btn:hover{transform:translateY(-1px); filter:brightness(1.25);} .hub-panel::-webkit-scrollbar{width:8px;} .hub-panel::-webkit-scrollbar-thumb{background:rgba(255,255,255,.14);border-radius:8px;} .hub-panel::-webkit-scrollbar-track{background:transparent;} @keyframes hubPulse{0%,100%{opacity:.45}50%{opacity:1}} .hub-loading{animation:hubPulse 1.4s ease infinite;} .vault-standalone > .hub-panel{height:auto!important;min-height:calc(100vh - 120px)!important;overflow:visible!important;padding-right:0!important;max-width:980px;margin:0 auto;gap:22px!important;} .vault-standalone > .hub-panel > section{padding:22px 0 8px;min-height:auto;} .vault-standalone > .hub-panel > section:nth-of-type(1){min-height:72vh;display:flex;flex-direction:column;} .vault-standalone > .hub-panel > section:nth-of-type(2){min-height:46vh;} .vault-standalone > .hub-panel > section:nth-of-type(3){display:none!important;} .vault-standalone .hub-card{border-radius:22px;} @media (max-width: 720px){.vault-standalone{padding-left:12px!important;padding-right:12px!important}.vault-standalone > .hub-panel{max-width:100%;gap:18px!important}.vault-standalone > .hub-panel > section:nth-of-type(1){min-height:68vh}}`}</style>

      <header style={{ position: 'sticky', top: 0, zIndex: 25, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginBottom: 18, padding: '10px 0 14px', background: 'linear-gradient(180deg, rgba(11,18,32,.98), rgba(11,18,32,.72) 70%, transparent)', backdropFilter: 'blur(10px)' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 'clamp(24px, 3vw, 34px)', fontWeight: 900, letterSpacing: '-.03em', background: 'linear-gradient(90deg, #fff 30%, #1af0ff 75%, #ffc300 100%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>Monitor 2 · Key Vault</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13.5, color: 'rgba(255,255,255,.58)' }}>Tall secure workspace · scroll down through safe, activity, and key history</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <a href="/hub" className="hub-chip" style={{ padding: '8px 13px', borderRadius: 10, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.04)', color: 'rgba(255,255,255,.72)', textDecoration: 'none', fontSize: 12.5, fontWeight: 800 }}>🛰️ Dashboard</a>
          <a href="/hub/providers" className="hub-chip" style={{ padding: '8px 13px', borderRadius: 10, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.04)', color: 'rgba(255,255,255,.72)', textDecoration: 'none', fontSize: 12.5, fontWeight: 800 }}>🧭 Providers</a>
          {LANGS.map(l => (
            <button key={l} onClick={() => setLang(l)} className="hub-chip" style={{ padding: '5px 10px', borderRadius: 8, border: lang === l ? '1px solid rgba(26,240,255,.5)' : '1px solid rgba(255,255,255,.12)', background: lang === l ? 'rgba(26,240,255,.16)' : 'rgba(255,255,255,.04)', color: lang === l ? '#1af0ff' : 'rgba(255,255,255,.6)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>{l}</button>
          ))}
          <button onClick={load} className="hub-btn" style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid rgba(26,240,255,.4)', background: 'rgba(26,240,255,.1)', color: '#1af0ff', fontSize: 12.5, fontWeight: 800 }}>{loading ? '…' : '↻ ' + c('refresh', lang)}</button>
        </div>
      </header>

      <KeyVaultPage lang={lang} data={data} loading={loading} failed={failed} />
    </main>
  )
}

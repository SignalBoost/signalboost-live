'use client'

// saas/app/hub/vault/page.tsx
// Standalone route for Vault / My Safe.
// Tall vertical workspace: the Vault reads like a long secure feed rather than
// a compressed monitor panel.

import { useCallback, useEffect, useState } from 'react'
import KeyVaultPage from '@/components/hub/pages/KeyVaultPage'
import { HubData, Lang, LANGS, c } from '@/components/hub/shared'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


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
      <style>{uiCopy('u_b031faf6c80e6ce2')}</style>

      <header style={{ position: 'sticky', top: 0, zIndex: 25, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginBottom: 18, padding: '10px 0 14px', background: 'linear-gradient(180deg, rgba(11,18,32,.98), rgba(11,18,32,.72) 70%, transparent)', backdropFilter: 'blur(10px)' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 'clamp(24px, 3vw, 34px)', fontWeight: 900, letterSpacing: '-.03em', background: 'linear-gradient(90deg, #fff 30%, #1af0ff 75%, #ffc300 100%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>{uiCopy('u_53d27183685fb92c')}</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13.5, color: 'rgba(255,255,255,.58)' }}>{uiCopy('u_9ddd7a757abd822a')}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <a href="/hub" className="hub-chip" style={{ padding: '8px 13px', borderRadius: 10, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.04)', color: 'rgba(255,255,255,.72)', textDecoration: 'none', fontSize: 12.5, fontWeight: 800 }}>{uiCopy('u_3f6e0fed4fba9344')}</a>
          <a href="/hub/providers" className="hub-chip" style={{ padding: '8px 13px', borderRadius: 10, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.04)', color: 'rgba(255,255,255,.72)', textDecoration: 'none', fontSize: 12.5, fontWeight: 800 }}>{uiCopy('u_5340e9e0f6071806')}</a>
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

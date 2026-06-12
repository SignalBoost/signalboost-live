'use client'

// saas/components/hub/pages/KeyVaultPage.tsx
// Console Page 2 — Key Vault (read-only mirror).
// Inventories every credential NAME from Vercel and its environment coverage.
// SECURITY RULING: values are never fetched, shown, or stored. Vercel env
// remains the single source of truth; this page is its intelligent mirror.

import { useMemo, useState } from 'react'
import { PageProps, c, TONES, Tone, cardStyle, bodyStyle, labelStyle, rowStyle, monoStyle, Band, Status } from '../shared'

type ProviderGroup = { key: string; title: string; icon: string; tone: Tone; prefixes: string[] }

const GROUPS: ProviderGroup[] = [
  { key: 'supabase', title: 'Supabase', icon: '🗄️', tone: TONES.green,  prefixes: ['SUPABASE', 'NEXT_PUBLIC_SUPABASE'] },
  { key: 'stripe',   title: 'Stripe',   icon: '💳', tone: TONES.blue,   prefixes: ['STRIPE'] },
  { key: 'vercel',   title: 'Vercel',   icon: '🌐', tone: TONES.purple, prefixes: ['VERCEL'] },
  { key: 'openai',   title: 'OpenAI',   icon: '🤖', tone: TONES.cyan,   prefixes: ['OPENAI'] },
  { key: 'github',   title: 'GitHub',   icon: '🐙', tone: TONES.gray,   prefixes: ['GITHUB'] },
  { key: 'other',    title: '',         icon: '🧩', tone: TONES.gold,   prefixes: [] },
]

function groupFor(name: string): string {
  for (const g of GROUPS) {
    if (g.prefixes.some(p => name.startsWith(p))) return g.key
  }
  return 'other'
}

export default function KeyVaultPage({ lang, data, loading }: PageProps) {
  const [openGroup, setOpenGroup] = useState<Record<string, boolean>>({})
  const configured = !!data?.vercel.configured
  const scopes = data?.vercel.scopes || []

  // Build the inventory: every key name -> which environments have it.
  const inventory = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const s of scopes) {
      for (const n of s.names) {
        if (!map.has(n)) map.set(n, new Set())
        map.get(n)!.add(s.scope)
      }
    }
    const byGroup: Record<string, { name: string; envs: Set<string> }[]> = {}
    for (const [name, envs] of map.entries()) {
      const g = groupFor(name)
      if (!byGroup[g]) byGroup[g] = []
      byGroup[g].push({ name, envs })
    }
    for (const g of Object.keys(byGroup)) byGroup[g].sort((a, b) => a.name.localeCompare(b.name))
    return byGroup
  }, [scopes])

  const allScopeNames = scopes.map(s => s.scope)
  // Development is informational only: this platform deploys GitHub -> Vercel
  // with no local dev environment. Warnings apply to Production/Preview gaps.
  const coreNames = allScopeNames.filter(s => s !== 'Development')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, gap: 12 }}>
      <div style={{ flexShrink: 0 }}>
        <div style={{ fontSize: 17, fontWeight: 800 }}>{c('vaultTitle', lang)}</div>
        <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,.55)', maxWidth: 720 }}>{c('vaultSub', lang)}</div>
      </div>

      {loading && <div className="hub-loading" style={{ padding: '11px 14px', borderRadius: 12, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.04)', fontSize: 13, color: 'rgba(255,255,255,.6)' }}>{c('loading', lang)}</div>}

      {!loading && !configured && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 14px', borderRadius: 12, border: '1px solid rgba(255,195,0,.45)', background: 'rgba(255,195,0,.07)', fontSize: 13 }}>
          <span>⚠️</span>{c('vaultNeedsToken', lang)}
        </div>
      )}

      {configured && (
        <main className="hub-main" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(295px, 1fr))', gap: 14, flex: 1, minHeight: 0, gridAutoRows: 'minmax(0, 1fr)' }}>
          {GROUPS.map(g => {
            const items = inventory[g.key] || []
            if (items.length === 0) return null
            const title = g.key === 'other' ? c('vaultOther', lang) : g.title
            const isOpen = !!openGroup[g.key]
            const shown = isOpen ? items : items.slice(0, 5)
            return (
              <section key={g.key} className="hub-card hub-panel" style={cardStyle}>
                <Band tone={g.tone} icon={g.icon} title={title} plain={`${items.length} ${c('vaultKeys', lang)}`} sub={c('vaultCoverage', lang)} />
                <div style={bodyStyle}>
                  <Status ok={items.every(i => coreNames.every(s => i.envs.has(s)))} text={items.every(i => coreNames.every(s => i.envs.has(s))) ? c('allClear', lang) : `${items.filter(i => !coreNames.every(s => i.envs.has(s))).length} ⚠️`} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {shown.map(item => {
                      const missing = coreNames.filter(s => !item.envs.has(s))
                      return (
                        <div key={item.name} style={{ ...rowStyle, border: missing.length ? '1px solid rgba(255,195,0,.45)' : rowStyle.border }}>
                          <span style={{ ...monoStyle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                          <span style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                            {allScopeNames.map(s => (
                              <span key={s} title={s} style={{ width: 18, height: 18, borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, background: item.envs.has(s) ? 'rgba(34,197,94,.18)' : s === 'Development' ? 'rgba(255,255,255,.05)' : 'rgba(239,68,68,.16)', border: item.envs.has(s) ? '1px solid rgba(34,197,94,.45)' : s === 'Development' ? '1px solid rgba(255,255,255,.14)' : '1px solid rgba(239,68,68,.4)', color: item.envs.has(s) ? '#86efac' : s === 'Development' ? 'rgba(255,255,255,.35)' : '#fca5a5' }}>{s[0]}</span>
                            ))}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                  {items.length > 5 && (
                    <button onClick={() => setOpenGroup(prev => ({ ...prev, [g.key]: !prev[g.key] }))} className="hub-chip" style={{ alignSelf: 'flex-start', padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.15)', color: 'rgba(255,255,255,.7)' }}>{isOpen ? '▴ ' + c('hideDetails', lang) : `▾ ${c('showDetails', lang)} (${items.length})`}</button>
                  )}
                </div>
              </section>
            )
          })}
        </main>
      )}
    </div>
  )
}

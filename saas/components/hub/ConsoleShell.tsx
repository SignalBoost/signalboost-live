'use client'

// saas/components/hub/ConsoleShell.tsx
// SignalBoost Command Control — unified shell for Dashboard, Vault, Provider Health, and Providers.

import { useCallback, useEffect, useState } from 'react'
import { Lang, HubData } from './shared'
import DashboardPage from './pages/DashboardPage'
import VaultMonitorPage from './pages/VaultMonitorPage'
import ProviderHealthPage from './pages/ProviderHealthPage'
import ProviderExpansionPage from './pages/ProviderExpansionPage'
import CommandShell from '../command-control/CommandShell'
import type { CommandPage, CommandPageKey, CommandRailSection } from '../command-control/types'

const PAGES: CommandPage[] = [
  { key: 'dashboard', icon: '🛰️', title: 'Dashboard', eyebrow: 'Main console', description: 'Live internal platform status for Supabase, Stripe, and Vercel.', Component: DashboardPage },
  { key: 'vault', icon: '🔐', title: 'Keys & Secrets', eyebrow: 'Governance workspace', description: 'Credential inventory, environment coverage, and future key rotation workflows.', Component: VaultMonitorPage },
  { key: 'health', icon: '🩺', title: 'Provider Health', eyebrow: 'Operations monitor', description: 'Essential health and risk signals for enabled cloud and SaaS providers.', Component: ProviderHealthPage },
  { key: 'providers', icon: '🧭', title: 'Providers', eyebrow: 'Provider manual', description: 'Provider setup guidance, automation value, and enable/disable preferences.', Component: ProviderExpansionPage },
]

const COMMAND_SECTIONS: CommandRailSection[] = [
  {
    title: 'Main',
    items: [
      { key: 'dashboard', icon: '🛰️', label: 'Dashboard', pageKey: 'dashboard' },
      { key: 'health', icon: '🩺', label: 'Provider Health', pageKey: 'health' },
      { key: 'vault', icon: '🔐', label: 'Keys & Secrets', pageKey: 'vault' },
      { key: 'security-alerts', icon: '🛡️', label: 'Security Alerts', disabled: true, badge: 'Next' },
      { key: 'usage-cost', icon: '📊', label: 'Usage & Cost', disabled: true },
      { key: 'audit-log', icon: '🧾', label: 'Audit Log', disabled: true, badge: 'Next' },
    ],
  },
  {
    title: 'Providers',
    items: [
      { key: 'providers', icon: '🧭', label: 'Provider Manual', pageKey: 'providers' },
      { key: 'tier-1', icon: '🧱', label: 'Tier 1 — Core', pageKey: 'providers' },
      { key: 'tier-2', icon: '⚙️', label: 'Tier 2 — Common', pageKey: 'providers' },
      { key: 'tier-3', icon: '🧠', label: 'Tier 3 — AI / Data', pageKey: 'providers' },
      { key: 'tier-4', icon: '🛠️', label: 'Tier 4 — DevOps', disabled: true },
      { key: 'tier-5', icon: '📣', label: 'Tier 5 — Marketing', disabled: true },
    ],
  },
  {
    title: 'Settings',
    items: [
      { key: 'team-access', icon: '👥', label: 'Team & Access', disabled: true },
      { key: 'settings', icon: '⚙️', label: 'Settings', disabled: true },
    ],
  },
  {
    title: 'Support',
    items: [
      { key: 'help-docs', icon: '📚', label: 'Help & Docs', disabled: true },
    ],
  },
]

function isRefreshButton(button: HTMLButtonElement | null): boolean {
  if (!button) return false
  const haystack = `${button.textContent || ''} ${button.getAttribute('title') || ''}`.toLowerCase()
  return ['refresh', 'updated', 'actualizar', 'atualizar', 'odśwież', 'обновить', '↻'].some(word => haystack.includes(word))
}

function navigateToFreshHub() {
  const nextUrl = new URL(window.location.href)
  nextUrl.searchParams.set('refresh', String(Date.now()))
  window.location.assign(nextUrl.toString())
}

function pageIndexFromKey(key: CommandPageKey): number {
  return Math.max(0, PAGES.findIndex(page => page.key === key))
}

export default function ConsoleShell({ initialPage = 'dashboard' }: { initialPage?: CommandPageKey }) {
  const [lang, setLang] = useState<Lang>('en')
  const [idx, setIdx] = useState(pageIndexFromKey(initialPage))
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

  const go = useCallback((pageIndex: number) => {
    const next = Math.max(0, Math.min(pageIndex, PAGES.length - 1))
    setIdx(next)
    window.history.replaceState(null, '', '#' + PAGES[next].key)
  }, [])

  const goByKey = useCallback((pageKey: CommandPageKey) => {
    go(pageIndexFromKey(pageKey))
  }, [go])

  useEffect(() => {
    const fromHash = () => {
      const h = window.location.hash.replace('#', '')
      const next = PAGES.findIndex(p => p.key === h)
      if (next >= 0) setIdx(next)
    }
    fromHash()
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      if (event.key === 'ArrowRight') go(idx + 1)
      if (event.key === 'ArrowLeft') go(idx - 1)
    }
    window.addEventListener('hashchange', fromHash)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('hashchange', fromHash)
      window.removeEventListener('keydown', onKey)
    }
  }, [go, idx])

  const activePage = PAGES[idx]
  const ActivePage = activePage.Component

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
      style={{ minHeight: '100vh', background: 'radial-gradient(1100px 500px at 80% -10%, rgba(26,240,255,.10), transparent 60%), radial-gradient(900px 480px at 0% 110%, rgba(255,195,0,.07), transparent 55%), linear-gradient(180deg, #0b1220 0%, #030712 100%)', color: '#fff', padding: '16px clamp(12px, 1.4vw, 26px)', fontFamily: 'Inter, system-ui, -apple-system, sans-serif', overflow: 'hidden' }}
    >
      <style>{`.hub-card{transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease}.hub-card:hover{transform:translateY(-3px);box-shadow:0 24px 60px rgba(0,0,0,.55)}.hub-chip{transition:background .15s ease,color .15s ease,border-color .15s ease;cursor:pointer}.hub-chip:disabled{cursor:not-allowed}.hub-btn{transition:filter .15s ease,transform .12s ease;cursor:pointer}.hub-btn:hover{transform:translateY(-1px);filter:brightness(1.25)}.hub-panel::-webkit-scrollbar,.command-rail::-webkit-scrollbar{width:8px}.hub-panel::-webkit-scrollbar-thumb,.command-rail::-webkit-scrollbar-thumb{background:rgba(255,255,255,.14);border-radius:8px}.hub-panel::-webkit-scrollbar-track,.command-rail::-webkit-scrollbar-track{background:transparent}@keyframes hubPulse{0%,100%{opacity:.45}50%{opacity:1}}.hub-loading{animation:hubPulse 1.4s ease infinite}.hub-arrow{position:absolute;top:50%;transform:translateY(-50%);z-index:20;width:42px;height:70px;display:flex;align-items:center;justify-content:center;font-size:24px;color:rgba(255,255,255,.65);background:rgba(15,23,42,.72);border:1px solid rgba(255,255,255,.14);cursor:pointer;backdrop-filter:blur(8px)}.hub-arrow:hover{color:#1af0ff;background:rgba(15,23,42,.9)}@media (min-width:1100px){.hub-root{height:calc(100vh - 80px);min-height:0}.command-shell{height:100%;min-height:0}.hub-panel{overflow-y:auto;min-height:0}}@media (max-width:980px){.command-shell{flex-direction:column}.command-rail{width:auto!important;flex:0 0 auto!important;max-height:270px}.mission-bar{align-items:flex-start!important}.command-stage{min-height:70vh!important}}`}</style>

      <CommandShell
        sections={COMMAND_SECTIONS}
        activePage={activePage}
        activePageKey={activePage.key}
        lang={lang}
        data={data}
        loading={loading}
        onNavigate={goByKey}
        onLanguageChange={setLang}
        onRefresh={load}
      >
        {idx > 0 && <button onClick={() => go(idx - 1)} className="hub-arrow" style={{ left: 0, borderRadius: '0 12px 12px 0', borderLeft: 'none' }}>‹</button>}
        {idx < PAGES.length - 1 && <button onClick={() => go(idx + 1)} className="hub-arrow" style={{ right: 0, borderRadius: '12px 0 0 12px', borderRight: 'none' }}>›</button>}
        <ActivePage lang={lang} data={data} loading={loading} failed={failed} />
      </CommandShell>
    </div>
  )
}

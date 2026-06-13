'use client'

// saas/components/hub/ConsoleShell.tsx
// SignalBoost Command Control — Operations & Production support shell.

import { useCallback, useEffect, useState } from 'react'
import { Lang, HubData } from './shared'
import DashboardPage from './pages/DashboardPage'
import VaultMonitorPage from './pages/VaultMonitorPage'
import ProviderHealthPage from './pages/ProviderHealthPage'
import SecurityAlertsPage from './pages/SecurityAlertsPage'
import UsageCostPage from './pages/UsageCostPage'
import AuditLogPage from './pages/AuditLogPage'
import TeamAccessPage from './pages/TeamAccessPage'
import SetupCenterPage from './pages/SetupCenterPage'
import AIOperationsPage from './pages/AIOperationsPage'
import ProviderExpansionPage from './pages/ProviderExpansionPage'
import CommandShell from '../command-control/CommandShell'
import type { CommandPage, CommandPageKey, CommandRailSection } from '../command-control/types'

const PAGES: CommandPage[] = [
  { key: 'providers', icon: '🧭', title: 'Business Operating Partners', eyebrow: 'Operations & Production', description: 'Partners that support daily operations: data, hosting, revenue, source control, AI, cloud, and communications.', Component: ProviderExpansionPage },
  { key: 'dashboard', icon: '🛰️', title: 'Dashboard', eyebrow: 'Command Monitor', description: 'Live internal platform status for mission-critical operating partners.', Component: DashboardPage },
  { key: 'vault', icon: '🔐', title: 'Keys & Secrets', eyebrow: 'Command Monitor', description: 'Credential inventory, environment coverage, and future key rotation workflows.', Component: VaultMonitorPage },
  { key: 'health', icon: '🩺', title: 'Operating Partner Health', eyebrow: 'Command Monitor', description: 'Health and risk signals for enabled Business Operating Partners.', Component: ProviderHealthPage },
  { key: 'security', icon: '🛡️', title: 'Security Alerts', eyebrow: 'Command Monitor', description: 'Security findings, severity, impact, and recommended fixes.', Component: SecurityAlertsPage },
  { key: 'usage', icon: '📊', title: 'Usage & Cost', eyebrow: 'Command Monitor', description: 'Usage increases, cost spikes, and threshold alerts.', Component: UsageCostPage },
  { key: 'audit', icon: '🧾', title: 'Audit Log', eyebrow: 'Command Monitor', description: 'A record of important user, system, and operating-partner actions.', Component: AuditLogPage },
  { key: 'team', icon: '👥', title: 'Team & Access', eyebrow: 'Command Monitor', description: 'Role visibility and access governance for the command center.', Component: TeamAccessPage },
  { key: 'setup', icon: '🧩', title: 'Setup Center', eyebrow: 'Command Monitor', description: 'Step-by-step operating-partner connection guidance for non-technical users.', Component: SetupCenterPage },
  { key: 'aiops', icon: '🧠', title: 'AI Operations Center', eyebrow: 'Command Monitor', description: 'Recommended actions across security, health, cost, and setup.', Component: AIOperationsPage },
]

const COMMAND_SECTIONS: CommandRailSection[] = [
  {
    title: 'Operations & Production',
    items: [
      { key: 'partners', icon: '🧭', label: 'Business Operating Partners', pageKey: 'providers' },
      { key: 'mission-critical', icon: '⭐', label: 'Mission Critical Partners', pageKey: 'providers' },
      { key: 'growth-ai', icon: '🧠', label: 'Growth Partners — AI', pageKey: 'providers' },
      { key: 'cloud', icon: '☁️', label: 'Infrastructure Partners', pageKey: 'providers' },
      { key: 'edge-app', icon: '🌐', label: 'Application + Edge Partners', pageKey: 'providers' },
      { key: 'communication', icon: '✉️', label: 'Communication Partners', pageKey: 'providers' },
      { key: 'identity-data', icon: '🔐', label: 'Identity + Data Partners', pageKey: 'providers' },
      { key: 'ops-visibility', icon: '🛠️', label: 'Operations Visibility Partners', pageKey: 'providers' },
    ],
  },
  {
    title: 'Command Monitors',
    items: [
      { key: 'dashboard', icon: '🛰️', label: 'Dashboard', pageKey: 'dashboard' },
      { key: 'vault', icon: '🔐', label: 'Keys & Secrets', pageKey: 'vault' },
      { key: 'health', icon: '🩺', label: 'Operating Partner Health', pageKey: 'health' },
      { key: 'security', icon: '🛡️', label: 'Security Alerts', pageKey: 'security' },
      { key: 'usage', icon: '📊', label: 'Usage & Cost', pageKey: 'usage' },
      { key: 'audit', icon: '🧾', label: 'Audit Log', pageKey: 'audit' },
      { key: 'team', icon: '👥', label: 'Team & Access', pageKey: 'team' },
      { key: 'setup', icon: '🧩', label: 'Setup Center', pageKey: 'setup' },
      { key: 'aiops', icon: '🧠', label: 'AI Operations Center', pageKey: 'aiops' },
    ],
  },
  { title: 'Support', items: [{ key: 'help-docs', icon: '📚', label: 'Help & Docs', disabled: true }] },
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

export default function ConsoleShell({ initialPage = 'providers' }: { initialPage?: CommandPageKey }) {
  const [lang, setLang] = useState<Lang>('en')
  const [idx, setIdx] = useState(pageIndexFromKey(initialPage))
  const [data, setData] = useState<HubData | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setFailed(false)
    try {
      const res = await fetch('/api/hub/status?t=' + Date.now(), { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } })
      if (!res.ok) throw new Error(String(res.status))
      setData(await res.json())
    } catch { setFailed(true) } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { const onRefresh = () => { void load() }; window.addEventListener('signalboost:hub-refresh', onRefresh); return () => window.removeEventListener('signalboost:hub-refresh', onRefresh) }, [load])

  const go = useCallback((pageIndex: number) => { const next = Math.max(0, Math.min(pageIndex, PAGES.length - 1)); setIdx(next); window.history.replaceState(null, '', '#' + PAGES[next].key) }, [])
  const goByKey = useCallback((pageKey: CommandPageKey) => { go(pageIndexFromKey(pageKey)) }, [go])

  useEffect(() => {
    const fromHash = () => { const h = window.location.hash.replace('#', ''); const next = PAGES.findIndex(p => p.key === h); if (next >= 0) setIdx(next) }
    fromHash()
    const onKey = (event: KeyboardEvent) => { const target = event.target as HTMLElement; if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return; if (event.key === 'ArrowRight') go(idx + 1); if (event.key === 'ArrowLeft') go(idx - 1) }
    window.addEventListener('hashchange', fromHash); window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('hashchange', fromHash); window.removeEventListener('keydown', onKey) }
  }, [go, idx])

  const activePage = PAGES[idx]
  const previousPage = idx > 0 ? PAGES[idx - 1] : null
  const nextPage = idx < PAGES.length - 1 ? PAGES[idx + 1] : null
  const ActivePage = activePage.Component

  return (
    <div className="hub-root" onClickCapture={(event) => { const button = (event.target as HTMLElement).closest('button'); if (isRefreshButton(button)) { window.setTimeout(() => { void load() }, 0); window.setTimeout(navigateToFreshHub, 250) } }} style={{ minHeight: '100vh', background: 'radial-gradient(1100px 500px at 80% -10%, rgba(26,240,255,.10), transparent 60%), radial-gradient(900px 480px at 0% 110%, rgba(255,195,0,.07), transparent 55%), linear-gradient(180deg, #0b1220 0%, #030712 100%)', color: '#fff', padding: '16px clamp(12px, 1.4vw, 26px)', fontFamily: 'Inter, system-ui, -apple-system, sans-serif', overflow: 'hidden' }}>
      <style>{`.hub-card{transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease}.hub-card:hover{transform:translateY(-3px);box-shadow:0 24px 60px rgba(0,0,0,.55)}.hub-chip{transition:background .15s ease,color .15s ease,border-color .15s ease;cursor:pointer}.hub-chip:disabled{cursor:not-allowed}.hub-btn{transition:filter .15s ease,transform .12s ease;cursor:pointer}.hub-btn:hover{transform:translateY(-1px);filter:brightness(1.25)}.hub-panel::-webkit-scrollbar,.command-rail::-webkit-scrollbar{width:8px}.hub-panel::-webkit-scrollbar-thumb,.command-rail::-webkit-scrollbar-thumb{background:rgba(255,255,255,.14);border-radius:8px}.hub-panel::-webkit-scrollbar-track,.command-rail::-webkit-scrollbar-track{background:transparent}@keyframes hubPulse{0%,100%{opacity:.45}50%{opacity:1}}.hub-loading{animation:hubPulse 1.4s ease infinite}.hub-arrow{position:absolute;top:50%;transform:translateY(-50%);z-index:80;width:48px;height:86px;display:flex;align-items:center;justify-content:center;font-size:28px;color:#e6f1ff;background:rgba(15,23,42,.88);border:1px solid rgba(26,240,255,.26);cursor:pointer;backdrop-filter:blur(10px);box-shadow:0 18px 50px rgba(0,0,0,.38)}.hub-arrow:hover{color:#1af0ff;background:rgba(15,23,42,.96);border-color:rgba(26,240,255,.55)}.monitor-nav{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);z-index:90;display:flex;gap:10px;align-items:center;justify-content:center;padding:8px;border-radius:999px;border:1px solid rgba(255,255,255,.12);background:rgba(3,7,18,.82);backdrop-filter:blur(10px);box-shadow:0 22px 70px rgba(0,0,0,.45)}.monitor-nav button{max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}@media (min-width:1100px){.hub-root{height:calc(100vh - 80px);min-height:0}.command-shell{height:100%;min-height:0}.hub-panel{overflow-y:auto;min-height:0}}@media (max-width:980px){.command-shell{flex-direction:column}.command-rail{width:auto!important;flex:0 0 auto!important;max-height:270px}.mission-bar{align-items:flex-start!important}.command-stage{min-height:70vh!important}.monitor-nav{position:sticky;bottom:8px;margin:8px auto 0;transform:none;left:auto}.hub-arrow{display:none!important}}`}</style>
      <CommandShell sections={COMMAND_SECTIONS} activePage={activePage} activePageKey={activePage.key} lang={lang} data={data} loading={loading} onNavigate={goByKey} onLanguageChange={setLang} onRefresh={load}>
        {previousPage && <button onClick={() => go(idx - 1)} className="hub-arrow" style={{ left: 10, borderRadius: '0 16px 16px 0' }} title={`Previous: ${previousPage.title}`}>‹</button>}
        {nextPage && <button onClick={() => go(idx + 1)} className="hub-arrow" style={{ right: 10, borderRadius: '16px 0 0 16px' }} title={`Next: ${nextPage.title}`}>›</button>}
        <ActivePage lang={lang} data={data} loading={loading} failed={failed} />
        <nav className="monitor-nav" aria-label="Monitor navigation"><button disabled={!previousPage} onClick={() => go(idx - 1)} className="hub-chip" style={{ padding: '8px 12px', borderRadius: 999, border: '1px solid rgba(255,255,255,.14)', background: previousPage ? 'rgba(255,255,255,.06)' : 'rgba(255,255,255,.025)', color: previousPage ? 'rgba(255,255,255,.76)' : 'rgba(255,255,255,.28)', fontSize: 12, fontWeight: 900 }}>← {previousPage ? previousPage.title : 'Start'}</button><span style={{ color: '#1af0ff', fontSize: 12, fontWeight: 950 }}>{idx + 1} / {PAGES.length}</span><button disabled={!nextPage} onClick={() => go(idx + 1)} className="hub-chip" style={{ padding: '8px 12px', borderRadius: 999, border: '1px solid rgba(26,240,255,.35)', background: nextPage ? 'rgba(26,240,255,.10)' : 'rgba(255,255,255,.025)', color: nextPage ? '#1af0ff' : 'rgba(255,255,255,.28)', fontSize: 12, fontWeight: 900 }}>{nextPage ? nextPage.title : 'End'} →</button></nav>
      </CommandShell>
    </div>
  )
}

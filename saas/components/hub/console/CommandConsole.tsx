'use client'

// saas/components/hub/console/CommandConsole.tsx
// Hub Command Console — provider-centric, tiered orchestrator.
//
// Layout contract (matches the Command Control mock):
//   - Left sidebar: tier switcher (Tier 1–4) + provider list + utility pages.
//   - Main: at most TWO provider cards per page (paginated within a tier).
//   - Each card expands into a dedicated full-width workspace.
//   - Footer: audit-log assurance line.  Floating Concierge button.
//   - One action-form overlay routes every run through /api/hub/action, which
//     enforces auth, policy/approval, and audit logging server-side.

import { useState } from 'react'
import {
  CONSOLE_TIERS,
  CONSOLE_UTILITY_PAGES,
  ConsoleTierId,
  getConsoleTier,
  getConsoleProvider,
  getTierProviders,
} from '@/lib/hub/console-catalog'
import { Lang } from '../shared'
import ProviderActionForm from '../ProviderActionForm'
import { getTemplate } from '@/lib/hub/provider-templates'
import { ProviderConsoleCard, ProviderWorkspace } from './ProviderConsoleCard'
import { DomainsPage } from '../pages/DomainsPage'
import { DeploymentsPage } from '../pages/DeploymentsPage'
import { LogsPage } from '../pages/LogsPage'
import { SettingsPage } from '../pages/SettingsPage'

const PER_PAGE = 2

export default function CommandConsole({
  lang = 'en',
  initialTier = 'core',
}: {
  lang?: Lang
  initialTier?: ConsoleTierId
}) {
  const [tierId, setTierId] = useState<ConsoleTierId>(initialTier)
  const [page, setPage] = useState(0)
  const [focusProviderId, setFocusProviderId] = useState<string | null>(null)
  const [utilityId, setUtilityId] = useState<string | null>(null)
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null)

  const tier = getConsoleTier(tierId)
  const providers = getTierProviders(tierId)
  const pageCount = Math.max(1, Math.ceil(providers.length / PER_PAGE))
  const safePage = Math.min(page, pageCount - 1)
  const visible = providers.slice(safePage * PER_PAGE, safePage * PER_PAGE + PER_PAGE)

  const selectTier = (id: ConsoleTierId) => {
    setTierId(id)
    setPage(0)
    setFocusProviderId(null)
    setUtilityId(null)
  }
  const openProvider = (id: string) => {
    setFocusProviderId(id)
    setUtilityId(null)
  }
  const openUtility = (id: string) => {
    setUtilityId(id)
    setFocusProviderId(null)
  }
  const run = (templateId: string) => setActiveTemplateId(templateId)

  const focusProvider = focusProviderId ? getConsoleProvider(focusProviderId) : null

  return (
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 80px)', background: '#070b14', color: '#fff', position: 'relative' }}>
      {/* ============================ SIDEBAR ============================ */}
      <aside
        style={{
          width: 248,
          flex: '0 0 248px',
          background: 'linear-gradient(180deg, rgba(13,18,32,.9), rgba(8,11,20,.9))',
          borderRight: '1px solid rgba(255,255,255,.07)',
          display: 'flex',
          flexDirection: 'column',
          padding: '16px 12px',
          overflowY: 'auto',
        }}
      >
        {/* Tier header + switcher */}
        <div style={{ padding: '4px 8px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, color: 'rgba(255,255,255,.92)', fontWeight: 800, fontSize: 14 }}>
            <span style={{ color: 'rgba(255,255,255,.55)' }}>≡</span>
            {tier?.sidebarTitle}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 11 }}>
            {CONSOLE_TIERS.map(t => {
              const active = t.id === tierId
              return (
                <button
                  key={t.id}
                  onClick={() => selectTier(t.id)}
                  title={`Tier ${t.index} · ${t.label}`}
                  style={{
                    flex: 1,
                    padding: '6px 0',
                    borderRadius: 8,
                    border: active ? '1px solid rgba(26,240,255,.5)' : '1px solid rgba(255,255,255,.1)',
                    background: active ? 'rgba(26,240,255,.14)' : 'rgba(255,255,255,.03)',
                    color: active ? '#1af0ff' : 'rgba(255,255,255,.6)',
                    fontSize: 12,
                    fontWeight: 900,
                    cursor: 'pointer',
                  }}
                >
                  {t.index}
                </button>
              )
            })}
          </div>
        </div>

        {/* Provider list (active tier) */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 4 }}>
          {providers.map(p => {
            const active = focusProviderId === p.id
            return (
              <button
                key={p.id}
                onClick={() => openProvider(p.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 11,
                  padding: '9px 11px',
                  borderRadius: 10,
                  border: '1px solid transparent',
                  background: active ? 'rgba(26,240,255,.14)' : 'transparent',
                  color: active ? '#1af0ff' : 'rgba(255,255,255,.78)',
                  fontSize: 13.5,
                  fontWeight: active ? 800 : 600,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
                onMouseEnter={e => {
                  if (!active) e.currentTarget.style.background = 'rgba(255,255,255,.05)'
                }}
                onMouseLeave={e => {
                  if (!active) e.currentTarget.style.background = 'transparent'
                }}
              >
                <span style={{ width: 9, height: 9, borderRadius: 3, background: p.accent, flex: '0 0 auto', boxShadow: `0 0 8px ${p.accent}66` }} />
                {p.name}
              </button>
            )
          })}
        </nav>

        <div style={{ height: 1, background: 'rgba(255,255,255,.08)', margin: '14px 6px' }} />

        {/* Utility pages */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {CONSOLE_UTILITY_PAGES.map(u => {
            const active = utilityId === u.id
            return (
              <button
                key={u.id}
                onClick={() => openUtility(u.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 11,
                  padding: '9px 11px',
                  borderRadius: 10,
                  border: '1px solid transparent',
                  background: active ? 'rgba(255,195,0,.12)' : 'transparent',
                  color: active ? '#ffc300' : 'rgba(255,255,255,.7)',
                  fontSize: 13.5,
                  fontWeight: active ? 800 : 600,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
                onMouseEnter={e => {
                  if (!active) e.currentTarget.style.background = 'rgba(255,255,255,.05)'
                }}
                onMouseLeave={e => {
                  if (!active) e.currentTarget.style.background = 'transparent'
                }}
              >
                <span style={{ fontSize: 15, flex: '0 0 auto' }}>{u.icon}</span>
                {u.label}
              </button>
            )
          })}
        </nav>
      </aside>

      {/* ============================ CONTENT ============================ */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ flex: 1, overflow: 'auto', padding: '26px 30px' }}>
          {utilityId ? (
            <UtilityFrame id={utilityId} lang={lang} />
          ) : focusProvider ? (
            <ProviderWorkspace
              provider={focusProvider}
              tierLabel={tier?.label ? `Tier ${tier.index} · ${tier.label}` : 'Tier'}
              lang={lang}
              onBack={() => setFocusProviderId(null)}
              onRun={run}
            />
          ) : (
            <>
              {/* Tier overview header + pagination */}
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginBottom: 18, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: '#fff' }}>
                    Tier {tier?.index} · {tier?.label} Providers
                  </div>
                  <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,.5)', marginTop: 4, maxWidth: 560 }}>{tier?.blurb}</div>
                </div>
                {pageCount > 1 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <PagerButton label="←" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={safePage === 0} />
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,.6)', fontWeight: 700, minWidth: 86, textAlign: 'center' }}>
                      Page {safePage + 1} of {pageCount}
                    </span>
                    <PagerButton label="→" onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))} disabled={safePage >= pageCount - 1} />
                  </div>
                )}
              </div>

              {/* Two-up provider grid */}
              <div className="sb-console-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>
                {visible.map(p => (
                  <ProviderConsoleCard key={p.id} provider={p} lang={lang} onExpand={() => openProvider(p.id)} onRun={run} />
                ))}
                {visible.length === 1 && <div aria-hidden style={{ minHeight: 1 }} />}
              </div>
            </>
          )}
        </div>

        {/* Audit footer */}
        <div
          style={{
            borderTop: '1px solid rgba(255,255,255,.07)',
            padding: '14px 30px',
            textAlign: 'center',
            fontSize: 12.5,
            color: 'rgba(255,255,255,.55)',
            background: 'rgba(8,11,20,.6)',
          }}
        >
          <strong style={{ color: 'rgba(255,255,255,.8)' }}>Audit Log:</strong> All actions are recorded for compliance.{' '}
          <button
            onClick={() => openUtility('logs')}
            style={{ background: 'none', border: 'none', color: '#1af0ff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', padding: 0 }}
          >
            View log →
          </button>
        </div>
      </main>

      {/* Floating Concierge */}
      <button
        onClick={() => {
          if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('signalboost:open-concierge'))
        }}
        style={{
          position: 'fixed',
          right: 26,
          bottom: 26,
          zIndex: 60,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 9,
          padding: '12px 20px',
          borderRadius: 999,
          border: 'none',
          background: 'linear-gradient(135deg, #ffd23f, #ffb000)',
          color: '#1a1300',
          fontSize: 14,
          fontWeight: 900,
          cursor: 'pointer',
          boxShadow: '0 10px 30px rgba(255,176,0,.4)',
        }}
      >
        <span style={{ fontSize: 16 }}>?</span> Concierge
      </button>

      {/* Action overlay — auth + policy + audit enforced server-side.
          Read-only views get a wide panel so tables (catalogs, user lists,
          query results) have room; forms stay compact. */}
      {activeTemplateId && (() => {
        const t = getTemplate(activeTemplateId)
        const isView = t?.api.method === 'GET'
        return (
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
            onClick={() => setActiveTemplateId(null)}
          >
            <div style={{ width: '100%', maxWidth: isView ? 560 : 520, maxHeight: '82vh', overflow: 'auto', borderRadius: 18 }} onClick={e => e.stopPropagation()}>
              <ProviderActionForm
                templateId={activeTemplateId}
                lang={lang}
                onClose={() => setActiveTemplateId(null)}
                onSuccess={() => setActiveTemplateId(null)}
                onError={() => {}}
              />
            </div>
          </div>
        )
      })()}

      <style>{`
        @media (max-width: 980px) {
          .sb-console-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}

function PagerButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '6px 12px',
        borderRadius: 9,
        border: '1px solid rgba(255,255,255,.14)',
        background: disabled ? 'rgba(255,255,255,.02)' : 'rgba(255,255,255,.05)',
        color: disabled ? 'rgba(255,255,255,.25)' : '#1af0ff',
        fontSize: 14,
        fontWeight: 900,
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      {label}
    </button>
  )
}

function UtilityFrame({ id, lang }: { id: string; lang: Lang }) {
  if (id === 'domains') return <DomainsPage />
  if (id === 'deployments') return <DeploymentsPage />
  if (id === 'logs') return <LogsPage />
  if (id === 'settings') return <SettingsPage />
  return <div style={{ color: 'rgba(255,255,255,.6)' }}>Unknown page.</div>
}

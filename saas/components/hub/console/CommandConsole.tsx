'use client'

// saas/components/hub/console/CommandConsole.tsx
// Hub Command Console — provider-centric, tiered orchestrator.

import { useState } from 'react'
import { type ConsoleTierId } from '@/lib/hub/console-catalog'
import { Lang } from '../shared'
import ProviderActionForm from '../ProviderActionForm'
import { useTranslation } from '@/components/i18n/useTranslation'
import { ProviderConsoleCard, ProviderWorkspace } from './ProviderConsoleCard'
import { signalboostConsoleUI } from '@/console-host/consoleHostConfig'

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

  const { t, dict } = useTranslation()
  const tier = signalboostConsoleUI.catalog.getTier(tierId, dict)
  const providers = signalboostConsoleUI.catalog.getTierProviders(tierId, dict)
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
  const resetToHome = () => {
    setFocusProviderId(null)
    setUtilityId(null)
    setPage(0)
  }
  const run = (templateId: string) => setActiveTemplateId(templateId)

  const focusProvider = focusProviderId ? signalboostConsoleUI.catalog.getProvider(focusProviderId, dict) : null

  return (
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 80px)', background: '#070b14', color: '#fff', position: 'relative', boxSizing: 'border-box' }}>
      {/* Sidebar */}
      <aside style={{ width: 248, flex: '0 0 248px', background: 'linear-gradient(180deg, rgba(13,18,32,.9), rgba(8,11,20,.9))', borderRight: '1px solid rgba(255,255,255,.07)', display: 'flex', flexDirection: 'column', padding: '16px 12px', overflowY: 'auto', boxSizing: 'border-box' }}>
        <div style={{ padding: '4px 8px 12px' }}>
          <button onClick={resetToHome} style={{ background: 'none', border: 'none', display: 'flex', alignItems: 'center', gap: 9, color: 'rgba(255,255,255,.92)', fontWeight: 800, fontSize: 14, cursor: 'pointer', padding: 0, textAlign: 'left' }}>
            <span style={{ color: '#1af0ff' }}>≡</span>
            {tier?.sidebarTitle}
          </button>
          <div style={{ display: 'flex', gap: 6, marginTop: 11 }}>
            {signalboostConsoleUI.catalog.tiers.map(t => {
              const active = t.id === tierId
              return (
                <button key={t.id} onClick={() => selectTier(t.id)} style={{ flex: 1, padding: '6px 0', borderRadius: 8, border: active ? '1px solid rgba(26,240,255,.5)' : '1px solid rgba(255,255,255,.1)', background: active ? 'rgba(26,240,255,.14)' : 'rgba(255,255,255,.03)', color: active ? '#1af0ff' : 'rgba(255,255,255,.6)', fontSize: 12, fontWeight: 900, cursor: 'pointer' }}>
                  {t.index}
                </button>
              )
            })}
          </div>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 4 }}>
          {providers.map(p => {
            const active = focusProviderId === p.id
            return (
              <button key={p.id} onClick={() => openProvider(p.id)} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 11px', borderRadius: 10, border: '1px solid transparent', background: active ? 'rgba(26,240,255,.14)' : 'transparent', color: active ? '#1af0ff' : 'rgba(255,255,255,.78)', fontSize: 13.5, fontWeight: active ? 800 : 600, cursor: 'pointer', textAlign: 'left' }}>
                <span style={{ width: 9, height: 9, borderRadius: 3, background: p.accent, flex: '0 0 auto', boxShadow: `0 0 8px ${p.accent}66` }} />
                {p.name}
              </button>
            )
          })}
        </nav>

        <div style={{ height: 1, background: 'rgba(255,255,255,.08)', margin: '14px 6px' }} />

        <nav style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {signalboostConsoleUI.catalog.utilityNav.map(u => {
            const active = utilityId === u.id
            return (
              <button key={u.id} onClick={() => openUtility(u.id)} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 11px', borderRadius: 10, border: '1px solid transparent', background: active ? 'rgba(255,195,0,.12)' : 'transparent', color: active ? '#ffc300' : 'rgba(255,255,255,.7)', fontSize: 13.5, fontWeight: active ? 800 : 600, cursor: 'pointer', textAlign: 'left' }}>
                <span style={{ fontSize: 15, flex: '0 0 auto' }}>{u.icon}</span>
                {t(`console.util.${u.id}`, u.label)}
              </button>
            )
          })}
        </nav>
      </aside>

      {/* Content Area */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, boxSizing: 'border-box' }}>
        <div style={{ flex: 1, overflow: 'auto', padding: '24px 24px', boxSizing: 'border-box' }}>
          {utilityId ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.3)' }}>
                <button onClick={resetToHome} style={{ background: 'none', border: 'none', color: '#1af0ff', cursor: 'pointer', padding: 0, fontSize: 11, fontWeight: 700 }}>🎛️ {t('console.ui.hub_home', 'Hub Home')}</button> / {t('console.ui.utility_views', 'Utility Views')}
              </div>
              <UtilityFrame id={utilityId} lang={lang} />
            </div>
          ) : focusProvider ? (
            <ProviderWorkspace
              provider={focusProvider}
              tierLabel={tier?.label ? `${t('console.ui.tier', 'Tier')} ${tier.index} · ${tier.label}` : t('console.ui.tier', 'Tier')}
              lang={lang}
              onBack={() => setFocusProviderId(null)}
              onHome={resetToHome}
              onRun={run}
            />
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginBottom: 18, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: '#fff' }}>{t('console.ui.tier', 'Tier')} {tier?.index} · {tier?.label} {t('console.ui.providers', 'Providers')}</div>
                  <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,.5)', marginTop: 4, maxWidth: 560 }}>{tier?.blurb}</div>
                </div>
                {pageCount > 1 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <PagerButton label="←" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={safePage === 0} />
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,.6)', fontWeight: 700, minWidth: 86, textAlign: 'center' }}>Page {safePage + 1} of {pageCount}</span>
                    <PagerButton label="→" onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))} disabled={safePage >= pageCount - 1} />
                  </div>
                )}
              </div>

              <div className="sb-console-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start', boxSizing: 'border-box' }}>
                {visible.map(p => (
                  <ProviderConsoleCard key={p.id} provider={p} lang={lang} onExpand={() => openProvider(p.id)} onRun={run} />
                ))}
              </div>
            </>
          )}
        </div>

        {/* Audit footer */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,.07)', padding: '14px 24px', textAlign: 'center', fontSize: 12.5, color: 'rgba(255,255,255,.55)', background: 'rgba(8,11,20,.6)' }}>
          <strong style={{ color: 'rgba(255,255,255,.8)' }}>Audit Log:</strong> All actions are recorded for compliance.{' '}
          <button onClick={() => openUtility('logs')} style={{ background: 'none', border: 'none', color: '#1af0ff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', padding: 0 }}>View log →</button>
        </div>
      </main>

      {/* Action modal overlay */}
      {activeTemplateId && (() => {
        const panel = signalboostConsoleUI.panelRouter[activeTemplateId]
        const isPanel = Boolean(panel)
        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => setActiveTemplateId(null)}>
            <div style={{ width: '100%', maxWidth: isPanel ? 1040 : 820, maxHeight: '92vh', overflow: 'auto', borderRadius: 18 }} onClick={e => e.stopPropagation()}>
              {isPanel ? (
                <div style={{ background: 'linear-gradient(160deg, rgba(15,23,42,.96), rgba(3,7,18,.98))', border: '1px solid rgba(255,255,255,.1)', borderRadius: 18, padding: '18px 18px 22px', boxShadow: '0 24px 70px rgba(0,0,0,.6)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 900, color: '#fff' }}>{panel.title}</div>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,.5)', marginTop: 2 }}>{panel.subtitle}</div>
                    </div>
                    <button onClick={() => setActiveTemplateId(null)} style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 9, color: 'rgba(255,255,255,.7)', fontSize: 13, fontWeight: 800, cursor: 'pointer', padding: '7px 12px' }}>✕ Close</button>
                  </div>
                  {panel.render()}
                </div>
              ) : (
                <ProviderActionForm templateId={activeTemplateId} lang={lang} onClose={() => setActiveTemplateId(null)} onSuccess={() => {}} onError={() => {}} />
              )}
            </div>
          </div>
        )
      })()}
    </div>
  )
}

function PagerButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ padding: '6px 12px', borderRadius: 9, border: '1px solid rgba(255,255,255,.14)', background: disabled ? 'rgba(255,255,255,.02)' : 'rgba(255,255,255,.05)', color: disabled ? 'rgba(255,255,255,.25)' : '#1af0ff', fontSize: 14, fontWeight: 900, cursor: disabled ? 'default' : 'pointer' }}>
      {label}
    </button>
  )
}

function UtilityFrame({ id, lang }: { id: string; lang: Lang }) {
  const renderPage = signalboostConsoleUI.utilityPages[id]
  if (renderPage) return <>{renderPage()}</>
  return <div style={{ color: 'rgba(255,255,255,.6)' }}>Unknown page.</div>
}

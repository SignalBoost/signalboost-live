'use client'

// saas/components/hub/ProviderMapGrid.tsx
//
// Schema-driven provider sidebar/grid. Renders EVERY provider from the registry
// (provider-map.json), grouped by tier, and paints each card's Connected /
// Not Connected state from GET /api/hub/providers/status. Nothing here is
// hard-coded to a provider — add one to the JSON and it appears here.
//
// Drop-in: <ProviderMapGrid onSelect={(id) => openWorkspace(id)} />

import { useEffect, useState, type CSSProperties } from 'react'
import {
  getProvidersByTier,
  TIER_LABELS,
} from '@/console-core/providerRegistry'
import type { ProviderMeta } from '@/console-core/types'

type StatusEntry = {
  connected: boolean
  status: string
  missingRequired: string[]
  optionalPresent: string[]
}
type StatusMap = Record<string, StatusEntry>

export default function ProviderMapGrid({
  onSelect,
  hideDisconnected = false,
}: {
  onSelect?: (providerId: string) => void
  hideDisconnected?: boolean
}) {
  const byTier = getProvidersByTier()
  const [status, setStatus] = useState<StatusMap | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    fetch('/api/hub/providers/status')
      .then(r => r.json())
      .then(res => {
        if (!active) return
        if (res?.providers) setStatus(res.providers as StatusMap)
        else setLoadError('Status endpoint returned no providers')
      })
      .catch(() => active && setLoadError('Could not load provider status'))
    return () => { active = false }
  }, [])

  const tiers: (1 | 2 | 3 | 4)[] = [1, 2, 3, 4]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {loadError && (
        <div style={{ fontSize: 12, color: 'rgba(239,68,68,.85)' }}>{loadError}</div>
      )}
      {tiers.map(tier => {
        const providers = byTier[tier]
        if (!providers.length) return null
        return (
          <section key={tier}>
            <h3 style={tierHeadingStyle}>{TIER_LABELS[tier]}</h3>
            <div style={gridStyle}>
              {providers.map(p => {
                const s = status?.[p.id]
                const connected = !!s?.connected
                if (hideDisconnected && status && !connected) return null
                return (
                  <ProviderCard
                    key={p.id}
                    provider={p}
                    connected={connected}
                    loading={!status}
                    missing={s?.missingRequired || []}
                    onSelect={onSelect}
                  />
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function ProviderCard({
  provider,
  connected,
  loading,
  missing,
  onSelect,
}: {
  provider: ProviderMeta
  connected: boolean
  loading: boolean
  missing: string[]
  onSelect?: (id: string) => void
}) {
  const clickable = connected && !!onSelect
  const card: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '12px 14px',
    borderRadius: 12,
    border: `1px solid ${connected ? 'rgba(255,255,255,.14)' : 'rgba(255,255,255,.06)'}`,
    background: connected ? 'rgba(255,255,255,.035)' : 'rgba(255,255,255,.015)',
    borderLeft: `3px solid ${connected ? provider.accent : 'rgba(255,255,255,.12)'}`,
    opacity: loading ? 0.5 : connected ? 1 : 0.55,
    cursor: clickable ? 'pointer' : 'default',
    transition: 'opacity .15s, border-color .15s',
  }
  return (
    <div
      style={card}
      onClick={() => clickable && onSelect!(provider.id)}
      title={
        connected
          ? `${provider.displayName} — Connected`
          : `Not Connected — set ${missing.join(', ') || 'required env vars'}`
      }
    >
      <span style={{ fontSize: 22, lineHeight: 1 }}>{provider.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{provider.displayName}</div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,.45)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {provider.category}
        </div>
      </div>
      <StatusBadge connected={connected} loading={loading} />
    </div>
  )
}

function StatusBadge({ connected, loading }: { connected: boolean; loading: boolean }) {
  const color = loading ? 'rgba(255,255,255,.3)' : connected ? '#3ecf8e' : 'rgba(255,255,255,.25)'
  const label = loading ? '…' : connected ? 'Connected' : 'Not Connected'
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, boxShadow: connected ? `0 0 6px ${color}` : 'none' }} />
      <span style={{ fontSize: 10, letterSpacing: '.04em', textTransform: 'uppercase', color }}>{label}</span>
    </span>
  )
}

const tierHeadingStyle: CSSProperties = {
  fontSize: 11,
  letterSpacing: '.08em',
  textTransform: 'uppercase',
  color: 'rgba(26,240,255,.7)',
  margin: '0 0 12px 0',
  fontWeight: 600,
}
const gridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
  gap: 10,
}

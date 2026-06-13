'use client'

// saas/components/hub/pages/ProviderGridPage.tsx
// All Business Operating Partners in one searchable grid.
// Real data from provider-registry.ts + live actions from provider-templates.ts.

import { useMemo, useState } from 'react'
import { HUB_PROVIDERS, HUB_PROVIDER_TIERS, getProviderTemplates, type HubProviderTierId } from '@/lib/hub/provider-registry'
import ProviderActionLauncher from '../ProviderActionLauncher'
import { PageProps, cardStyle, labelStyle, TONES } from '../shared'

type FilterMode = 'all' | 'live' | 'ready' | 'planned'

const statusColor: Record<string, { dot: string; color: string }> = {
  live: { dot: '🟢', color: '#22c55e' },
  ready: { dot: '🟡', color: '#ffc300' },
  planned: { dot: '⚪', color: 'rgba(255,255,255,.5)' },
  attention: { dot: '🔴', color: '#ef4444' },
  error: { dot: '❌', color: '#ef4444' },
}

export default function ProviderGridPage({ lang }: PageProps) {
  const [filter, setFilter] = useState<FilterMode>('all')
  const [search, setSearch] = useState('')

  const filteredProviders = useMemo(() => {
    let result = HUB_PROVIDERS

    // Filter by status
    if (filter !== 'all') {
      result = result.filter(p => p.status === filter)
    }

    // Filter by search
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        p => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q) || p.description.toLowerCase().includes(q),
      )
    }

    return result
  }, [filter, search])

  const groupedByTier = useMemo(() => {
    const groups: Record<HubProviderTierId, typeof HUB_PROVIDERS> = {
      core: [],
      common: [],
      ai: [],
      devops: [],
      marketing: [],
    }
    filteredProviders.forEach(p => {
      groups[p.tier].push(p)
    })
    return groups
  }, [filteredProviders])

  const stats = {
    total: HUB_PROVIDERS.length,
    live: HUB_PROVIDERS.filter(p => p.status === 'live').length,
    ready: HUB_PROVIDERS.filter(p => p.status === 'ready').length,
    planned: HUB_PROVIDERS.filter(p => p.status === 'planned').length,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, gap: 12 }}>
      <style>{`
        .provider-grid-container { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
        .provider-card-item { min-height: 320px; }
        @media (max-width: 1200px) { .provider-grid-container { grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); } }
        @media (max-width: 760px) { .provider-grid-container { grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); } }
      `}</style>

      {/* Header */}
      <section style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', flexShrink: 0 }}>
        <div>
          <div style={labelStyle}>Operations & Production</div>
          <h2 style={{ margin: '3px 0 4px', fontSize: 24, letterSpacing: '-.02em' }}>All Operating Partners</h2>
          <p style={{ margin: 0, color: 'rgba(255,255,255,.58)', fontSize: 13.5, maxWidth: 840 }}>
            All {stats.total} providers. Search, filter, and execute actions directly from the grid.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 11.5, fontWeight: 600 }}>
          <span style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(34,197,94,.35)', background: 'rgba(34,197,94,.08)', color: '#86efac' }}>
            {stats.live} Live
          </span>
          <span style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(255,195,0,.35)', background: 'rgba(255,195,0,.08)', color: '#ffc300' }}>
            {stats.ready} Ready
          </span>
          <span style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,.15)', background: 'rgba(255,255,255,.04)', color: 'rgba(255,255,255,.6)' }}>
            {stats.planned} Planned
          </span>
        </div>
      </section>

      {/* Filter & Search */}
      <section style={{ ...cardStyle, flexShrink: 0, display: 'flex', gap: 12, padding: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Search providers..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            flex: 1,
            minWidth: 200,
            padding: '9px 12px',
            borderRadius: 10,
            border: '1px solid rgba(255,255,255,.15)',
            background: 'rgba(255,255,255,.04)',
            color: '#fff',
            fontSize: 13,
            outline: 'none',
          }}
        />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(['all', 'live', 'ready', 'planned'] as FilterMode[]).map(mode => (
            <button
              key={mode}
              onClick={() => setFilter(mode)}
              className="hub-chip"
              style={{
                padding: '7px 11px',
                borderRadius: 10,
                border: filter === mode ? '1px solid rgba(26,240,255,.42)' : '1px solid rgba(255,255,255,.14)',
                background: filter === mode ? 'rgba(26,240,255,.12)' : 'rgba(255,255,255,.04)',
                color: filter === mode ? '#1af0ff' : 'rgba(255,255,255,.68)',
                fontSize: 11.5,
                fontWeight: 900,
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {mode}
            </button>
          ))}
        </div>
      </section>

      {/* Results */}
      <main className="hub-panel" style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: 8 }}>
        {filteredProviders.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,.5)' }}>
            <div style={{ fontSize: 14, marginBottom: 8 }}>No providers match your search.</div>
            <button
              onClick={() => {
                setSearch('')
                setFilter('all')
              }}
              style={{
                padding: '8px 12px',
                borderRadius: 10,
                border: '1px solid rgba(255,255,255,.15)',
                background: 'rgba(255,255,255,.05)',
                color: 'rgba(255,255,255,.7)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Clear filters
            </button>
          </div>
        ) : (
          <>
            {HUB_PROVIDER_TIERS.map(tier => {
              const providers = groupedByTier[tier.id]
              if (providers.length === 0) return null

              return (
                <div key={tier.id} style={{ marginBottom: 24 }}>
                  <div style={{ ...labelStyle, marginBottom: 10, fontSize: 11 }}>
                    {tier.label} — {providers.length} provider{providers.length === 1 ? '' : 's'}
                  </div>
                  <div className="provider-grid-container">
                    {providers.map(provider => {
                      const templates = getProviderTemplates(provider.id)
                      const statusIcon = statusColor[provider.status]

                      return (
                        <article key={provider.id} className="provider-card-item hub-card" style={{ ...cardStyle, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                          {/* Header */}
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                              <span style={{ fontSize: 18 }}>{statusIcon.dot}</span>
                              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: '#fff' }}>{provider.name}</h3>
                            </div>
                            <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,.5)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                              {provider.category}
                            </div>
                            <div style={{ fontSize: 12, color: 'rgba(255,255,255,.65)', lineHeight: 1.4 }}>{provider.description}</div>
                          </div>

                          {/* Status badge */}
                          <div
                            style={{
                              padding: '6px 9px',
                              borderRadius: 8,
                              background: statusIcon.color + '14',
                              border: `1px solid ${statusIcon.color}33`,
                              fontSize: 11.5,
                              fontWeight: 700,
                              color: statusIcon.color,
                              textTransform: 'capitalize',
                            }}
                          >
                            {provider.status}
                          </div>

                          {/* Actions */}
                          <div style={{ marginTop: 'auto' }}>
                            {templates.length === 0 ? (
                              <div style={{ fontSize: 11, color: 'rgba(255,255,255,.45)' }}>No actions available</div>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {templates.slice(0, 2).map(template => (
                                  <div key={template.id} style={{ fontSize: 11, color: 'rgba(255,255,255,.7)' }}>
                                    <ProviderActionLauncher providerId={provider.id} lang={lang} label={template.label} variant="secondary" />
                                  </div>
                                ))}
                                {templates.length > 2 && (
                                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,.45)', paddingTop: 4 }}>
                                    +{templates.length - 2} more action{templates.length - 2 === 1 ? '' : 's'}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </article>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </>
        )}
      </main>
    </div>
  )
}

'use client'

// saas/components/hub/pages/ProviderExpansionPage.tsx
// Monitor 3 — Expansion Providers.
// This page does not repeat the live providers already shown in Dashboard or Vault.

import { useMemo, useState } from 'react'
import { PageProps, TONES, cardStyle, bodyStyle, labelStyle } from '../shared'
import { HUB_PROVIDER_TIERS, getHubProvidersByTier, HubProviderStatus, HubProviderTierId } from '@/lib/hub/provider-registry'

const excludedProviderIds = new Set(['stripe', 'supabase', 'vercel', 'openai'])

const badge: Record<HubProviderStatus, { text: string; bg: string; border: string; label: string }> = {
  live: { text: '#22c55e', bg: 'rgba(34,197,94,.10)', border: 'rgba(34,197,94,.35)', label: 'Live' },
  ready: { text: '#1af0ff', bg: 'rgba(26,240,255,.10)', border: 'rgba(26,240,255,.35)', label: 'Ready' },
  planned: { text: 'rgba(255,255,255,.62)', bg: 'rgba(255,255,255,.04)', border: 'rgba(255,255,255,.12)', label: 'Planned' },
  attention: { text: '#ffc300', bg: 'rgba(255,195,0,.10)', border: 'rgba(255,195,0,.35)', label: 'Attention' },
  error: { text: '#fca5a5', bg: 'rgba(239,68,68,.10)', border: 'rgba(239,68,68,.35)', label: 'Error' },
}

export default function ProviderExpansionPage(_props: PageProps) {
  const [selectedTier, setSelectedTier] = useState<HubProviderTierId>('core')
  const selected = HUB_PROVIDER_TIERS.find(t => t.id === selectedTier) || HUB_PROVIDER_TIERS[0]
  const providers = useMemo(() => {
    return getHubProvidersByTier(selectedTier).filter(provider => !excludedProviderIds.has(provider.id))
  }, [selectedTier])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, gap: 14 }}>
      <section style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12, flexShrink: 0 }}>
        <div>
          <div style={labelStyle}>Monitor 3</div>
          <h2 style={{ margin: '3px 0 4px', fontSize: 24, letterSpacing: '-.02em' }}>Expansion Providers</h2>
          <p style={{ margin: 0, color: 'rgba(255,255,255,.58)', fontSize: 13.5 }}>Future provider groups only. Supabase, Stripe, Vercel, and OpenAI stay in their live monitors.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ padding: '7px 11px', borderRadius: 999, background: 'rgba(26,240,255,.10)', border: '1px solid rgba(26,240,255,.35)', color: '#1af0ff', fontSize: 12.5, fontWeight: 700 }}>{providers.filter(p => p.status === 'ready').length} Ready</span>
          <span style={{ padding: '7px 11px', borderRadius: 999, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.12)', color: 'rgba(255,255,255,.62)', fontSize: 12.5, fontWeight: 700 }}>{providers.filter(p => p.status === 'planned').length} Planned</span>
        </div>
      </section>

      <section style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flexShrink: 0 }}>
        {HUB_PROVIDER_TIERS.map(tier => (
          <button key={tier.id} onClick={() => setSelectedTier(tier.id)} className="hub-chip" style={{ padding: '8px 12px', borderRadius: 12, border: selectedTier === tier.id ? `1px solid ${TONES.gold.border}` : '1px solid rgba(255,255,255,.12)', background: selectedTier === tier.id ? TONES.gold.soft : 'rgba(255,255,255,.04)', color: selectedTier === tier.id ? '#ffc300' : 'rgba(255,255,255,.68)', fontSize: 12.5, fontWeight: 800 }}>
            {tier.monitorLabel} · {tier.label}
          </button>
        ))}
      </section>

      <section style={{ ...cardStyle, flexShrink: 0 }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,.08)', background: 'linear-gradient(135deg, rgba(255,195,0,.10), rgba(3,7,18,0))' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={labelStyle}>{selected.monitorLabel}</div>
              <div style={{ fontSize: 18, fontWeight: 900 }}>{selected.label}</div>
            </div>
            <div style={{ color: 'rgba(255,255,255,.56)', fontSize: 13, maxWidth: 680 }}>{selected.description}</div>
          </div>
        </div>
      </section>

      <main className="hub-main" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, overflowY: 'auto', minHeight: 0, paddingBottom: 8 }}>
        {providers.map(provider => {
          const tone = badge[provider.status]
          return (
            <article key={provider.id} className="hub-card hub-panel" style={{ ...cardStyle, minHeight: 170 }}>
              <div style={{ padding: '13px 14px 10px', borderBottom: `1px solid ${tone.border}`, background: `linear-gradient(135deg, ${tone.bg}, rgba(3,7,18,0))` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 900 }}>{provider.name}</div>
                    <div style={{ color: 'rgba(255,255,255,.55)', fontSize: 12.5 }}>{provider.category}</div>
                  </div>
                  <span style={{ padding: '5px 9px', borderRadius: 999, border: `1px solid ${tone.border}`, background: tone.bg, color: tone.text, fontSize: 11.5, fontWeight: 900 }}>{tone.label}</span>
                </div>
              </div>
              <div style={bodyStyle}>
                <p style={{ margin: 0, color: 'rgba(255,255,255,.64)', fontSize: 12.8, lineHeight: 1.45 }}>{provider.description}</p>
              </div>
            </article>
          )
        })}
        {providers.length === 0 && (
          <section style={{ ...cardStyle, minHeight: 160, alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 20 }}>
            <div style={{ fontSize: 22, marginBottom: 6 }}>✅</div>
            <div style={{ fontWeight: 900 }}>No expansion providers in this tier</div>
            <div style={{ color: 'rgba(255,255,255,.55)', fontSize: 13, marginTop: 4 }}>Those live providers are already handled by the active monitors.</div>
          </section>
        )}
      </main>
    </div>
  )
}

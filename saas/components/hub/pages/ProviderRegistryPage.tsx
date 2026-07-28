// saas/components/hub/pages/ProviderRegistryPage.tsx
'use client'

// saas/components/hub/pages/ProviderRegistryPage.tsx
// Console Page 3 — Provider Registry / Expansion Map.
// Read-only planning monitor powered by the Hub provider registry.

import { useMemo, useState } from 'react'
import { PageProps, TONES, cardStyle, bodyStyle, labelStyle } from '../shared.tsx'
import { HUB_PROVIDER_TIERS, getHubProvidersByTier, HubProviderStatus } from '@/lib/hub/provider-registry'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


// Native per-language copy for this console page. `lang` arrives via PageProps.
const COPY: Record<string, Record<string, string>> = {
  monitor3: { en: uiCopy('u_c9a2c7a9d8ac0801'), es: 'Monitor 3', pt: 'Monitor 3', pl: 'Monitor 3', ru: 'Монитор 3' },
  title: { en: uiCopy('u_855f5904d6117cbb'), es: 'Registro de proveedores', pt: 'Registro de provedores', pl: 'Rejestr dostawców', ru: 'Реестр провайдеров' },
  desc: {
    en: uiCopy('u_e7e71e609fe6dcae'),
    es: 'Mapa de expansión para la consola de operaciones SaaS multimonitor. Capa de planificación de solo lectura.',
    pt: 'Mapa de expansão para o console de operações SaaS multimonitor. Camada de planejamento somente leitura.',
    pl: 'Mapa rozwoju dla wielomonitorowej konsoli operacji SaaS. Warstwa planowania tylko do odczytu.',
    ru: 'Карта расширения для многомониторной консоли операций SaaS. Слой планирования только для чтения.',
  },
  credentialPatterns: { en: uiCopy('u_79781e262ffb36b4'), es: 'Patrones de credenciales', pt: 'Padrões de credenciais', pl: 'Wzorce poświadczeń', ru: 'Шаблоны учётных данных' },
  policyActions: { en: uiCopy('u_36ee838c7521ce95'), es: 'Acciones de política', pt: 'Ações de política', pl: 'Akcje zasad', ru: 'Действия политики' },
}
function tx(key: string, lang: string): string {
  return COPY[key]?.[lang] ?? COPY[key]?.en ?? key
}

const statusTone: Record<HubProviderStatus, { text: string; bg: string; border: string; label: string }> = {
  live: { text: '#22c55e', bg: 'rgba(34,197,94,.10)', border: 'rgba(34,197,94,.35)', label: uiCopy('u_a4edf2eee077200a') },
  ready: { text: uiCopy('u_1db542a86469b1aa'), bg: 'rgba(26,240,255,.10)', border: 'rgba(26,240,255,.35)', label: uiCopy('u_9ae5843e8d047eae') },
  planned: { text: uiCopy('u_7b80c633cdf5a0a9'), bg: 'rgba(255,255,255,.04)', border: 'rgba(255,255,255,.12)', label: uiCopy('u_1ba3cd0c50cfd709') },
  attention: { text: uiCopy('u_61fdde968368acba'), bg: 'rgba(255,195,0,.10)', border: 'rgba(255,195,0,.35)', label: uiCopy('u_972b21851114ade0') },
  error: { text: uiCopy('u_ed50d0815f330aa8'), bg: 'rgba(239,68,68,.10)', border: 'rgba(239,68,68,.35)', label: uiCopy('u_ddfb877067074a50') },
}

export default function ProviderRegistryPage({ lang }: PageProps) {
  const [selectedTier, setSelectedTier] = useState(HUB_PROVIDER_TIERS[0]?.id || 'core')
  const selected = HUB_PROVIDER_TIERS.find(t => t.id === selectedTier) || HUB_PROVIDER_TIERS[0]
  const providers = useMemo(() => getHubProvidersByTier(selectedTier), [selectedTier])
  const liveCount = providers.filter(p => p.status === 'live').length
  const readyCount = providers.filter(p => p.status === 'ready').length
  const plannedCount = providers.filter(p => p.status === 'planned').length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, gap: 14 }}>
      <section style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12, flexShrink: 0 }}>
        <div>
          <div style={labelStyle}>{tx(uiCopy('u_9f707526c5cd59cf'), lang)}</div>
          <h2 style={{ margin: '3px 0 4px', fontSize: 24, letterSpacing: '-.02em' }}>{tx(uiCopy('u_5497ffd41f7535d0'), lang)}</h2>
          <p style={{ margin: 0, color: 'rgba(255,255,255,.58)', fontSize: 13.5 }}>{tx(uiCopy('u_b98c662442fb6306'), lang)}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ padding: '7px 11px', borderRadius: 999, background: statusTone.live.bg, border: `1px solid ${statusTone.live.border}`, color: statusTone.live.text, fontSize: 12.5, fontWeight: 700 }}>{liveCount}{uiCopy('u_3c7167199ccc5abf')}</span>
          <span style={{ padding: '7px 11px', borderRadius: 999, background: statusTone.ready.bg, border: `1px solid ${statusTone.ready.border}`, color: statusTone.ready.text, fontSize: 12.5, fontWeight: 700 }}>{readyCount}{uiCopy('u_ae457b1cd0e55681')}</span>
          <span style={{ padding: '7px 11px', borderRadius: 999, background: statusTone.planned.bg, border: `1px solid ${statusTone.planned.border}`, color: statusTone.planned.text, fontSize: 12.5, fontWeight: 700 }}>{plannedCount}{uiCopy('u_edf82f17643caf18')}</span>
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
          const tone = statusTone[provider.status]
          return (
            <article key={provider.id} className="hub-card hub-panel" style={{ ...cardStyle, minHeight: 220 }}>
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
                <div style={labelStyle}>{tx(uiCopy('u_045ca044acc33a85'), lang)}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {provider.keyPatterns.map(pattern => <span key={pattern} style={{ padding: '4px 8px', borderRadius: 999, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.04)', color: 'rgba(255,255,255,.68)', fontSize: 11 }}>{pattern}</span>)}
                </div>
                <div style={labelStyle}>{tx(uiCopy('u_83a6dffe59d89fdb'), lang)}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {provider.primaryActions.map(action => <span key={action} style={{ padding: '4px 8px', borderRadius: 999, border: '1px solid rgba(26,240,255,.18)', background: 'rgba(26,240,255,.06)', color: 'rgba(26,240,255,.72)', fontSize: 11 }}>{action.replaceAll('_', ' ')}</span>)}
                </div>
              </div>
            </article>
          )
        })}
      </main>
    </div>
  )
}

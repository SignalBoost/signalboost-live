// saas/press-media-core/adapters/ad-platform.ts
// AD PLATFORM — paid budgeted distribution (Google Ads, LinkedIn Ads, Meta, Taboola, Outbrain).
// BYO money: the campaign runs on the BUYER'S OWN ad account; the platform never fronts spend.
// Host-agnostic: no SDKs, no hand-rolled HTTP, no key handling — it names registered actions
// ('create_campaign', 'fetch_report') that the host executes through the canonical universal
// runner (provider_registry config + vault-resolved credentials). A new ad network = a row.
import type { MediaProviderAdapter, PortBundle, RunnerProviderConfig } from '../types'

const PROVIDER_ID = 'ad_platform'

async function loadCfg(ports: PortBundle): Promise<RunnerProviderConfig | null> {
  if (!ports.runner) return null
  try { return await ports.runner.loadConfig(PROVIDER_ID) } catch { return null }
}

// Budget is per-campaign: the brief may set it, else fall back to the connection default.
function budgetFor(campaign: any, cfg: RunnerProviderConfig | null): number {
  const raw = campaign?.metadata?.budget ?? campaign?.brief?.budget
  const fromBrief = typeof raw === 'number' ? raw : parseFloat(String(raw || ''))
  if (Number.isFinite(fromBrief) && fromBrief > 0) return fromBrief
  return cfg ? cfg.priceCents / 100 : 0
}

export function createAdPlatformAdapter(): MediaProviderAdapter {
  return {
    describe() {
      return {
        id: PROVIDER_ID,
        label: 'Ad platform',
        type: 'ad_platform',
        cost: 'budget',
        proof: 'ad_report',
        needs: ['provider_registry row', 'oauth/api credential', 'budget'],
        supportsTargets: ['digital_press', 'trade_press', 'broadcast'],
      }
    },

    async connect(_config, ports) {
      const cfg = await loadCfg(ports)
      if (!cfg?.connected) return { ok: false, error: 'No active ad_platform provider_registry row — connect an ad account first.' }
      return { ok: true }
    },

    async generate(brief, ports) {
      return ports.ai.generate(brief, {
        format: 'display_ad',
        maxChars: 600,
        tone: 'punchy, benefit-led ad copy; no unverifiable claims, no superlatives that break ad policy',
        notes: 'Write ad copy for a paid placement: a short headline, a one-line primary text, and a clear call to action.',
      })
    },

    async validateTarget(_target, ports) {
      if (!ports.runner) return { ok: false, reason: 'This host has no provider runner configured.' }
      const cfg = await loadCfg(ports)
      if (!cfg?.connected) return { ok: false, reason: 'Connect an ad account first (author its provider_registry row + credential).' }
      return { ok: true }
    },

    // Budget IS the cost — it always hits the spend gate; it never silently bypasses it.
    async estimateCost(campaign, ports) {
      const cfg = await loadCfg(ports)
      return { amount: budgetFor(campaign, cfg), currency: cfg?.currency || 'USD' }
    },

    // Ad campaigns are created, then run over time — 'scheduled', not 'published'. The buyer's
    // ad account is charged directly; no URL is invented, the report is the proof.
    async dispatch(campaign, ports) {
      if (!ports.runner) return { state: 'failed', ref: '', detail: 'No provider runner on this host.' }
      const cfg = await loadCfg(ports)
      const budget = budgetFor(campaign, cfg)
      if (!(budget > 0)) return { state: 'failed', ref: '', detail: 'No budget set for this ad campaign.' }

      const res = await ports.runner.run(PROVIDER_ID, 'create_campaign', {
        name: campaign.brief.goal || 'Press campaign',
        creative: campaign.creative,
        cta_url: campaign.brief.ctaUrl || '',
        audience: campaign.brief.audience || '',
        language: campaign.brief.language || 'en',
        budget,
        currency: cfg?.currency || 'USD',
        external_ref: campaign.id,
      })
      if (!res.ok) return { state: 'failed', ref: '', detail: res.error || 'Ad campaign creation failed.' }
      const ref = res.ref || String(res.outputs?.id || `ad:${campaign.id}`)
      await ports.notify.notifyOwner('scheduled', campaign).catch(() => {})
      return { state: 'scheduled', ref, detail: 'Ad campaign created on your ad account.' }
    },

    // Real-time ad report; stays pending while the campaign is still delivering.
    async fetchProof(ref, ports) {
      if (!ports.runner) return { proofType: 'ad_report', payload: null, pending: true }
      try {
        const res = await ports.runner.run(PROVIDER_ID, 'fetch_report', { ref })
        if (!res.ok) return { proofType: 'ad_report', payload: null, pending: true }
        const status = String(res.outputs?.status || '')
        const done = Boolean(res.outputs?.completed) || status === 'completed' || status === 'ended'
        return { proofType: 'ad_report', payload: res.outputs ?? null, pending: !done }
      } catch {
        return { proofType: 'ad_report', payload: null, pending: true }
      }
    },
  }
}

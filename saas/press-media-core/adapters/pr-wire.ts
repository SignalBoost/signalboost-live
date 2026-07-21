// saas/press-media-core/adapters/pr-wire.ts
// PR WIRE distribution — the first PAID reference adapter (Business Wire, PR Newswire, EIN
// Presswire, GlobeNewswire, PRWeb). BYO-money: it drives the buyer's OWN wire account.
// DOCTRINE-COMPLIANT: it does NOT hand-roll HTTP and never touches a key. It names two
// registered actions ('submit_release', 'fetch_report') and the HOST runs them through the
// platform's canonical universal runner (provider_registry config + vault/env secret
// resolution). Adding a wire brand = a provider_registry row, not code. Host-agnostic:
// imports only the contract.
import type { MediaProviderAdapter, PortBundle, RunnerProviderConfig } from '../types'

const PROVIDER_ID = 'pr_wire'

async function loadCfg(ports: PortBundle): Promise<RunnerProviderConfig | null> {
  if (!ports.runner) return null
  try { return await ports.runner.loadConfig(PROVIDER_ID) } catch { return null }
}

export function createPrWireAdapter(): MediaProviderAdapter {
  return {
    describe() {
      return {
        id: 'pr_wire',
        label: 'PR wire distribution',
        type: 'pr_wire',
        cost: 'per_release',
        proof: 'distribution_report',
        needs: ['provider_registry row', 'vault/env API key'],
        supportsTargets: ['digital_press', 'trade_press', 'newspaper_print', 'magazine_print'],
      }
    },

    // Connected = an active pr_wire provider_registry row exists on this host.
    async connect(_config, ports) {
      const cfg = await loadCfg(ports)
      if (!cfg || !cfg.connected) return { ok: false, error: 'No active pr_wire provider_registry row — connect a wire brand first.' }
      return { ok: true }
    },

    async generate(brief, ports) {
      return ports.ai.generate(brief, {
        format: 'press_release',
        maxChars: 3200,
        tone: 'formal, wire-ready, newsworthy; no guaranteed-results claims',
        notes: 'Write a complete newswire press release: headline, dateline, body, and a short boilerplate.',
      })
    },

    // Paid providers require a live connection before a target is valid — no invented sends.
    async validateTarget(_target, ports) {
      if (!ports.runner) return { ok: false, reason: 'This host has no provider runner configured.' }
      const cfg = await loadCfg(ports)
      if (!cfg || !cfg.connected) return { ok: false, reason: 'Connect a PR-wire brand first (author its provider_registry row + key).' }
      return { ok: true }
    },

    // Real per-release price comes from the provider_registry row's metadata (feeds the spend gate).
    async estimateCost(_campaign, ports) {
      const cfg = await loadCfg(ports)
      return { amount: cfg ? cfg.priceCents / 100 : 0, currency: cfg?.currency || 'USD' }
    },

    // Submit through the universal runner. Never fabricates a URL — distribution is the wire's job.
    async dispatch(campaign, ports) {
      if (!ports.runner) return { state: 'failed', ref: '', detail: 'No provider runner on this host.' }
      const res = await ports.runner.run(PROVIDER_ID, 'submit_release', {
        headline: campaign.brief.goal || 'Press release',
        body: campaign.creative,
        cta_url: campaign.brief.ctaUrl || '',
        language: campaign.brief.language || 'en',
        distribution: campaign.target.publicationName || campaign.target.mediaTargetType,
        external_ref: campaign.id,
      })
      if (!res.ok) return { state: 'failed', ref: '', detail: res.error || 'Wire submission failed.' }
      const ref = res.ref || String(res.outputs?.ref || res.outputs?.id || `prwire:${campaign.id}`)
      await ports.notify.notifyOwner('submitted', campaign).catch(() => {})
      return { state: 'submitted', ref, detail: 'Submitted to the wire for distribution.' }
    },

    // Poll the wire's report action; stays pending until it reports distributed/published.
    async fetchProof(ref, ports) {
      if (!ports.runner) return { proofType: 'distribution_report', payload: null, pending: true }
      try {
        const res = await ports.runner.run(PROVIDER_ID, 'fetch_report', { ref })
        if (!res.ok) return { proofType: 'distribution_report', payload: null, pending: true }
        const status = String(res.outputs?.status || '')
        const done = Boolean(res.outputs?.completed) || status === 'distributed' || status === 'published'
        return { proofType: 'distribution_report', payload: res.outputs ?? null, pending: !done }
      } catch {
        return { proofType: 'distribution_report', payload: null, pending: true }
      }
    },
  }
}

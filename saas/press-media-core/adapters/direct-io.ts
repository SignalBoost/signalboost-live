// saas/press-media-core/adapters/direct-io.ts
// DIRECT INSERTION ORDER — print, IT magazines, TV, radio booked through a publisher's ad-sales
// desk or a media-buying agency. This channel is INHERENTLY MANUAL: there is no API to call, so
// the adapter models the real workflow (send the insertion-order request to the sales contact,
// then wait for a tearsheet/affidavit) rather than pretending to automate it. It dispatches via
// the injected EmailPort — no HTTP, no key. Proof arrives weeks later and the owner records it.
import type { MediaProviderAdapter, PortBundle, RunnerProviderConfig } from '../types.ts'

const PROVIDER_ID = 'direct_io'

async function loadCfg(ports: PortBundle): Promise<RunnerProviderConfig | null> {
  if (!ports.runner) return null
  try { return await ports.runner.loadConfig(PROVIDER_ID) } catch { return null }
}

function salesContact(target: any): string {
  return String(target?.salesEmail || target?.editorEmail || '').trim()
}

function escapeHtml(value: string) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function createDirectIoAdapter(): MediaProviderAdapter {
  return {
    describe() {
      return {
        id: PROVIDER_ID,
        label: 'Direct insertion order',
        type: 'direct_io',
        cost: 'insertion_order',
        proof: 'tearsheet',
        needs: ['provider_registry row (rate + currency)', 'publisher or agency sales email'],
        supportsTargets: ['newspaper_print', 'magazine_print', 'trade_press', 'broadcast'],
      }
    },

    async connect(_config, ports) {
      const cfg = await loadCfg(ports)
      if (!cfg?.connected) return { ok: false, error: 'No active direct_io provider_registry row — record the publisher/agency rate first.' }
      return { ok: true }
    },

    async generate(brief, ports) {
      return ports.ai.generate(brief, {
        format: 'classified',
        maxChars: 1400,
        tone: 'clear, print-ready advertising copy; concise enough for a booked column or spot',
        notes: 'Write copy for a paid print/broadcast placement, plus a one-line summary the ad-sales desk can quote on the insertion order.',
      })
    },

    // Requires BOTH a live connection (so the rate is known and the spend gate can bind) and a
    // real sales contact. Without the rate this would look free and skip budget approval.
    async validateTarget(target, ports) {
      const cfg = await loadCfg(ports)
      if (!cfg?.connected) return { ok: false, reason: 'Connect this publisher/agency first so its rate is on file (an insertion order is paid).' }
      if (!cfg.priceCents) return { ok: false, reason: 'This publisher has no rate recorded — set the insertion-order rate before booking.' }
      if (!salesContact(target)) return { ok: false, reason: 'A real ad-sales or agency contact email is required — never invent a booking contact.' }
      return { ok: true }
    },

    async estimateCost(_campaign, ports) {
      const cfg = await loadCfg(ports)
      return { amount: cfg ? cfg.priceCents / 100 : 0, currency: cfg?.currency || 'USD' }
    },

    // Sends the insertion-order request to the sales desk. 'submitted' — the publisher schedules
    // the run; nothing is published yet and no URL is ever fabricated.
    async dispatch(campaign, ports) {
      const to = salesContact(campaign.target)
      if (!to) return { state: 'failed', ref: '', detail: 'No ad-sales contact on this target.' }
      const cfg = await loadCfg(ports)
      const rate = cfg ? `${(cfg.priceCents / 100).toFixed(2)} ${cfg.currency}` : 'as agreed'
      const publication = campaign.target.publicationName || campaign.target.mediaTargetType

      const html = [
        `<p>Insertion order request — <strong>${escapeHtml(String(publication))}</strong></p>`,
        `<p>Reference: ${escapeHtml(campaign.id)}<br/>Agreed rate: ${escapeHtml(rate)}</p>`,
        `<p>Requested copy:</p><blockquote>${escapeHtml(campaign.creative).replace(/\n/g, '<br/>')}</blockquote>`,
        campaign.brief.ctaUrl ? `<p>Call to action: ${escapeHtml(campaign.brief.ctaUrl)}</p>` : '',
        '<p>Please confirm the booking, the run date, and send a tearsheet or affidavit once it has run.</p>',
      ].filter(Boolean).join('')

      const sent = await ports.email.send({
        to,
        subject: `Insertion order request — ${String(publication)} (ref ${campaign.id})`,
        html,
      })
      if (!sent.ok) return { state: 'failed', ref: '', detail: sent.error ? `Could not send the insertion-order request: ${sent.error}` : 'Could not send the insertion-order request.' }
      await ports.notify.notifyOwner('submitted', campaign).catch(() => {})
      return { state: 'submitted', ref: sent.id || `io:${campaign.id}`, detail: 'Insertion-order request sent to the ad-sales desk.' }
    },

    // A tearsheet is a physical/scanned artifact that arrives weeks later — there is nothing to
    // poll. It stays pending until the owner records the proof.
    async fetchProof() {
      return { proofType: 'tearsheet', payload: null, pending: true }
    },
  }
}

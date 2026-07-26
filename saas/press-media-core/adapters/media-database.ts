// saas/press-media-core/adapters/media-database.ts
// MEDIA DATABASE — Cision, Muck Rack, Meltwater, Prowly, Agility PR. This provider does NOT
// distribute anything: it supplies VERIFIED journalist contacts. Per the design, its job is to
// feed validateTarget so the other providers only ever send to real, verified outlets. It
// therefore verifies targets through the universal runner ('verify_contact') and REFUSES to
// dispatch — an honest 'rejected' beats pretending a subscription can publish a release.
import type { MediaProviderAdapter, PortBundle, MediaTarget, RunnerProviderConfig } from '../types.ts'

const PROVIDER_ID = 'media_database'

async function loadCfg(ports: PortBundle): Promise<RunnerProviderConfig | null> {
  if (!ports.runner) return null
  try { return await ports.runner.loadConfig(PROVIDER_ID) } catch { return null }
}

function contactOf(target: MediaTarget): string {
  return String(target.editorEmail || target.submitFormUrl || '').trim()
}

// Shared helper: verify a target against a connected media database. Other adapters' hosts can
// call this before dispatch so "real targets only" is enforced by data, not by hope.
export async function verifyTargetAgainstDatabase(target: MediaTarget, ports: PortBundle): Promise<{ ok: boolean; reason?: string; record?: unknown }> {
  if (!ports.runner) return { ok: false, reason: 'No provider runner on this host.' }
  const cfg = await loadCfg(ports)
  if (!cfg?.connected) return { ok: false, reason: 'No media database connected.' }
  const contact = contactOf(target)
  if (!contact) return { ok: false, reason: 'No contact to verify.' }
  try {
    const res = await ports.runner.run(PROVIDER_ID, 'verify_contact', {
      contact,
      publication: target.publicationName || '',
      beat: String((target as any).beat || ''),
    })
    if (!res.ok) return { ok: false, reason: res.error || 'Verification lookup failed.' }
    const found = Boolean(res.outputs?.found ?? res.outputs?.verified)
    return found
      ? { ok: true, record: res.outputs }
      : { ok: false, reason: 'This contact is not in the media database — do not send to an unverified outlet.' }
  } catch (err: any) {
    return { ok: false, reason: err?.message || 'Verification lookup failed.' }
  }
}

export function createMediaDatabaseAdapter(): MediaProviderAdapter {
  return {
    describe() {
      return {
        id: PROVIDER_ID,
        label: 'Media database',
        type: 'media_database',
        cost: 'free',                 // the subscription is flat and billed by the vendor, not per campaign
        proof: 'none',                // it verifies contacts; it never publishes, so there is no proof artifact
        needs: ['provider_registry row', 'api key'],
        supportsTargets: ['digital_press', 'newspaper_print', 'magazine_print', 'trade_press', 'broadcast'],
      }
    },

    async connect(_config, ports) {
      const cfg = await loadCfg(ports)
      if (!cfg?.connected) return { ok: false, error: 'No active media_database provider_registry row — connect your subscription first.' }
      return { ok: true }
    },

    // Nothing to write: this provider supplies contacts, it does not produce creative.
    async generate() {
      return { creative: '' }
    },

    // The whole point of this adapter: verified-contact validation.
    async validateTarget(target, ports) {
      const result = await verifyTargetAgainstDatabase(target, ports)
      return result.ok ? { ok: true } : { ok: false, reason: result.reason }
    },

    // Flat subscription billed by the vendor — no per-campaign charge to gate.
    async estimateCost(_campaign, ports) {
      const cfg = await loadCfg(ports)
      return { amount: 0, currency: cfg?.currency || 'USD' }
    },

    // Explicitly refuses to distribute. Use it to verify targets, then dispatch via a real
    // distribution provider (free_submission / pr_wire / ad_platform / direct_io).
    async dispatch() {
      return {
        state: 'rejected',
        ref: '',
        detail: 'A media database supplies verified contacts; it does not distribute. Verify the target here, then send it through a distribution provider.',
      }
    },

    async fetchProof() {
      return { proofType: 'none', payload: null, pending: false }
    },
  }
}

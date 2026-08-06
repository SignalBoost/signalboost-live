// saas/press-media-core/adapters/free-submission.ts
// FREE editor submission — the reference adapter. Zero cost, no connect step. It submits
// the AI-generated release to a VERIFIED editor email via the injected EmailPort. Proof is
// a maybe-URL: the editor decides if/when to run it, so dispatch returns 'submitted' and
// fetchProof stays pending until an owner records the published link. It NEVER invents a
// publication and NEVER fabricates a published URL.
import type { MediaProviderAdapter } from '../types.ts'

function escapeHtml(value: string): string {
  return String(value).replace(/[&<>]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'))
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export function createFreeSubmissionAdapter(): MediaProviderAdapter {
  return {
    describe() {
      return {
        id: 'free_submission',
        label: 'Free editor submission',
        type: 'free_submission',
        cost: 'free',
        proof: 'maybe_url',
        needs: ['editor_email_or_submit_form'],
        supportsTargets: ['digital_press', 'newspaper_print', 'magazine_print', 'trade_press'],
      }
    },

    async connect() {
      return { ok: true }   // free: nothing to connect / no billing
    },

    async generate(brief, ports) {
      return ports.ai.generate(brief, {
        format: 'press_release',
        maxChars: 2400,
        tone: 'newsworthy and factual; no guaranteed-results claims',
        notes: 'Free press submission. Write a complete, self-contained release an editor could run as-is.',
      })
    },

    async validateTarget(target) {
      const email = String(target.editorEmail || '').trim()
      const form = String(target.submitFormUrl || '').trim()
      if (!email && !form) {
        return { ok: false, reason: 'A verified editor email OR a real submit-news/contact form is required. Free press never uses invented targets.' }
      }
      if (email && !EMAIL_RE.test(email)) return { ok: false, reason: 'Editor email is not a valid address.' }
      return { ok: true }
    },

    async estimateCost() {
      return { amount: 0, currency: 'USD' }   // always free → bypasses the spend gate
    },

    async dispatch(campaign, ports) {
      const email = String(campaign.target.editorEmail || '').trim()
      if (!email) {
        return { state: 'failed', ref: '', detail: 'No editor email; free submission needs a verified editor contact.' }
      }
      const subject = `Press release${campaign.target.publicationName ? ` for ${campaign.target.publicationName}` : ' for your consideration'}`
      const sent = await ports.email.send({
        to: email,
        subject,
        html: `<pre style="font-family:inherit;white-space:pre-wrap">${escapeHtml(campaign.creative)}</pre>`,
      })
      if (!sent.ok) return { state: 'failed', ref: '', detail: sent.error ? `Editor email failed to send: ${sent.error}` : 'Editor email failed to send.' }
      await ports.notify.notifyOwner('submitted', campaign).catch(() => {})
      // Prefer the transport's own message id: `free:<campaign id>` was derived from data we
      // already had, so it could be produced whether or not anything was ever sent.
      return { state: 'submitted', ref: sent.id || `free:${campaign.id}`, detail: `Submitted to ${email}` }
    },

    async fetchProof() {
      // The editor decides. No automatic URL — stays pending until an owner records the
      // published link. NEVER fabricate a URL.
      return { proofType: 'maybe_url', payload: null, pending: true }
    },
  }
}

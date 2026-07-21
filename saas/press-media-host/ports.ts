// saas/press-media-host/ports.ts
// Press & Media portable — REAL Ports for the SignalBoost host. The core adapters are
// host-agnostic and never import these; the host injects them. Swapping host (a buyer's
// platform) means swapping this file, not the engine or the adapters.
//   AiPort          → the platform model router (callModel, Claude↔OpenAI fallback)
//   EmailPort       → Resend
//   OwnerNotifyPort → two-stage owner email via Resend ('submitted'/'scheduled' now,
//                     'published' once a provider confirms the outcome)
import { Resend } from 'resend'
import { callModel } from '@/lib/ai/modelRouter'
import type {
  AiPort, EmailPort, OwnerNotifyPort, PortBundle,
  CampaignBrief, GenerateSpec, MediaCampaign, DispatchState, ProofResult,
} from '@/press-media-core'

const FROM = process.env.RESEND_FROM_EMAIL || 'SignalBoost Press <press@signalboostapp.com>'

function ownerEmail(): string {
  return process.env.OWNER_EMAIL || process.env.SIGNALBOOST_OWNER_EMAIL || ''
}

function resendClient(): Resend | null {
  const key = process.env.RESEND_API_KEY
  return key ? new Resend(key) : null
}

// ── AiPort: generate the release / ad through the platform model router ──
export function createAiPort(): AiPort {
  return {
    async generate(brief: CampaignBrief, spec: GenerateSpec): Promise<{ creative: string }> {
      const system = [
        'You are a senior press & media copywriter.',
        `Produce a ${spec.format.replace(/_/g, ' ')}.`,
        spec.tone ? `Tone: ${spec.tone}.` : '',
        spec.notes || '',
        spec.maxChars ? `Keep it under ${spec.maxChars} characters.` : '',
        'Return only the finished copy — no preamble, no notes, no markdown code fences.',
      ].filter(Boolean).join('\n')

      const prompt = [
        `Goal: ${brief.goal}`,
        brief.audience ? `Audience: ${brief.audience}` : '',
        brief.ctaUrl ? `Call-to-action URL: ${brief.ctaUrl}` : '',
        brief.language ? `Write in this language: ${brief.language}` : '',
      ].filter(Boolean).join('\n')

      const maxTokens = spec.maxChars ? Math.min(4096, Math.ceil(spec.maxChars / 2) + 400) : 2048
      const text = await callModel({ prompt, systemPrompt: system, maxTokens })
      return { creative: (text || '').trim() }
    },
  }
}

// ── EmailPort: send through Resend (editor submission, etc.), BCC the owner ──
export function createEmailPort(): EmailPort {
  return {
    async send(input: { to: string; subject: string; html: string }): Promise<{ ok: boolean }> {
      const resend = resendClient()
      if (!resend) return { ok: false }
      try {
        await resend.emails.send({
          from: FROM,
          to: input.to,
          bcc: ownerEmail() || undefined,
          subject: input.subject,
          html: input.html,
        })
        return { ok: true }
      } catch {
        return { ok: false }
      }
    },
  }
}

// ── OwnerNotifyPort: two-stage owner notification. Never fabricates a published URL. ──
export function createOwnerNotifyPort(): OwnerNotifyPort {
  return {
    async notifyOwner(stage: DispatchState, campaign: MediaCampaign, proof?: ProofResult): Promise<void> {
      const to = ownerEmail()
      const resend = resendClient()
      if (!to || !resend) return
      const published = stage === 'published'
      const targetLabel =
        campaign.target.publicationName ||
        campaign.target.editorEmail ||
        campaign.target.submitFormUrl ||
        campaign.target.mediaTargetType
      const proofLine = !proof
        ? ''
        : proof.pending
          ? 'Proof: pending — the provider has not confirmed a result yet.'
          : `Proof (${proof.proofType}): ${JSON.stringify(proof.payload)}`
      const lines = [
        published
          ? 'A press & media campaign has been confirmed PUBLISHED by the provider.'
          : `A press & media campaign has been ${stage.toUpperCase()} and is awaiting the provider outcome.`,
        `Campaign: ${campaign.id}`,
        `Provider: ${campaign.providerId}`,
        `Target: ${targetLabel}`,
        proofLine,
      ].filter(Boolean)
      try {
        await resend.emails.send({
          from: FROM,
          to,
          subject: published ? `Press campaign published: ${campaign.id}` : `Press campaign ${stage}: ${campaign.id}`,
          text: lines.join('\n'),
        })
      } catch {
        /* notify is best-effort; never block dispatch on a notify failure */
      }
    },
  }
}

// ── Bundle the real Ports (optionally with a provider's connected credentials) ──
export function createHostPorts(config?: Record<string, string>): PortBundle {
  return {
    ai: createAiPort(),
    email: createEmailPort(),
    notify: createOwnerNotifyPort(),
    config,
  }
}

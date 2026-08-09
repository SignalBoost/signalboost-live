// saas/press-media-host/ports.ts
// Press & Media portable — REAL Ports for the SignalBoost host. The core adapters are
// host-agnostic and never import these; the host injects them. Swapping host (a buyer's
// platform) means swapping this file, not the engine or the adapters.
//   AiPort          → COS text gateway (provider-neutral)
//   EmailPort       → Resend
//   OwnerNotifyPort → two-stage owner email via Resend ('submitted'/'scheduled' now,
//                     'published' once a provider confirms the outcome)
import { Resend } from 'resend'
import { createPlatformAiPort } from '@/lib/cos/aiPort'
import { runUniversalProvider } from '@/lib/engine/universalRunner'
import { getAdminSupabase } from '@/utils/supabase/server'
import { resolvePressProviderKey } from '@/lib/agency/pressProviderConnect'
import { resolveCompanyFacts } from '@/lib/portable/companyIdentity'
import { buildFactualPreamble, type CompanyFacts } from '@/press-media-core'
import { discoverPublishers } from '@/lib/marketing/publisherDiscovery'
import type { CompanyProfilePort } from '@/press-media-core'
import type {
  AiPort, DiscoveryPort, EmailPort, OwnerNotifyPort, PortBundle, RunnerPort, RunnerResult, RunnerProviderConfig,
  CampaignBrief, GenerateSpec, MediaCampaign, DispatchState, ProofResult,
} from '@/press-media-core'

const ai = createPlatformAiPort()
const FROM = process.env.RESEND_FROM_EMAIL || 'SignalBoost Partners <saaspartners@signalboostapp.com>'

function addressOf(value: string): string {
  const match = String(value || '').match(/<([^>]+)>/)
  return (match ? match[1] : value).trim()
}

function senderFrom(facts: CompanyFacts | null): string {
  const address = addressOf(FROM)
  const brand = String(facts?.brandName || facts?.legalName || '').trim()
  const person = String(facts?.spokespersonName || '').trim()
  const title = String(facts?.spokespersonTitle || '').trim()
  let display = ''
  if (person) display = title ? `${person}, ${title}${brand ? ` · ${brand}` : ''}` : `${person}${brand ? ` · ${brand}` : ''}`
  else if (brand) display = `${brand} Press Office`
  if (!display) return FROM
  return `${display.replace(/["<>]/g, '')} <${address}>`
}

function replyToAddress(): string | undefined {
  const explicit = String(process.env.PRESS_REPLY_TO || '').trim()
  if (explicit) return explicit
  const partners = addressOf(String(process.env.PRESS_CONTACT_EMAIL || process.env.PARTNERS_REPLY_TO || PRESS_CONTACT_FALLBACK))
  if (partners) return partners
  const owner = ownerEmail()
  return owner || undefined
}

const PRESS_CONTACT_FALLBACK = 'saaspartners@signalboostapp.com'

function mediaContactBlock(facts: CompanyFacts | null, reply: string | undefined, html: string): string {
  if (!reply) return ''
  if (html.toLowerCase().includes(reply.toLowerCase())) return ''
  const brand = String(facts?.brandName || facts?.legalName || '').trim()
  const site = String(facts?.website || '').trim()
  const lines = [
    `<strong>Media contact</strong>`,
    brand ? `${String(brand).replace(/</g, '&lt;')}` : '',
    `<a href="mailto:${reply}">${reply}</a>`,
    site ? `<a href="${String(site).replace(/"/g, '')}">${String(site).replace(/</g, '&lt;')}</a>` : '',
  ].filter(Boolean)
  return `<p style="margin-top:20px;color:#444;font-size:14px">${lines.join('<br/>')}</p>`
}

function signatureBlock(facts: CompanyFacts | null): string {
  if (!facts) return ''
  const person = String(facts.spokespersonName || '').trim()
  const title = String(facts.spokespersonTitle || '').trim()
  const brand = String(facts.brandName || facts.legalName || '').trim()
  const site = String(facts.website || '').trim()
  const lines = [person && title ? `${person}, ${title}` : person, brand, site].filter(Boolean)
  if (!lines.length) return ''
  return `<p style="margin-top:18px;color:#444">—<br/>${lines.map((l) => String(l).replace(/</g, '&lt;')).join('<br/>')}</p>`
}

function ownerEmail(): string {
  return process.env.OWNER_EMAIL || process.env.SIGNALBOOST_OWNER_EMAIL || ''
}

function resendClient(): Resend | null {
  const key = process.env.RESEND_API_KEY
  return key ? new Resend(key) : null
}

export async function loadCompanyFacts(): Promise<CompanyFacts | null> {
  return resolveCompanyFacts()
}

export function createCompanyProfilePort(): CompanyProfilePort {
  return { load: async () => resolveCompanyFacts() }
}

export function createAiPort(): AiPort {
  return {
    async generate(brief: CampaignBrief, spec: GenerateSpec): Promise<{ creative: string }> {
      const facts = await loadCompanyFacts()
      const system = [
        buildFactualPreamble(facts || undefined),
        '',
        'You are a senior press & media copywriter.',
        `Produce a ${spec.format.replace(/_/g, ' ')}.`,
        spec.tone ? `Tone: ${spec.tone}.` : '',
        spec.notes || '',
        spec.maxChars ? `Keep it under ${spec.maxChars} characters.` : '',
        'Return only the finished copy — no preamble, no notes, no markdown code fences.',
      ].filter(Boolean).join('\n')

      const today = new Date().toLocaleDateString(brief.language === 'es' ? 'es-ES' : brief.language === 'pt' ? 'pt-BR' : brief.language === 'pl' ? 'pl-PL' : brief.language === 'ru' ? 'ru-RU' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      const prompt = [
        `Goal: ${brief.goal}`,
        brief.audience ? `Audience: ${brief.audience}` : '',
        brief.ctaUrl ? `Call-to-action URL: ${brief.ctaUrl}` : '',
        brief.language ? `Write in this language: ${brief.language}` : '',
        spec.format === 'press_release' ? `Today's date for the dateline: ${today}. Use it — never write [DATE].` : '',
        spec.format === 'press_release' ? 'Do NOT write a Media Contact section, a signature, or any contact block — the system appends the real one after you finish. End the release at the ### mark.' : '',
      ].filter(Boolean).join('\n')

      const maxTokens = spec.maxChars ? Math.min(4096, Math.ceil(spec.maxChars / 2) + 400) : 2048
      const text = await ai.generate({ prompt, systemPrompt: system, maxTokens })
      return { creative: (text || '').trim() }
    },
  }
}

export function createEmailPort(): EmailPort {
  return {
    async send(input: { to: string; subject: string; html: string }) {
      const resend = resendClient()
      if (!resend) return { ok: false, error: 'email_transport_unavailable' }
      try {
        const facts = await resolveCompanyFacts().catch(() => null)
        const reply = replyToAddress()
        const payload: any = {
          from: senderFrom(facts),
          to: input.to,
          bcc: ownerEmail() || undefined,
          subject: input.subject,
          html: `${input.html}${mediaContactBlock(facts, reply, input.html)}${signatureBlock(facts)}`,
        }
        if (reply) { payload.replyTo = reply; payload.reply_to = reply }
        const response: any = await resend.emails.send(payload)
        if (response?.error) {
          const detail = response.error?.message || response.error?.name || 'send_rejected'
          return { ok: false, error: String(detail) }
        }
        return { ok: true, id: String(response?.data?.id || response?.id || '') || undefined }
      } catch (error: any) {
        return { ok: false, error: error?.message || 'send_failed' }
      }
    },
  }
}

export function createOwnerNotifyPort(): OwnerNotifyPort {
  return {
    async notifyOwner(stage: DispatchState, campaign: MediaCampaign, proof?: ProofResult): Promise<void> {
      const to = ownerEmail()
      const resend = resendClient()
      if (!to || !resend) return
      const published = stage === 'published'
      const targetLabel = campaign.target.publicationName || campaign.target.editorEmail || campaign.target.submitFormUrl || campaign.target.mediaTargetType
      const proofLine = !proof ? '' : proof.pending ? 'Proof: pending — the provider has not confirmed a result yet.' : `Proof (${proof.proofType}): ${JSON.stringify(proof.payload)}`
      const lines = [
        published ? 'A press & media campaign has been confirmed PUBLISHED by the provider.' : `A press & media campaign has been ${stage.toUpperCase()} and is awaiting the provider outcome.`,
        `Campaign: ${campaign.id}`,
        `Provider: ${campaign.providerId}`,
        `Target: ${targetLabel}`,
        proofLine,
      ].filter(Boolean)
      try {
        await resend.emails.send({ from: FROM, to, subject: published ? `Press campaign published: ${campaign.id}` : `Press campaign ${stage}: ${campaign.id}`, text: lines.join('\n') })
      } catch {}
    },
  }
}

async function resolveHostCredential(reference: unknown): Promise<string> {
  const ref = typeof reference === 'string' ? reference : ((reference as any)?.ref || (reference as any)?.secretRef || (reference as any)?.name || '')
  if (typeof ref !== 'string') return ''
  if (ref.startsWith('env://')) return process.env[ref.slice(6)] || ''
  if (ref.startsWith('vault://')) return (await resolvePressProviderKey(ref.slice(8))) || ''
  return ''
}

export function createRunnerPort(): RunnerPort {
  return {
    async run(providerId: string, action: string, variables: Record<string, unknown>): Promise<RunnerResult> {
      try {
        const res = await runUniversalProvider({ providerId, actionId: action, variables, credentials: { api_key: `vault://${providerId}` }, resolveCredential: async (reference) => resolveHostCredential(reference) })
        return { ok: Boolean(res.ok), status: res.status, outputs: (res.outputs as Record<string, unknown>) || {}, ref: res.outputs?.ref != null ? String(res.outputs.ref) : undefined, error: res.error }
      } catch (err: any) {
        return { ok: false, status: 0, outputs: {}, error: err?.message || 'runner_failed' }
      }
    },

    async loadConfig(providerId: string): Promise<RunnerProviderConfig | null> {
      try {
        const db = getAdminSupabase()
        const { data } = await db.from('provider_registry').select('metadata, is_active').eq('provider_id', providerId).eq('action_id', 'submit_release').eq('is_active', true).limit(1)
        const row = Array.isArray(data) ? data[0] : null
        if (!row) return { connected: false, priceCents: 0, currency: 'USD' }
        const meta = (row.metadata || {}) as any
        return { connected: true, priceCents: Number(meta.price_cents || 0), currency: String(meta.currency || 'USD') }
      } catch {
        return null
      }
    },
  }
}

function createDiscoveryPort(): DiscoveryPort {
  return {
    async findPublications(query) {
      try {
        const result = await discoverPublishers({
          brief: query.topic || '',
          channel: query.targetType === 'trade_press' ? 'trade_press' : query.targetType === 'newspaper_print' || query.targetType === 'magazine_print' ? 'print' : 'digital_press',
          region: query.region,
          limit: query.limit,
        })
        if (!result.ok) return { ok: false, leads: [], examined: result.examined, error: result.error }
        return {
          ok: true,
          examined: result.examined,
          leads: result.publishers.map(publisher => ({ publication: String(publisher.publicationName || ''), contact: String(publisher.editorContact || ''), method: publisher.method === 'online_form' ? 'online_form' as const : 'email' as const, sourceUrl: publisher.sourceUrl, targetType: query.targetType })),
        }
      } catch (error: any) {
        return { ok: false, leads: [], error: String(error?.message || error || 'discovery failed') }
      }
    },
  }
}

export function createHostPorts(config?: Record<string, string>): PortBundle {
  return { ai: createAiPort(), email: createEmailPort(), notify: createOwnerNotifyPort(), runner: createRunnerPort(), company: createCompanyProfilePort(), discovery: createDiscoveryPort(), config }
}

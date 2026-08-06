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

// The sending ADDRESS must come from env: Resend only sends from a verified domain, so it is a
// deployment fact, not a company fact. The DISPLAY NAME and signature come from the company
// record — so mail goes out as a named person at the company that employs this AI, not from a
// hardcoded seller address. A buyer sets RESEND_FROM_EMAIL / PRESS_REPLY_TO and their identity
// applies everywhere, with no code change.
// The default must be an address Resend has actually verified for this domain. The
// previous 'press@signalboostapp.com' is not one of the platform's verified sender
// identities (see saas/lib/email.ts SENDERS), so a send from it would be rejected
// outright. saaspartners@ is verified and is the desk the owner chose for press: a
// publication is a partner relationship, not a sales prospect and not brand marketing.
// A buyer overrides it with RESEND_FROM_EMAIL.
const FROM = process.env.RESEND_FROM_EMAIL || 'SignalBoost Partners <saaspartners@signalboostapp.com>'

function addressOf(value: string): string {
  const match = String(value || '').match(/<([^>]+)>/)
  return (match ? match[1] : value).trim()
}

// "Ana Ruiz, Head of Communications · Acme" <press@acme.com> — never an invented person.
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

// Replies from an editor must reach a human, not an unmonitored sender.
function replyToAddress(): string | undefined {
  const explicit = String(process.env.PRESS_REPLY_TO || '').trim()
  if (explicit) return explicit
  // Fall back to the PARTNERS desk before the owner's personal inbox: an editor's reply
  // is the start of a relationship, and that mailbox is already monitored.
  const partners = addressOf(String(process.env.PRESS_CONTACT_EMAIL || process.env.PARTNERS_REPLY_TO || PRESS_CONTACT_FALLBACK))
  if (partners) return partners
  const owner = ownerEmail()
  return owner || undefined
}

// The address the sales outreach sends from, and therefore the one already monitored for
// replies. A buyer overrides it with OUTREACH_REPLY_TO; nothing here is SignalBoost-only
// beyond this default, which only applies on this host.
// Press replies go to the PARTNERS desk. The verified identities separate the desks
// deliberately — saassales@ is cold sales, saasmarketing@ is outbound brand, and
// saaspartners@ is the inbound relationship desk. An editor writing back wants a
// conversation, not a sales sequence, so that is where the reply belongs.
const PRESS_CONTACT_FALLBACK = 'saaspartners@signalboostapp.com'

// MEDIA CONTACT BLOCK.
//
// A press release without a contact is unusable: an editor who wants a detail, an image
// or an interview has nowhere to write, and replying to the sending address is a guess
// they will not make. Conventional releases end with one, so this appends it when the
// copy does not already carry the address.
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

// A signature identifying the sender as someone at the company. If the company record names no
// spokesperson, NO name is invented — the block falls back to the company itself, or is omitted.
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

// ── Company facts: WHO THE AI WORKS FOR ──
// Delegated to the shared host resolver so press, video and outreach all speak for the same
// employer with the same facts (saas/lib/portable/companyIdentity.ts). A buyer repoints that
// one file at their own company record and every portable follows.
export async function loadCompanyFacts(): Promise<CompanyFacts | null> {
  return resolveCompanyFacts()
}

// The core-facing port: the engine asks the host who it works for.
export function createCompanyProfilePort(): CompanyProfilePort {
  return { load: async () => resolveCompanyFacts() }
}

// ── AiPort: generate the release / ad through the platform model router ──
// The system prompt is assembled in a fixed order: company facts and the factual-discipline
// rules FIRST (they override everything), then the channel spec the adapter asked for.
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

      // THE DATE IS SUPPLIED, NEVER PLACEHOLDERED. [DATE] appeared in every draft because
      // the model had no way to know when the release would exist — but the host does: it is
      // now. Same for the Media Contact block: the engine appends the real one after
      // generation (see withMediaContact), so the model writing its own produced two stacked
      // contact blocks, one of them all placeholders, on every release that reached the owner.
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
      const text = await callModel({ prompt, systemPrompt: system, maxTokens })
      return { creative: (text || '').trim() }
    },
  }
}

// ── EmailPort: send through Resend (editor submission, etc.), BCC the owner ──
export function createEmailPort(): EmailPort {
  return {
    // The return type is deliberately NOT re-declared here — it is inherited from EmailPort
    // in press-media-core. A local annotation narrower than the interface silently discards
    // fields the contract promises, which is exactly what hid the transport's error and id.
    async send(input: { to: string; subject: string; html: string }) {
      const resend = resendClient()
      if (!resend) return { ok: false, error: 'email_transport_unavailable' }
      try {
        // Outreach is sent ON BEHALF OF the company that employs this AI: named sender,
        // working reply-to, and a signature — the difference between a pitch a journalist
        // reads and an anonymous block of text they delete.
        const facts = await resolveCompanyFacts().catch(() => null)
        const reply = replyToAddress()
        // Typed as any: the Resend SDK has used both `replyTo` and `reply_to` across versions,
        // and a wrong key name would be a compile error. Both are sent; the SDK ignores the one
        // it does not know.
        const payload: any = {
          from: senderFrom(facts),
          to: input.to,
          bcc: ownerEmail() || undefined,
          subject: input.subject,
          html: `${input.html}${mediaContactBlock(facts, reply, input.html)}${signatureBlock(facts)}`,
        }
        if (reply) { payload.replyTo = reply; payload.reply_to = reply }
        // THE TRANSPORT REPORTS A REJECTED SEND IN THE RESPONSE, NOT BY THROWING.
        // `await send(); return { ok: true }` meant an unverified sending domain, a
        // rejected recipient or a rate limit all came back as SUCCESS — and this is the
        // port the free-submission adapter reads to decide state:'submitted', which the
        // queue then shows as Sent. So the single most load-bearing boolean in the whole
        // press path was the one that could not fail.
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

// ── RunnerPort: config-driven paid-provider execution via the platform's universal runner ──
// A wire brand's endpoint/headers/payload live in a provider_registry row; the key is resolved
// by reference (env:// today; vault:// wired with the connect flow). No hand-rolled HTTP here,
// and no plaintext key — the secret is resolved only at call time, backend-only.
async function resolveHostCredential(reference: unknown): Promise<string> {
  const ref = typeof reference === 'string'
    ? reference
    : ((reference as any)?.ref || (reference as any)?.secretRef || (reference as any)?.name || '')
  if (typeof ref !== 'string') return ''
  if (ref.startsWith('env://')) return process.env[ref.slice(6)] || ''
  if (ref.startsWith('vault://')) return (await resolvePressProviderKey(ref.slice(8))) || ''
  return ''
}

export function createRunnerPort(): RunnerPort {
  return {
    async run(providerId: string, action: string, variables: Record<string, unknown>): Promise<RunnerResult> {
      try {
        const res = await runUniversalProvider({
          providerId,
          actionId: action,
          variables,
          credentials: { api_key: `vault://${providerId}` },
          resolveCredential: async (reference) => resolveHostCredential(reference),
        })
        return {
          ok: Boolean(res.ok),
          status: res.status,
          outputs: (res.outputs as Record<string, unknown>) || {},
          ref: res.outputs?.ref != null ? String(res.outputs.ref) : undefined,
          error: res.error,
        }
      } catch (err: any) {
        return { ok: false, status: 0, outputs: {}, error: err?.message || 'runner_failed' }
      }
    },

    async loadConfig(providerId: string): Promise<RunnerProviderConfig | null> {
      try {
        const db = getAdminSupabase()
        const { data } = await db
          .from('provider_registry')
          .select('metadata, is_active')
          .eq('provider_id', providerId)
          .eq('action_id', 'submit_release')
          .eq('is_active', true)
          .limit(1)
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

// ── DISCOVERY: this host's answer to "which publications?" ──
// SignalBoost supplies its own regional publisher search, so the platform needs no
// third-party subscription to find free press. A BUYER hosting this portable supplies
// their own instead — a media database they already pay for, a search key, or a
// curated list — by passing a different DiscoveryPort. The portable never knows which.
function createDiscoveryPort(): DiscoveryPort {
  return {
    async findPublications(query) {
      try {
        const result = await discoverPublishers({
          brief: query.topic || '',
          // The platform search speaks in channels; the portable speaks in target types.
          channel: query.targetType === 'trade_press' ? 'trade_press'
            : query.targetType === 'newspaper_print' || query.targetType === 'magazine_print' ? 'print'
            : 'digital_press',
          region: query.region,
          limit: query.limit,
        })
        if (!result.ok) return { ok: false, leads: [], examined: result.examined, error: result.error }
        return {
          ok: true,
          examined: result.examined,
          leads: result.publishers.map(publisher => ({
            publication: String(publisher.publicationName || ''),
            contact: String(publisher.editorContact || ''),
            method: publisher.method === 'online_form' ? 'online_form' as const : 'email' as const,
            sourceUrl: publisher.sourceUrl,
            targetType: query.targetType,
          })),
        }
      } catch (error: any) {
        return { ok: false, leads: [], error: String(error?.message || error || 'discovery failed') }
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
    runner: createRunnerPort(),
    company: createCompanyProfilePort(),
    discovery: createDiscoveryPort(),
    config,
  }
}

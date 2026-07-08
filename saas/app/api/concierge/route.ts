// saas/app/api/concierge/route.ts
// Thin alias: the Concierge widget posts here; the brain lives in /api/support.
// Keep route config local so long COS/Campaign requests do not hit default Vercel timeouts.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { POST as supportPost } from '@/app/api/support/route'
import { getAccess } from '@/lib/auth/access'
import { proposeCampaign } from '@/lib/ai/proposeCampaign'
import { sendPressPrintPreviewEmail } from '@/lib/marketing/pressPrintEmail'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

type AttachmentInfo = { name?: string; type?: string; mimeType?: string; dataUrl?: string }
type ConciergePressCampaign = { id: string; title?: string; objective?: string; metadata?: Record<string, any> }

const PRESS_PRINT_CHANNELS = ['online-newspapers', 'print-newspapers', 'trade-press'] as const

type PressPrintChannel = typeof PRESS_PRINT_CHANNELS[number]

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || 'unknown error')
}

function id(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function admin() {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL']!
  const key = process.env['SUPABASE_' + 'SERVICE_ROLE_KEY']!
  return createClient(url, key, { auth: { persistSession: false } })
}

function latestUserText(body: any): string {
  const messages = Array.isArray(body?.messages) ? body.messages : []
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role !== 'user') continue
    const content = messages[i]?.content
    if (typeof content === 'string') return content
    if (Array.isArray(content)) return content.map((block: any) => typeof block?.text === 'string' ? block.text : '').join('\n').trim()
  }
  return ''
}

function attachmentMime(a: AttachmentInfo): string {
  const explicit = String(a?.type || a?.mimeType || '').toLowerCase()
  if (explicit) return explicit
  const fromDataUrl = /^data:([^;,]+)/i.exec(String(a?.dataUrl || ''))?.[1]
  if (fromDataUrl) return fromDataUrl.toLowerCase()
  const name = String(a?.name || '').toLowerCase()
  if (/\.(png|jpe?g|gif|webp|svg)$/.test(name)) return 'image/unknown'
  return ''
}

function attachmentSummary(attachments: any): string {
  if (!Array.isArray(attachments) || attachments.length === 0) return ''
  return attachments.map((a: AttachmentInfo) => `${a?.name || 'attached file'}${attachmentMime(a) ? ` (${attachmentMime(a)})` : ''}`).join(', ')
}

function isVideoCreationRequest(text: string): boolean {
  const t = String(text || '').toLowerCase()
  const mentionsVideo = /\b(video|vídeo|clip|reel|short|tiktok|youtube|filme|movie)\b/i.test(t)
  const createVerb = /(faça|faca|crie|criar|cria|gere|gerar|gera|render|renderizar|produza|produzir|make|create|generate|render|animate|turn\s+.*\s+into|transforme|transformar)/i.test(t)
  const watchVerb = /(watch|assistir|ver\s+o\s+vídeo|ver\s+o\s+video|find|search|procure|buscar|encontre|mostre\s+um\s+video|mostrar\s+um\s+video)/i.test(t)
  return mentionsVideo && createVerb && !watchVerb
}

function isPressCreationRequest(text: string): boolean {
  const t = String(text || '').toLowerCase()
  const mentionsPress = /(press|print|newspaper|publisher|publication|editor|magazine|trade press|media kit|article|ad placement|jornal|revista|periódico|periodico|imprensa)/i.test(t)
  const createVerb = /(start|create|launch|prepare|publish|campaign|outreach|crie|crear|iniciar|campanha|campaña)/i.test(t)
  return mentionsPress && createVerb && !isVideoCreationRequest(text)
}

function languageFrom(body: any, text: string): string {
  const ctxLang = String(body?.context?.language || '').toLowerCase()
  const t = String(text || '').toLowerCase()
  if (/portugu[eê]s|portuguese|pt-br|brasil|brazil/.test(t)) return 'pt'
  if (/espanhol|español|spanish|latam/.test(t)) return 'es'
  if (/polish|polski|polon[eê]s/.test(t)) return 'pl'
  if (/russian|russo|рус/.test(t)) return 'ru'
  if (['pt', 'es', 'pl', 'ru', 'en'].includes(ctxLang)) return ctxLang
  return 'en'
}

function channelFrom(text: string): string {
  const t = String(text || '').toLowerCase()
  if (/(short|tiktok|reel|reels|vertical|9:16|story|stories)/.test(t)) return 'short_video'
  return 'youtube'
}

function pressChannelFrom(text: string): PressPrintChannel {
  const t = String(text || '').toLowerCase()
  if (/(print|offline|newspaper_print|printed|jornal impresso)/.test(t)) return 'print-newspapers'
  if (/(trade press|magazine|it magazine|revista|publication trade)/.test(t)) return 'trade-press'
  return 'online-newspapers'
}

function fieldFrom(text: string, labels: string[]): string {
  for (const label of labels) {
    const rx = new RegExp(`${label}\\s*[:\\-–]\\s*([^\\n]+)`, 'i')
    const found = rx.exec(text)
    if (found?.[1]) return found[1].trim().slice(0, 240)
  }
  return ''
}

function titleFrom(text: string): string {
  return String(text || '').replace(/\s+/g, ' ').replace(/📎[\s\S]*$/, '').trim().slice(0, 110) || 'Owner requested video render'
}

function hasEmail(value: string) {
  return /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(value)
}

function hasOnlineSubmission(value: string) {
  return /https?:\/\//i.test(value) && /(submit|contact|advertis|media|press|form|sponsor|partner|editor|news|pr)/i.test(value)
}

function publisherTargetIsResolved(publicationName: string, editorContact: string) {
  const pub = String(publicationName || '').toLowerCase()
  const contact = String(editorContact || '').toLowerCase()
  const genericPub = !pub || /(to be selected|target to be selected|digital business publication|online newspaper|it magazine|trade press target|publication target|suitable real)/i.test(pub)
  const genericContact = !contact || /(to be confirmed|name, email|media-kit link|notes|editor contact|contact to be confirmed)/i.test(contact)
  return !genericPub && !genericContact && (hasEmail(editorContact) || hasOnlineSubmission(editorContact))
}

function submissionMethod(editorContact: string) {
  if (hasEmail(editorContact)) return 'email'
  if (hasOnlineSubmission(editorContact)) return 'online_form'
  return 'unresolved'
}

function queuedReply(lang: string, result: any): string {
  const ids = Array.isArray(result?.campaignIds) && result.campaignIds.length ? result.campaignIds.join(', ') : result?.campaignId || 'created'
  const link = '/dashboard/cosa/video-pipeline'
  if (lang === 'pt') return `Pedido enviado para a fila de vídeo da COSA. ID da campanha: ${ids}. Abra ${link} e clique em Refresh/Kick missing renders se o item ainda não aparecer.`
  if (lang === 'es') return `Solicitud enviada a la cola de video de COSA. ID de campaña: ${ids}. Abre ${link} y pulsa Refresh/Kick missing renders si todavía no aparece.`
  return `Sent this request to the COSA video pipeline. Campaign ID: ${ids}. Open ${link} and click Refresh/Kick missing renders if it does not appear yet.`
}

function pressReply(lang: string, campaign: ConciergePressCampaign, previewEmail: any): string {
  const targetStatus = String(campaign.metadata?.target_discovery_status || '')
  if (targetStatus === 'stopped_no_publisher_contact') {
    if (lang === 'pt') return 'Campanha Press & Print automática interrompida: a plataforma não encontrou um publisher com email publicado ou formulário online de envio. Nenhuma campanha foi criada e nenhum pedido de aprovação foi enviado.'
    if (lang === 'es') return 'Campaña Press & Print automática detenida: la plataforma no encontró un publisher con email publicado o formulario online de envío. No se creó ninguna campaña y no se envió solicitud de aprobación.'
    return 'Automated Press & Print campaign stopped: no publisher with a published email address or online submission form was found/provided. No campaign was created and no owner approval request was sent.'
  }
  const link = `/dashboard/marketing/press-print?campaign=${encodeURIComponent(campaign.id)}`
  const emailStatus = previewEmail?.ok ? ' Preview email sent to the owner.' : previewEmail?.skipped || previewEmail?.error ? ` Preview email was not sent yet: ${previewEmail.reason || previewEmail.error || 'email send failed'}.` : ''
  if (lang === 'pt') return `A Concierge criou a campanha Press & Print com publisher verificado. ID: ${campaign.id}. Nada será publicado até aprovação do proprietário. Revise aqui: ${link}.${emailStatus}`
  if (lang === 'es') return `Concierge creó la campaña Press & Print con publisher verificado. ID: ${campaign.id}. No se publicará hasta la aprobación del propietario. Revisa aquí: ${link}.${emailStatus}`
  return `Concierge created the Press & Print campaign with a verified publisher target. Campaign ID: ${campaign.id}. Nothing will publish until the owner approves it. Review it here: ${link}.${emailStatus}`
}

function buildPressObjective(args: { publicationName: string; editorContact: string; headline: string; articleNotes: string; ctaUrl: string; channel: string; language: string }) {
  return [
    `Prepare a COS-led Press & Print Media campaign for ${args.publicationName}.`,
    `Publication/contact: ${args.editorContact}.`,
    `Submission method: ${submissionMethod(args.editorContact)}.`,
    'Target status: verified before owner approval.',
    `Headline / campaign title: ${args.headline}.`,
    `Article/ad notes: ${args.articleNotes}.`,
    `CTA URL: ${args.ctaUrl}.`,
    'Target audience: Publication editors, readers, and business technology buyers reached through the selected press media channel.',
    `Requested language: ${args.language}.`,
    `Specific outreach channel: ${args.channel}.`,
    'Execution rule: draft, approval, final polish, submission, publishing, monitoring, and learning must remain behind owner-approved workflow gates.',
    'Safety rule: do not request owner approval until a concrete publisher name and submission method are recorded. Do not contact, submit, publish, or send anything externally until the owner approves the exact target and preview.',
  ].join(' ')
}

function pressQueueRow(args: { headline: string; objective: string; outreachChannel: PressPrintChannel; publicationName: string; editorContact: string; articleNotes: string; ctaUrl: string; lang: string; now: string }) {
  const recommendationId = id('rec_press_print')
  const audience = 'Small businesses, local businesses, agencies, entrepreneurs, and service providers.'
  const method = submissionMethod(args.editorContact)
  return {
    recommendation_id: recommendationId,
    department: 'marketing',
    title: args.headline,
    objective: args.objective,
    channel: 'outreach',
    audience,
    languages: [args.lang],
    assets: [],
    work_items: [
      {
        id: id('work_press_preview'),
        type: 'press_print_campaign',
        title: 'Prepare Press & Print publication preview',
        status: 'drafted',
        input: {
          channel: args.outreachChannel,
          publication_name: args.publicationName,
          editor_contact: args.editorContact,
          submission_method: method,
          cta_url: args.ctaUrl,
        },
        output: {
          title: args.headline,
          draft: args.objective,
          call_to_action: args.ctaUrl,
        },
      },
    ],
    recommendation: {
      id: recommendationId,
      department: 'marketing',
      title: args.headline,
      summary: args.objective,
      recommended_channel: 'outreach',
      priority: 'medium',
      confidence: 85,
      expected_roi: 'medium',
      estimated_cost_usd: 0,
      reason: 'Concierge/COS requested an owner-gated Press & Print campaign with a concrete publisher target. No external publication action is allowed until owner approval.',
      approval_status: 'pending_approval',
      created_at: args.now,
    },
    status: 'draft',
    risk_level: 'medium',
    approval_required: true,
    metadata: {
      source: 'concierge_cos_press_print_campaign',
      outreach_channel: args.outreachChannel,
      media_channel: args.outreachChannel,
      publication_name: args.publicationName,
      editor_contact: args.editorContact,
      publisher_name: args.publicationName,
      publisher_contact_method: method,
      publisher_email: hasEmail(args.editorContact) ? args.editorContact.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] : null,
      publisher_submission_form_url: hasOnlineSubmission(args.editorContact) ? args.editorContact.match(/https?:\/\/\S+/i)?.[0] : null,
      target_discovery_status: 'resolved',
      headline: args.headline,
      article_notes: args.articleNotes,
      cta_url: args.ctaUrl,
      press_print_review: 'PENDING',
      press_print_review_scope: 'owner_approval_required',
      press_print_execution_stage: 'not_started',
      press_print_live_url_required: false,
      staff_support_available: true,
      owner_preview_required: true,
      owner_preview_email_sent_at: null,
      owner_preview_email_status: 'pending',
      concierge_requested_at: args.now,
      audience,
      signal: `Publication: ${args.publicationName}. Contact: ${args.editorContact}. Headline: ${args.headline}. CTA: ${args.ctaUrl}`,
    },
    created_at: args.now,
    updated_at: args.now,
  }
}

async function createConciergePressCampaign(text: string, lang = 'en') {
  const outreachChannel = pressChannelFrom(text)
  const publicationName = fieldFrom(text, ['Publication name', 'Publication', 'Media outlet']) || (outreachChannel === 'trade-press' ? 'IT magazine / trade press target to be selected by COS' : 'Digital business publication to be selected by COS')
  const editorContact = fieldFrom(text, ['Editor / media contact', 'Editor contact', 'Media contact', 'Contact', 'Submission form', 'Submission URL']) || 'Name, email, phone, media-kit link, or notes to be confirmed by COS'
  const headline = fieldFrom(text, ['Headline / campaign title', 'Headline', 'Campaign title']) || 'SignalBoost introduces AI-powered business growth tools for modern businesses'
  const articleNotes = fieldFrom(text, ['Article / ad notes', 'Article notes', 'Ad notes', 'Notes']) || text
  const ctaUrl = fieldFrom(text, ['CTA URL', 'CTA', 'Link']) || 'https://saas.signalboostapp.com'

  if (!publisherTargetIsResolved(publicationName, editorContact)) {
    return {
      campaign: {
        id: 'stopped_no_publisher_contact',
        title: headline,
        objective: 'Automated Press & Print campaign stopped before creation because no publisher email address or online submission form was found/provided.',
        metadata: {
          target_discovery_status: 'stopped_no_publisher_contact',
          publication_name: publicationName,
          editor_contact: editorContact,
          outreach_channel: outreachChannel,
          media_channel: outreachChannel,
          press_print_execution_stage: 'stopped',
          press_print_review: 'STOPPED',
          stop_reason: 'publisher_email_or_online_submission_form_required_for_automated_campaign',
        },
      } as ConciergePressCampaign,
      previewEmail: { ok: false, skipped: true, reason: 'publisher_contact_not_found' },
      stopped: true,
    }
  }

  const objective = buildPressObjective({ publicationName, editorContact, headline, articleNotes, ctaUrl, channel: outreachChannel, language: lang })
  const now = new Date().toISOString()
  const sb = admin()
  const row = pressQueueRow({ headline, objective, outreachChannel, publicationName, editorContact, articleNotes, ctaUrl, lang, now })

  const { data, error } = await sb
    .from('cos_campaign_queue')
    .insert(row)
    .select('id,title,objective,status,metadata,created_at')
    .single()

  if (error) throw new Error(error.message)

  const previewEmail: any = await sendPressPrintPreviewEmail({
    campaignId: data.id,
    title: data.title || headline,
    objective: data.objective || objective,
    channel: outreachChannel,
    contact: `${publicationName}; ${editorContact}`,
  }).catch((err) => ({ ok: false, error: errorMessage(err) }))

  const emailPatch = previewEmail.ok
    ? { owner_preview_email_sent_at: new Date().toISOString(), owner_preview_email_status: 'sent' }
    : { owner_preview_email_status: previewEmail.reason || previewEmail.error || 'not_sent' }

  await sb
    .from('cos_campaign_queue')
    .update({ metadata: { ...((data.metadata as any) || {}), ...emailPatch } })
    .eq('id', data.id)

  return { campaign: { ...(data as ConciergePressCampaign), metadata: { ...((data.metadata as any) || {}), ...emailPatch } }, previewEmail }
}

export async function POST(req: NextRequest) {
  const cloned = req.clone()
  try {
    const body = await cloned.json()
    const text = latestUserText(body)
    const attachments = Array.isArray(body?.attachments) ? body.attachments : []

    if (isVideoCreationRequest(text)) {
      const ctx = await getAccess()
      if (ctx.isOwner) {
        const files = attachmentSummary(attachments)
        const lang = languageFrom(body, text)
        const sourceMaterial = [text, files ? `Attached source image(s): ${files}` : '', 'Route: Concierge direct-to-COSA video pipeline. Do not treat this as a media-search request.'].filter(Boolean).join('\n')
        const result = await proposeCampaign({ customCreative: true, title: titleFrom(text), goal: text, audience: 'Social media viewers and fans of the requested subject.', channel: channelFrom(text), language: lang, sourceMaterial, voiceover: sourceMaterial, offer: '' })
        if (result?.ok) return NextResponse.json({ reply: queuedReply(lang, result), source: 'concierge-cosa-video-router', campaignId: result.campaignId, campaignIds: result.campaignIds || null, render: result.render || null })
        return NextResponse.json({ reply: `COSA video queue failed: ${result?.error || 'unknown error'}`, source: 'concierge-cosa-video-router' }, { status: 200 })
      }
    }

    if (isPressCreationRequest(text)) {
      const lang = languageFrom(body, text)
      try {
        const created = await createConciergePressCampaign(text, lang)
        return NextResponse.json({ reply: pressReply(lang, created.campaign, created.previewEmail), source: 'concierge-cos-press-router', campaignId: created.campaign.id, execution_locked: !created.stopped, stopped: Boolean(created.stopped), preview_email: created.previewEmail })
      } catch (err) {
        const message = errorMessage(err)
        console.error('Concierge press workflow failed:', message)
        return NextResponse.json({ reply: `I could not create the Press & Print campaign yet. The server returned: ${message}`, source: 'concierge-cos-press-router', error: message }, { status: 200 })
      }
    }
  } catch (err) {
    console.error('Concierge direct router skipped:', err)
  }
  return supportPost(req)
}

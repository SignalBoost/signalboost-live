// saas/app/api/concierge/route.ts
// Thin alias: the Concierge widget posts here; the brain lives in /api/support.
// Keep route config local so long COS/Campaign requests do not hit default Vercel timeouts.

import { NextRequest, NextResponse } from 'next/server'
import { POST as supportPost } from '@/app/api/support/route'
import { getAccess } from '@/lib/auth/access'
import { proposeCampaign } from '@/lib/ai/proposeCampaign'
import { getPressAdminClient, runLocalPressDistributionWorker, validatePressCampaignInput, type PressCampaign } from '@/lib/agency/pressOutreach'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

type AttachmentInfo = { name?: string; type?: string; mimeType?: string; dataUrl?: string }

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || 'unknown error')
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

function pressChannelFrom(text: string): string {
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

function queuedReply(lang: string, result: any): string {
  const ids = Array.isArray(result?.campaignIds) && result.campaignIds.length ? result.campaignIds.join(', ') : result?.campaignId || 'created'
  const link = '/dashboard/cosa/video-pipeline'
  if (lang === 'pt') return `Pedido enviado para a fila de vídeo da COSA. ID da campanha: ${ids}. Abra ${link} e clique em Refresh/Kick missing renders se o item ainda não aparecer.`
  if (lang === 'es') return `Solicitud enviada a la cola de video de COSA. ID de campaña: ${ids}. Abre ${link} y pulsa Refresh/Kick missing renders si todavía no aparece.`
  return `Sent this request to the COSA video pipeline. Campaign ID: ${ids}. Open ${link} and click Refresh/Kick missing renders if it does not appear yet.`
}

function pressReply(lang: string, campaign: PressCampaign): string {
  const link = `/dashboard/marketing/press-outreach?campaign=${encodeURIComponent(campaign.id)}`
  if (lang === 'pt') return `A Concierge criou a campanha Press & Print e a COS preparou o preview. ID: ${campaign.id}. Nada será publicado até aprovação do proprietário. Revise aqui: ${link}`
  if (lang === 'es') return `Concierge creó la campaña Press & Print y COS preparó la vista previa. ID: ${campaign.id}. No se publicará hasta la aprobación del propietario. Revisa aquí: ${link}`
  return `Concierge created the Press & Print campaign and COS prepared the publication preview. Campaign ID: ${campaign.id}. Nothing will publish until the owner approves it. Review it here: ${link}`
}

async function createConciergePressCampaign(text: string) {
  const channel = pressChannelFrom(text)
  const publicationName = fieldFrom(text, ['Publication name', 'Publication', 'Media outlet']) || (channel === 'trade-press' ? 'IT magazines' : 'Online newspaper / digital publisher')
  const editorContact = fieldFrom(text, ['Editor / media contact', 'Editor contact', 'Media contact', 'Contact']) || 'Name, email, phone, media-kit link, or notes to be confirmed by COS'
  const headline = fieldFrom(text, ['Headline / campaign title', 'Headline', 'Campaign title']) || 'SignalBoost introduces AI-powered business growth tools for modern businesses'
  const articleNotes = fieldFrom(text, ['Article / ad notes', 'Article notes', 'Ad notes', 'Notes']) || text
  const ctaUrl = fieldFrom(text, ['CTA URL', 'CTA', 'Link']) || 'https://saas.signalboostapp.com'
  const input = validatePressCampaignInput({ created_by_role: 'staff', source: 'concierge_cos', force_owner_review: true, channel, publication_name: publicationName, editor_contact: editorContact, headline, article_notes: articleNotes, cta_url: ctaUrl, brief: text })

  const supabase = getPressAdminClient()
  const now = new Date().toISOString()
  const fullRow = {
    status: 'pending_owner_review',
    created_by_role: 'staff',
    media_target_type: input.media_target_type,
    publication_contact: input.publication_contact,
    content_body: input.content_body,
    processing_state: 'free_organic_distribution',
    source: input.source || 'concierge_cos',
    channel: input.channel || channel,
    publication_name: input.publication_name || publicationName,
    editor_contact: input.editor_contact || editorContact,
    headline: input.headline || headline,
    article_notes: input.article_notes || articleNotes,
    cta_url: input.cta_url || ctaUrl,
    preview_sent_at: now,
  }

  let result = await supabase.from('press_campaigns').insert(fullRow).select('*').single()
  if (result.error) {
    console.error('Press campaign full insert failed, retrying minimal schema:', result.error.message)
    result = await supabase.from('press_campaigns').insert({
      status: 'pending_owner_review',
      created_by_role: 'staff',
      media_target_type: input.media_target_type,
      publication_contact: input.publication_contact,
      content_body: input.content_body,
      processing_state: 'free_organic_distribution',
    }).select('*').single()
  }
  if (result.error) throw new Error(result.error.message)

  const campaign = result.data as PressCampaign
  const previewEmail = await runLocalPressDistributionWorker(campaign, input.owner_email).catch((err) => ({ ok: false, skipped: true, reason: errorMessage(err) }))
  return { campaign, previewEmail }
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
        const created = await createConciergePressCampaign(text)
        return NextResponse.json({ reply: pressReply(lang, created.campaign), source: 'concierge-cos-press-router', campaignId: created.campaign.id, execution_locked: true, preview_email: created.previewEmail })
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

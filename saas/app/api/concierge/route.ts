// saas/app/api/concierge/route.ts
// Thin alias: the Concierge widget posts here; the brain lives in /api/support.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { POST as supportPost } from '@/app/api/support/route'
import { getAccess } from '@/lib/auth/access'
import { proposeCampaign } from '@/lib/ai/proposeCampaign'
import { callModel } from '@/lib/ai/modelRouter'
import { sendPressPrintPreviewEmail } from '@/lib/marketing/pressPrintEmail'
import { discoverPublisherTarget } from '@/lib/marketing/publisherDiscovery'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

type AttachmentInfo = { name?: string; type?: string; mimeType?: string; dataUrl?: string }
type ConciergeCampaign = { id: string; title?: string; objective?: string; metadata?: Record<string, any> }
type ConciergePressResult = { campaign: ConciergeCampaign; previewEmail: any; stopped?: boolean }
const PRESS_PRINT_CHANNELS = ['online-newspapers', 'print-newspapers', 'trade-press'] as const
type PressPrintChannel = typeof PRESS_PRINT_CHANNELS[number]

function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error || 'unknown error') }
function id(prefix: string) { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` }
function admin() { return createClient(process.env['NEXT_PUBLIC_SUPABASE_URL']!, process.env['SUPABASE_' + 'SERVICE_ROLE_KEY']!, { auth: { persistSession: false } }) }
function latestUserText(body: any): string { const messages = Array.isArray(body?.messages) ? body.messages : []; for (let i = messages.length - 1; i >= 0; i--) { if (messages[i]?.role !== 'user') continue; const content = messages[i]?.content; if (typeof content === 'string') return content; if (Array.isArray(content)) return content.map((block: any) => typeof block?.text === 'string' ? block.text : '').join('\n').trim() } return '' }
function attachmentMime(a: AttachmentInfo): string { const explicit = String(a?.type || a?.mimeType || '').toLowerCase(); if (explicit) return explicit; const fromDataUrl = /^data:([^;,]+)/i.exec(String(a?.dataUrl || ''))?.[1]; if (fromDataUrl) return fromDataUrl.toLowerCase(); const name = String(a?.name || '').toLowerCase(); if (/\.(png|jpe?g|gif|webp|svg)$/.test(name)) return 'image/unknown'; return '' }
function attachmentSummary(attachments: any): string { if (!Array.isArray(attachments) || attachments.length === 0) return ''; return attachments.map((a: AttachmentInfo) => `${a?.name || 'attached file'}${attachmentMime(a) ? ` (${attachmentMime(a)})` : ''}`).join(', ') }

// ── Concierge social / LinkedIn outreach router ──────────────────────────────
// A TEXT social/outreach post (LinkedIn, X, etc.) → an owner-approvable draft in
// cos_campaign_queue. Never a video. Checked BEFORE the video router in POST, and
// only fires when there's a clear text-deliverable noun (message/post/outreach…) so
// a genuine "make a video for LinkedIn" still goes to the video pipeline.
function isSocialOutreachRequest(text: string): boolean {
  const t = String(text || '').toLowerCase()
  const platform = /\b(linkedin|linked\s?in|twitter|x post|tweet|facebook|instagram|tiktok|reddit|social)\b/i.test(t)
  const textNoun = /\b(message|post|outreach|dm|direct message|caption|copy|announcement|newsletter)\b/i.test(t)
  const mentionsVideo = /\b(video|vídeo|reel|short|clip|tiktok|youtube|filme|movie)\b/i.test(t)
  const explicitlyText = /\b(not a video|no video|text[-\s]?only|text[-\s]?message)\b/i.test(t)
  return platform && textNoun && (!mentionsVideo || explicitlyText)
}

function socialPlatformFrom(text: string): string {
  const t = String(text || '').toLowerCase()
  if (/linkedin|linked\s?in/.test(t)) return 'linkedin'
  if (/\breddit\b|subreddit|\br\//.test(t)) return 'reddit'
  if (/facebook|\bfb\b/.test(t)) return 'facebook'
  if (/twitter|\bx post\b|\bon x\b|\btweet\b/.test(t)) return 'twitter'
  if (/instagram|\big\b/.test(t)) return 'instagram'
  if (/tiktok/.test(t)) return 'tiktok'
  return 'linkedin'
}

function socialQueueRow(a: { platform: string; title: string; body: string; brief: string; lang: string; now: string }) {
  const recommendationId = id('rec_social_outreach')
  const audience = `Prospects, partners, and buyers on ${a.platform}.`
  const channel = a.platform
  return {
    recommendation_id: recommendationId,
    department: 'marketing',
    title: a.title,
    objective: a.body,
    channel,
    audience,
    languages: [a.lang],
    assets: [{ type: 'social_post', platform: a.platform, body: a.body }],
    work_items: [{
      id: id('work_social_post'),
      type: 'social_outreach_post',
      title: `Publish ${a.platform} outreach post`,
      status: 'drafted',
      input: { platform: a.platform, language: a.lang },
      output: { platform: a.platform, title: a.title, draft: a.body, body: a.body },
    }],
    recommendation: {
      id: recommendationId,
      department: 'marketing',
      title: a.title,
      summary: a.body,
      recommended_channel: channel,
      priority: 'medium',
      confidence: 90,
      expected_roi: 'medium',
      estimated_cost_usd: 0,
      reason: `Concierge/COS prepared an owner-gated ${a.platform} outreach post.`,
      approval_status: 'pending_approval',
      created_at: a.now,
    },
    status: 'draft',
    risk_level: 'low',
    approval_required: true,
    metadata: {
      source: 'concierge_cos_social_outreach',
      platform: a.platform,
      social_channel: a.platform,
      owner_preview_required: true,
      social_review: 'PENDING',
      social_review_scope: 'owner_approval_required',
      social_execution_stage: 'not_started',
      publish_locked: true,
      external_action_allowed: false,
      connector_execution_allowed: false,
      owner_approval_required: true,
      concierge_requested_at: a.now,
      audience,
      body: a.body,
      owner_brief: a.brief,
    },
    created_at: a.now,
    updated_at: a.now,
  }
}

// Grounded, factual context so generated posts never invent features.
const SOCIAL_PLATFORM_CONTEXT = `SignalBoost is an AI-driven, human-monitored growth platform at saas.signalboostapp.com: it turns reviews into branded content, builds AI websites, runs image/video/audio studios, and automates multilingual campaigns (English, Spanish, Portuguese, Polish, Russian).`

const SOCIAL_POST_FALLBACK: Record<string, (p: string) => string> = {
  en: (p) => `Draft ${p} post (edit before publishing):\n\nSignalBoost helps businesses grow with AI — turning reviews into branded content, building websites, and running multilingual campaigns, all human-monitored. Want to see what it could do for your brand? Let's connect.`,
  es: (p) => `Borrador de publicación para ${p} (edítalo antes de publicar):\n\nSignalBoost ayuda a las empresas a crecer con IA: convierte reseñas en contenido de marca, crea sitios web y ejecuta campañas multilingües, siempre con supervisión humana. ¿Quieres ver qué puede hacer por tu marca? Conectemos.`,
  pt: (p) => `Rascunho de post para ${p} (edite antes de publicar):\n\nA SignalBoost ajuda empresas a crescer com IA: transforma avaliações em conteúdo de marca, cria sites e executa campanhas multilíngues, sempre com supervisão humana. Quer ver o que ela pode fazer pela sua marca? Vamos conversar.`,
  pl: (p) => `Wersja robocza posta na ${p} (edytuj przed publikacją):\n\nSignalBoost pomaga firmom rosnąć dzięki AI: zamienia opinie w treści marki, buduje strony i prowadzi wielojęzyczne kampanie — zawsze pod nadzorem człowieka. Chcesz zobaczyć, co może zrobić dla Twojej marki? Połączmy się.`,
  ru: (p) => `Черновик поста для ${p} (отредактируйте перед публикацией):\n\nSignalBoost помогает бизнесу расти с помощью ИИ: превращает отзывы в брендовый контент, создаёт сайты и запускает многоязычные кампании — всегда под контролем человека. Хотите узнать, что это даст вашему бренду? Давайте свяжемся.`,
}

// Turn the owner's free-form brief into a ready-to-publish post for the chosen
// platform, in the requested language. Never echoes the raw brief; on any model
// failure it returns a safe localized draft the owner can edit.
async function generateSocialPost(brief: string, platform: string, lang: string): Promise<string> {
  const fallback = (SOCIAL_POST_FALLBACK[lang] || SOCIAL_POST_FALLBACK.en)(platform)
  const prompt = `You are SignalBoost's marketing writer. Write ONE ready-to-publish ${platform} post based on the owner's brief below. Ground it only in the platform context — do not invent features. Match the tone of ${platform}. Keep it concise and natural. Write it in this language: ${lang}.

Return ONLY the post text — no preamble, no surrounding quotes, no markdown fences, no "here is your post".

PLATFORM CONTEXT:
${SOCIAL_PLATFORM_CONTEXT}

OWNER BRIEF:
${brief}`
  try {
    const raw = await callModel({ modelPreference: 'claude', prompt, maxTokens: 900 })
    const cleaned = String(raw || '').trim().replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/i, '').trim()
    return cleaned.length >= 20 ? cleaned : fallback
  } catch {
    return fallback
  }
}

async function createConciergeSocialCampaign(text: string, platform: string, lang = 'en'): Promise<{ id: string; platform: string }> {
  const brief = String(text || '')
  const post = await generateSocialPost(brief, platform, lang)
  const firstLine = brief.split('\n').map((s) => s.trim()).find(Boolean) || `${platform} outreach post`
  const title = firstLine.slice(0, 120)
  const now = new Date().toISOString()
  const sb = admin()
  const row = socialQueueRow({ platform, title, body: post, brief, lang, now })
  const { data, error } = await sb.from('cos_campaign_queue').insert(row).select('id').single()
  if (error) throw new Error(error.message)
  return { id: data.id, platform }
}

function socialReply(lang: string, platform: string, campaignId: string): string {
  const p = platform.charAt(0).toUpperCase() + platform.slice(1)
  const map: Record<string, string> = {
    en: `Your ${p} outreach message is saved as an owner-approvable draft (id ${campaignId}). It's held in the campaign queue for your approval — nothing posts until you approve it. Want me to refine the copy?`,
    es: `Tu mensaje de difusión para ${p} se guardó como borrador para tu aprobación (id ${campaignId}). Está en la cola de campañas y no se publicará hasta que lo apruebes. ¿Quieres que ajuste el texto?`,
    pt: `Sua mensagem de divulgação para ${p} foi salva como rascunho para sua aprovação (id ${campaignId}). Está na fila de campanhas e nada é publicado até você aprovar. Quer que eu ajuste o texto?`,
    pl: `Twoja wiadomość ${p} została zapisana jako wersja robocza do zatwierdzenia (id ${campaignId}). Czeka w kolejce kampanii — nic nie zostanie opublikowane, dopóki jej nie zatwierdzisz. Mam dopracować treść?`,
    ru: `Ваше сообщение для ${p} сохранено как черновик для вашего одобрения (id ${campaignId}). Оно в очереди кампаний и не будет опубликовано без вашего одобрения. Доработать текст?`,
  }
  return map[lang] || map.en
}

function isVideoCreationRequest(text: string): boolean {
  const t = String(text || '').toLowerCase()
  const textDeliverable = /\b(not a video|no video|text[-\s]?only|text[-\s]?message|linkedin|twitter|facebook|instagram|dm to|direct message|outreach message|cold (?:email|message|dm|outreach)|e-?mail|newsletter|blog post|caption|post copy|copywriting)\b/i.test(t)
  if (textDeliverable) return false
  const mentionsVideo = /\b(video|vídeo|clip|reel|short|tiktok|youtube|filme|movie)\b/i.test(t)
  const createVerb = /(faça|faca|crie|criar|cria|gere|gerar|gera|render|renderizar|produza|produzir|make|create|generate|render|animate|turn\s+.*\s+into|transforme|transformar)/i.test(t)
  const watchVerb = /(watch|assistir|ver\s+o\s+vídeo|ver\s+o\s+video|find|search|procure|buscar|encontre|mostre\s+um\s+video|mostrar\s+um\s+video)/i.test(t)
  return mentionsVideo && createVerb && !watchVerb
}
function isPressCreationRequest(text: string): boolean { const t = String(text || '').toLowerCase(); return /(press|print|newspaper|publisher|publication|editor|magazine|trade press|media kit|article|jornal|revista|periódico|periodico|imprensa)/i.test(t) && /(start|create|launch|prepare|publish|campaign|outreach|crie|crear|iniciar|campanha|campaña)/i.test(t) && !isVideoCreationRequest(text) }
function languageFrom(body: any, text: string): string { const ctxLang = String(body?.context?.language || '').toLowerCase(); const t = String(text || '').toLowerCase(); if (/portugu[eê]s|portuguese|pt-br|brasil|brazil/.test(t)) return 'pt'; if (/espanhol|español|spanish|latam/.test(t)) return 'es'; if (/polish|polski|polon[eê]s/.test(t)) return 'pl'; if (/russian|russo|рус/.test(t)) return 'ru'; if (['pt', 'es', 'pl', 'ru', 'en'].includes(ctxLang)) return ctxLang; return 'en' }
function channelFrom(text: string): string { return /(short|tiktok|reel|reels|vertical|9:16|story|stories)/i.test(String(text || '')) ? 'short_video' : 'youtube' }
function pressChannelFrom(text: string): PressPrintChannel { const t = String(text || '').toLowerCase(); if (/(print|offline|newspaper_print|printed|jornal impresso)/.test(t)) return 'print-newspapers'; if (/(trade press|magazine|it magazine|revista|publication trade)/.test(t)) return 'trade-press'; return 'online-newspapers' }
function fieldFrom(text: string, labels: string[]): string { for (const label of labels) { const found = new RegExp(`${label}\\s*[:\\-–]\\s*([^\\n]+)`, 'i').exec(text); if (found?.[1]) return found[1].trim().slice(0, 240) } return '' }
function titleFrom(text: string): string { return String(text || '').replace(/\s+/g, ' ').replace(/📎[\s\S]*$/, '').trim().slice(0, 110) || 'Owner requested video render' }
function hasEmail(value: string) { return /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(value) }
function hasOnlineSubmission(value: string) { return /https?:\/\//i.test(value) && /(submit|contact|media|press|form|editor|news|pr)/i.test(value) }
function paidIntent(text: string) { return /\b(paid|pay|paid\s+ad|paid\s+ads|paid\s+advertising|paid\s+placement|sponsored|sponsorship|media\s*kit|rate\s*card|buy\s+ad|purchase\s+ad)\b/i.test(text) }
function submissionMethod(value: string) { return hasEmail(value) ? 'email' : hasOnlineSubmission(value) ? 'online_form' : 'unresolved' }
function publisherTargetIsResolved(publicationName: string, editorContact: string) { const pub = String(publicationName || '').toLowerCase(); const contact = String(editorContact || '').toLowerCase(); const genericPub = !pub || /(to be selected|target to be selected|digital business publication|online newspaper|it magazine|trade press target|publication target|suitable real)/i.test(pub); const genericContact = !contact || /(to be confirmed|name, email|media-kit link|notes|editor contact|contact to be confirmed)/i.test(contact); return !genericPub && !genericContact && (hasEmail(editorContact) || hasOnlineSubmission(editorContact)) }
function queuedReply(lang: string, result: any): string { const ids = Array.isArray(result?.campaignIds) && result.campaignIds.length ? result.campaignIds.join(', ') : result?.campaignId || 'created'; const link = '/dashboard/cosa/video-pipeline'; if (lang === 'pt') return `Pedido enviado para a fila de vídeo da COSA. ID da campanha: ${ids}. Abra ${link} e clique em Refresh/Kick missing renders se o item ainda não aparecer.`; if (lang === 'es') return `Solicitud enviada a la cola de video de COSA. ID de campaña: ${ids}. Abre ${link} y pulsa Refresh/Kick missing renders si todavía no aparece.`; return `Sent this request to the COSA video pipeline. Campaign ID: ${ids}. Open ${link} and click Refresh/Kick missing renders if it does not appear yet.` }
function stopReasonText(reason: string) { if (reason === 'no_free_actual_publication_contact_found') return 'no free actual newspaper, magazine, or publication with a publisher/editor email or real free submission form was found'; if (reason === 'publisher_search_api_not_configured') return 'publisher search is not configured'; return reason }
function pressReply(lang: string, campaign: ConciergeCampaign, previewEmail: any): string { if (campaign.metadata?.target_discovery_status === 'stopped_no_publisher_contact') { const reason = stopReasonText(String(campaign.metadata?.stop_reason || 'publisher_contact_not_found')); if (lang === 'pt') return `Campanha Press & Print automática interrompida: ${reason}. Nenhuma campanha foi criada e nenhum pedido de aprovação foi enviado.`; if (lang === 'es') return `Campaña Press & Print automática detenida: ${reason}. No se creó ninguna campaña y no se envió solicitud de aprobación.`; return `Automated Press & Print campaign stopped: ${reason}. No campaign was created and no owner approval request was sent.` } const link = `/dashboard/marketing/press-print?campaign=${encodeURIComponent(campaign.id)}`; const emailStatus = previewEmail?.ok ? ' Preview email sent to the owner.' : previewEmail?.skipped || previewEmail?.error ? ` Preview email was not sent yet: ${previewEmail.reason || previewEmail.error || 'email send failed'}.` : ''; if (lang === 'pt') return `A Concierge criou a campanha Press & Print com publisher verificado. ID: ${campaign.id}. Nada será publicado até aprovação do proprietário. Revise aqui: ${link}.${emailStatus}`; if (lang === 'es') return `Concierge creó la campaña Press & Print con publisher verificado. ID: ${campaign.id}. No se publicará hasta la aprobación del propietario. Revisa aquí: ${link}.${emailStatus}`; return `Concierge created the Press & Print campaign with a verified publisher target. Campaign ID: ${campaign.id}. Nothing will publish until the owner approves it. Review it here: ${link}.${emailStatus}` }

function buildPressObjective(a: { publicationName: string; editorContact: string; headline: string; articleNotes: string; ctaUrl: string; channel: string; language: string; allowPaid: boolean }) { return [`Prepare a COS-led Press & Print Media campaign for ${a.publicationName}.`, `Publication/contact: ${a.editorContact}.`, `Submission method: ${submissionMethod(a.editorContact)}.`, `Target status: ${a.allowPaid ? 'verified paid/advertising target requested by user' : 'verified free publication target before owner approval'}.`, `Headline / campaign title: ${a.headline}.`, `Article notes: ${a.articleNotes}.`, `CTA URL: ${a.ctaUrl}.`, 'Target audience: Publication editors, readers, and business technology buyers reached through the selected press media channel.', `Requested language: ${a.language}.`, `Specific outreach channel: ${a.channel}.`, 'Safety rule: do not contact, submit, publish, or send anything externally until the owner approves the exact target and preview.'].join(' ') }
function pressQueueRow(a: { headline: string; objective: string; outreachChannel: PressPrintChannel; publicationName: string; editorContact: string; articleNotes: string; ctaUrl: string; lang: string; now: string; discoverySourceUrl?: string | null; allowPaid: boolean }) { const recommendationId = id('rec_press_print'); const audience = 'Small businesses, local businesses, agencies, entrepreneurs, and service providers.'; const method = submissionMethod(a.editorContact); return { recommendation_id: recommendationId, department: 'marketing', title: a.headline, objective: a.objective, channel: 'outreach', audience, languages: [a.lang], assets: [], work_items: [{ id: id('work_press_preview'), type: 'press_print_campaign', title: 'Prepare Press & Print publication preview', status: 'drafted', input: { channel: a.outreachChannel, publication_name: a.publicationName, editor_contact: a.editorContact, submission_method: method, cta_url: a.ctaUrl }, output: { title: a.headline, draft: a.objective, call_to_action: a.ctaUrl } }], recommendation: { id: recommendationId, department: 'marketing', title: a.headline, summary: a.objective, recommended_channel: 'outreach', priority: 'medium', confidence: 85, expected_roi: 'medium', estimated_cost_usd: 0, reason: 'Concierge/COS requested an owner-gated Press & Print campaign with a concrete publisher target.', approval_status: 'pending_approval', created_at: a.now }, status: 'draft', risk_level: 'medium', approval_required: true, metadata: { source: 'concierge_cos_press_print_campaign', automation_mode: a.allowPaid ? 'automated_paid_user_requested' : 'automated_free_only', outreach_channel: a.outreachChannel, media_channel: a.outreachChannel, publication_name: a.publicationName, editor_contact: a.editorContact, publisher_name: a.publicationName, publisher_contact_method: method, publisher_email: hasEmail(a.editorContact) ? a.editorContact.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] : null, publisher_submission_form_url: hasOnlineSubmission(a.editorContact) ? a.editorContact.match(/https?:\/\/\S+/i)?.[0] : null, publisher_discovery_source_url: a.discoverySourceUrl || null, target_discovery_status: 'resolved', headline: a.headline, article_notes: a.articleNotes, cta_url: a.ctaUrl, press_print_review: 'PENDING', press_print_review_scope: 'owner_approval_required', press_print_execution_stage: 'not_started', press_print_live_url_required: false, owner_preview_required: true, owner_preview_email_sent_at: null, owner_preview_email_status: 'pending', concierge_requested_at: a.now, audience, signal: `Publication: ${a.publicationName}. Contact: ${a.editorContact}. Headline: ${a.headline}. CTA: ${a.ctaUrl}` }, created_at: a.now, updated_at: a.now } }
async function createConciergePressCampaign(text: string, lang = 'en'): Promise<ConciergePressResult> { const outreachChannel = pressChannelFrom(text); const allowPaid = paidIntent(text); let publicationName = fieldFrom(text, ['Publication name', 'Publication', 'Media outlet']) || (outreachChannel === 'trade-press' ? 'IT magazine / trade press target to be selected by COS' : 'Digital business publication to be selected by COS'); let editorContact = fieldFrom(text, ['Editor / media contact', 'Editor contact', 'Media contact', 'Contact', 'Submission form', 'Submission URL']) || 'Name, email, phone, media-kit link, or notes to be confirmed by COS'; const headline = fieldFrom(text, ['Headline / campaign title', 'Headline', 'Campaign title']) || 'SignalBoost introduces AI-powered business growth tools for modern businesses'; const articleNotes = fieldFrom(text, ['Article notes', 'Notes']) || text; const ctaUrl = fieldFrom(text, ['CTA URL', 'CTA', 'Link']) || 'https://saas.signalboostapp.com'; let discoverySourceUrl: string | null = null; if (!publisherTargetIsResolved(publicationName, editorContact)) { const discovered: any = await discoverPublisherTarget({ brief: text, channel: outreachChannel }).catch((err) => ({ ok: false, error: errorMessage(err) })); if (discovered.ok && discovered.publicationName && discovered.editorContact) { publicationName = discovered.publicationName; editorContact = discovered.editorContact; discoverySourceUrl = discovered.sourceUrl || null } else { const stopReason = discovered.error || 'no_free_actual_publication_contact_found'; return { campaign: { id: 'stopped_no_publisher_contact', title: headline, objective: 'Automated Press & Print campaign stopped before creation because no valid free publisher contact method was found/provided.', metadata: { target_discovery_status: 'stopped_no_publisher_contact', publication_name: publicationName, editor_contact: editorContact, outreach_channel: outreachChannel, media_channel: outreachChannel, press_print_execution_stage: 'stopped', press_print_review: 'STOPPED', stop_reason: stopReason, automation_mode: allowPaid ? 'automated_paid_user_requested' : 'automated_free_only' } }, previewEmail: { ok: false, skipped: true, reason: stopReason }, stopped: true } } } const objective = buildPressObjective({ publicationName, editorContact, headline, articleNotes, ctaUrl, channel: outreachChannel, language: lang, allowPaid }); const now = new Date().toISOString(); const sb = admin(); const row = pressQueueRow({ headline, objective, outreachChannel, publicationName, editorContact, articleNotes, ctaUrl, lang, now, discoverySourceUrl, allowPaid }); const { data, error } = await sb.from('cos_campaign_queue').insert(row).select('id,title,objective,status,metadata,created_at').single(); if (error) throw new Error(error.message); const previewEmail: any = await sendPressPrintPreviewEmail({ campaignId: data.id, title: data.title || headline, objective: data.objective || objective, channel: outreachChannel, contact: `${publicationName}; ${editorContact}` }).catch((err) => ({ ok: false, error: errorMessage(err) })); const emailPatch = previewEmail.ok ? { owner_preview_email_sent_at: new Date().toISOString(), owner_preview_email_status: 'sent' } : { owner_preview_email_status: previewEmail.reason || previewEmail.error || 'not_sent' }; await sb.from('cos_campaign_queue').update({ metadata: { ...((data.metadata as any) || {}), ...emailPatch } }).eq('id', data.id); return { campaign: { ...(data as ConciergeCampaign), metadata: { ...((data.metadata as any) || {}), ...emailPatch } }, previewEmail } }

export async function POST(req: NextRequest) {
  const cloned = req.clone()
  try {
    const body = await cloned.json()
    const text = latestUserText(body)
    const attachments = Array.isArray(body?.attachments) ? body.attachments : []

    if (isSocialOutreachRequest(text)) {
      const platform = socialPlatformFrom(text)
      const ctx = await getAccess()
      if (ctx.isOwner && platform) {
        const lang = languageFrom(body, text)
        try {
          const campaign = await createConciergeSocialCampaign(text, platform, lang)
          return NextResponse.json({ reply: socialReply(lang, campaign.platform, campaign.id), source: 'concierge-cos-social-outreach-router', campaignId: campaign.id, platform: campaign.platform, execution_locked: true, approval_required: true, publish_locked: true })
        } catch (err) {
          const message = errorMessage(err)
          return NextResponse.json({ reply: `I could not create the social outreach draft yet. The server returned: ${message}`, source: 'concierge-cos-social-outreach-router', error: message }, { status: 200 })
        }
      }
    }

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
        return NextResponse.json({ reply: `I could not create the Press & Print campaign yet. The server returned: ${message}`, source: 'concierge-cos-press-router', error: message }, { status: 200 })
      }
    }
  } catch (err) {
    console.error('Concierge direct router skipped:', err)
  }
  return supportPost(req)
}

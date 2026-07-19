// saas/app/api/concierge/route.ts
// Thin alias: the Concierge widget posts here; the brain lives in /api/support.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { POST as supportPost } from '@/app/api/support/route'
import { getAccess } from '@/lib/auth/access'
import { proposeCampaign } from '@/lib/ai/proposeCampaign'
import { callModel } from '@/lib/ai/modelRouter'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

type AttachmentInfo = { name?: string; type?: string; mimeType?: string; dataUrl?: string }

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || 'unknown error')
}

function id(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function admin() {
  return createClient(
    process.env['NEXT_PUBLIC_SUPABASE_URL']!,
    process.env['SUPABASE_' + 'SERVICE_ROLE_KEY']!,
    { auth: { persistSession: false } },
  )
}

function latestUserText(body: any): string {
  const messages = Array.isArray(body?.messages) ? body.messages : []
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role !== 'user') continue
    const content = messages[i]?.content
    if (typeof content === 'string') return content
    if (Array.isArray(content)) {
      return content
        .map((block: any) => (typeof block?.text === 'string' ? block.text : ''))
        .join('\n')
        .trim()
    }
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
  return attachments
    .map((a: AttachmentInfo) => `${a?.name || 'attached file'}${attachmentMime(a) ? ` (${attachmentMime(a)})` : ''}`)
    .join(', ')
}

// A platform-specific social request may create an owner-approvable draft.
// Generic social, article, publication, press, or print wording is delegated to
// the main COS/support brain and never creates a campaign from keyword matching.
function isSocialOutreachRequest(text: string): boolean {
  const t = String(text || '').toLowerCase()
  const platform = /\b(linkedin|linked\s?in|twitter|x post|tweet|facebook|instagram|tiktok|reddit)\b/i.test(t)
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
  return ''
}

function socialQueueRow(a: {
  platform: string
  title: string
  body: string
  brief: string
  lang: string
  now: string
}) {
  const recommendationId = id('rec_social_outreach')
  const audience = `Prospects, partners, and buyers on ${a.platform}.`
  return {
    recommendation_id: recommendationId,
    department: 'marketing',
    title: a.title,
    objective: a.body,
    channel: a.platform,
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
      recommended_channel: a.platform,
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

const SOCIAL_PLATFORM_CONTEXT = `SignalBoost is an AI-driven, human-monitored growth platform at saas.signalboostapp.com: it turns reviews into branded content, builds AI websites, runs image/video/audio studios, and automates multilingual campaigns (English, Spanish, Portuguese, Polish, Russian).`

function briefBasedFallback(brief: string, platform: string): string {
  const cleaned = String(brief || '').replace(/\s+/g, ' ').trim()
  return cleaned
    ? `Draft for ${platform}, based on the owner's brief:\n\n${cleaned}`
    : `Draft for ${platform} is waiting for the owner's brief.`
}

async function generateSocialPost(brief: string, platform: string, lang: string): Promise<string> {
  const fallback = briefBasedFallback(brief, platform)
  const prompt = `You are SignalBoost's marketing writer. Write ONE ready-to-publish ${platform} post based on the owner's brief below. Ground it only in the platform context — do not invent features. Match the tone of ${platform}. Keep it concise and natural. Write it in this language: ${lang}.

Return ONLY the post text — no preamble, no surrounding quotes, no markdown fences, no "here is your post".

PLATFORM CONTEXT:
${SOCIAL_PLATFORM_CONTEXT}

OWNER BRIEF:
${brief}`
  try {
    const raw = await callModel({ modelPreference: 'openai', prompt, maxTokens: 900 })
    const cleaned = String(raw || '')
      .trim()
      .replace(/^```[a-z]*\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim()
    return cleaned.length >= 20 ? cleaned : fallback
  } catch {
    return fallback
  }
}

async function createConciergeSocialCampaign(
  text: string,
  platform: string,
  lang = 'en',
): Promise<{ id: string; platform: string }> {
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
    en: `Your ${p} outreach draft was generated from your brief and saved for owner approval (id ${campaignId}). Nothing will publish until you approve it.`,
    es: `Tu borrador para ${p} se generó a partir de tus instrucciones y se guardó para la aprobación del propietario (id ${campaignId}). No se publicará nada hasta que lo apruebes.`,
    pt: `Seu rascunho para ${p} foi gerado a partir das suas instruções e salvo para aprovação do proprietário (id ${campaignId}). Nada será publicado até você aprovar.`,
    pl: `Wersja robocza dla ${p} została utworzona na podstawie Twoich instrukcji i zapisana do zatwierdzenia przez właściciela (id ${campaignId}). Nic nie zostanie opublikowane bez zatwierdzenia.`,
    ru: `Черновик для ${p} создан по вашим инструкциям и сохранён для одобрения владельцем (id ${campaignId}). Ничего не будет опубликовано без одобрения.`,
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
  return /(short|tiktok|reel|reels|vertical|9:16|story|stories)/i.test(String(text || ''))
    ? 'short_video'
    : 'youtube'
}

function titleFrom(text: string): string {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .replace(/📎[\s\S]*$/, '')
    .trim()
    .slice(0, 110) || 'Owner requested video render'
}

function queuedReply(lang: string, result: any): string {
  const ids = Array.isArray(result?.campaignIds) && result.campaignIds.length
    ? result.campaignIds.join(', ')
    : result?.campaignId || 'created'
  const link = '/dashboard/cosa/video-pipeline'
  if (lang === 'pt') return `Pedido enviado para a fila de vídeo da COSA. ID da campanha: ${ids}. Abra ${link} e clique em Refresh/Kick missing renders se o item ainda não aparecer.`
  if (lang === 'es') return `Solicitud enviada a la cola de video de COSA. ID de campaña: ${ids}. Abre ${link} y pulsa Refresh/Kick missing renders si todavía no aparece.`
  return `Sent this request to the COSA video pipeline. Campaign ID: ${ids}. Open ${link} and click Refresh/Kick missing renders if it does not appear yet.`
}

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
          return NextResponse.json({
            reply: socialReply(lang, campaign.platform, campaign.id),
            source: 'concierge-cos-social-outreach-router',
            campaignId: campaign.id,
            platform: campaign.platform,
            execution_locked: true,
            approval_required: true,
            publish_locked: true,
          })
        } catch (err) {
          const message = errorMessage(err)
          return NextResponse.json({
            reply: `I could not create the social outreach draft yet. The server returned: ${message}`,
            source: 'concierge-cos-social-outreach-router',
            error: message,
          }, { status: 200 })
        }
      }
    }

    if (isVideoCreationRequest(text)) {
      const ctx = await getAccess()
      if (ctx.isOwner) {
        const files = attachmentSummary(attachments)
        const lang = languageFrom(body, text)
        const sourceMaterial = [
          text,
          files ? `Attached source image(s): ${files}` : '',
          'Route: Concierge direct-to-COSA video pipeline. Do not treat this as a media-search request.',
        ].filter(Boolean).join('\n')
        const result = await proposeCampaign({
          customCreative: true,
          title: titleFrom(text),
          goal: text,
          audience: 'Social media viewers and fans of the requested subject.',
          channel: channelFrom(text),
          language: lang,
          sourceMaterial,
          voiceover: sourceMaterial,
          offer: '',
        })
        if (result?.ok) {
          return NextResponse.json({
            reply: queuedReply(lang, result),
            source: 'concierge-cosa-video-router',
            campaignId: result.campaignId,
            campaignIds: result.campaignIds || null,
            render: result.render || null,
          })
        }
        return NextResponse.json({
          reply: `COSA video queue failed: ${result?.error || 'unknown error'}`,
          source: 'concierge-cosa-video-router',
        }, { status: 200 })
      }
    }
  } catch (err) {
    console.error('Concierge direct router skipped:', err)
  }

  return supportPost(req)
}

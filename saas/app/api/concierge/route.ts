// saas/app/api/concierge/route.ts
// Thin alias: the Concierge widget posts here; the brain lives in /api/support.
// CRITICAL: Next.js route segment config (maxDuration, dynamic) is read per
// route FILE and is NOT inherited through a re-export — without repeating it
// here, this route runs at Vercel's default (~15s) function timeout while the
// support brain it wraps budgets 240s for its model+tool loop. That mismatch
// silently killed any long request (e.g. campaign creation) at the platform
// level: non-JSON 504 → widget shows its generic fallback, no campaign row,
// no diagnostic. Keep these exports in sync with /api/support/route.ts.
//
// Concierge video fix: owner requests that clearly mean "create/render/generate
// a new video" must go directly into the COSA campaign video queue. They are
// NOT media-search requests and must not be answered with scripts only.

import { NextRequest, NextResponse } from 'next/server'
import { POST as supportPost } from '@/app/api/support/route'
import { getAccess } from '@/lib/auth/access'
import { proposeCampaign } from '@/lib/ai/proposeCampaign'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

type AttachmentInfo = { name?: string; type?: string; mimeType?: string; dataUrl?: string }

function latestUserText(body: any): string {
  const messages = Array.isArray(body?.messages) ? body.messages : []
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role !== 'user') continue
    const content = messages[i]?.content
    if (typeof content === 'string') return content
    if (Array.isArray(content)) {
      return content
        .map((block: any) => typeof block?.text === 'string' ? block.text : '')
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

function attachmentLooksImage(a: AttachmentInfo): boolean {
  return attachmentMime(a).startsWith('image/')
}

function attachmentSummary(attachments: any): string {
  if (!Array.isArray(attachments) || attachments.length === 0) return ''
  return attachments
    .map((a: AttachmentInfo) => `${a?.name || 'attached file'}${attachmentMime(a) ? ` (${attachmentMime(a)})` : ''}`)
    .join(', ')
}

function isVideoCreationRequest(text: string, attachments: any): boolean {
  const t = String(text || '').toLowerCase()
  const hasImageAttachment = Array.isArray(attachments) && attachments.some((a: AttachmentInfo) => attachmentLooksImage(a))
  const mentionsVideo = /\b(video|vídeo|clip|reel|short|tiktok|youtube|filme|movie)\b/i.test(t)
  const mentionsImageSource = /(foto|photo|imagem|image|picture|screenshot|print|attached image|anexo|anexada|anexado)/i.test(t)
  const createVerb = /(faça|faca|crie|criar|cria|gere|gerar|gera|render|renderizar|produza|produzir|make|create|generate|render|animate|turn\s+.*\s+into|transforme|transformar)/i.test(t)
  const watchVerb = /(watch|assistir|ver\s+o\s+vídeo|ver\s+o\s+video|find|search|procure|buscar|encontre|mostre\s+um\s+video|mostrar\s+um\s+video)/i.test(t)

  // A create/render/generate instruction wins. This catches the dashboard page,
  // the floating Concierge panel, and Portuguese requests such as
  // "faça um vídeo dessa foto" where the assistant page sends mimeType instead
  // of type for image attachments.
  return mentionsVideo && createVerb && !watchVerb && (hasImageAttachment || mentionsImageSource || true)
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

function titleFrom(text: string): string {
  const clean = String(text || '')
    .replace(/\s+/g, ' ')
    .replace(/📎[\s\S]*$/, '')
    .trim()
    .slice(0, 110)
  return clean || 'Owner requested video render'
}

function queuedReply(lang: string, result: any): string {
  const ids = Array.isArray(result?.campaignIds) && result.campaignIds.length
    ? result.campaignIds.join(', ')
    : result?.campaignId || 'created'
  const link = '/dashboard/cosa/video-pipeline'
  if (lang === 'pt') {
    return `Pedido enviado para a fila de vídeo da COSA. ID da campanha: ${ids}. Abra ${link} e clique em Refresh/Kick missing renders se o item ainda não aparecer.`
  }
  if (lang === 'es') {
    return `Solicitud enviada a la cola de video de COSA. ID de campaña: ${ids}. Abre ${link} y pulsa Refresh/Kick missing renders si todavía no aparece.`
  }
  return `Sent this request to the COSA video pipeline. Campaign ID: ${ids}. Open ${link} and click Refresh/Kick missing renders if it does not appear yet.`
}

export async function POST(req: NextRequest) {
  const cloned = req.clone()

  try {
    const body = await cloned.json()
    const text = latestUserText(body)
    const attachments = Array.isArray(body?.attachments) ? body.attachments : []

    if (isVideoCreationRequest(text, attachments)) {
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
    console.error('Concierge direct video router skipped:', err)
    // Fall through to the normal support brain. A bad pre-router parse must never
    // break regular Concierge chat.
  }

  return supportPost(req)
}

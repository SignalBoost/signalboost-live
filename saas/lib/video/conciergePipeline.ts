import type { SupabaseClient } from '@supabase/supabase-js'
import { createExtraRenderBilling } from './billing'
import { enqueueVideoJob } from './queue'
import { getSubscriptionDecision } from './subscription'

export type ConciergeIntent = 'video_transcode' | 'video_export' | 'general'
export type ConciergeLanguage = 'en' | 'es' | 'pt' | 'pl' | 'ru'

const TRANSLATIONS: Record<ConciergeLanguage, Record<string, string>> = {
  en: {
    demo: 'Free/demo accounts can preview demo playback. Upgrade to export a full burned-caption MP4.',
    over: 'Your included export quota is used. Complete an extra render payment to continue.',
    queued: 'Your video export request is queued. The worker will burn captions into an MP4 and store the render in Supabase.',
  },
  es: {
    demo: 'Las cuentas gratis/demo solo pueden ver reproducción demo. Actualiza para exportar un MP4 completo con subtítulos incrustados.',
    over: 'Tu cuota de exportación incluida se agotó. Completa un pago de render extra para continuar.',
    queued: 'Tu exportación de video está en cola. El worker incrustará subtítulos en un MP4 y guardará el render en Supabase.',
  },
  pt: {
    demo: 'Contas grátis/demo podem ver apenas a reprodução demo. Faça upgrade para exportar um MP4 completo com legendas embutidas.',
    over: 'Sua cota de exportação incluída acabou. Conclua o pagamento de um render extra para continuar.',
    queued: 'Sua exportação de vídeo está na fila. O worker gravará legendas em um MP4 e salvará o render no Supabase.',
  },
  pl: {
    demo: 'Konta darmowe/demo mają tylko odtwarzanie demo. Przejdź na płatny plan, aby wyeksportować pełny MP4 z wypalonymi napisami.',
    over: 'Wykorzystano limit eksportów. Opłać dodatkowy render, aby kontynuować.',
    queued: 'Eksport wideo trafił do kolejki. Worker wypali napisy w MP4 i zapisze wynik w Supabase.',
  },
  ru: {
    demo: 'Бесплатные/demo аккаунты получают только demo-воспроизведение. Перейдите на платный план, чтобы экспортировать полный MP4 с субтитрами.',
    over: 'Ваш лимит экспортов исчерпан. Оплатите дополнительный рендер, чтобы продолжить.',
    queued: 'Экспорт видео поставлен в очередь. Worker вшьет субтитры в MP4 и сохранит результат в Supabase.',
  },
}

export function classifyVideoIntent(text: string): ConciergeIntent {
  const value = text.toLowerCase()
  if (/\b(transcode|caption burn|burn captions|render captions|ffmpeg)\b/.test(value)) return 'video_transcode'
  if (/\b(export|download mp4|render mp4|final mp4)\b/.test(value) && /\b(video|mp4|caption)\b/.test(value)) return 'video_export'
  return 'general'
}

export function normalizeConciergeLanguage(language: unknown): ConciergeLanguage {
  const value = String(language ?? 'en').toLowerCase().slice(0, 2)
  if (value === 'es' || value === 'pt' || value === 'pl' || value === 'ru') return value
  return 'en'
}

export async function runConciergeVideoPipeline(args: {
  supabase: SupabaseClient
  userId: string
  message: string
  language?: string
  sourceVideo?: string
  captionsPath?: string
}) {
  const intent = classifyVideoIntent(args.message)
  const language = normalizeConciergeLanguage(args.language)
  if (intent === 'general') return null

  const subscription = await getSubscriptionDecision(args.supabase, args.userId)
  if (!subscription.allowed && subscription.reason === 'demo_only') {
    return { intent, reply: TRANSLATIONS[language].demo, subscription, json: { intent, action: 'demo_playback', subscription } }
  }

  if (!subscription.allowed && subscription.reason === 'over_quota') {
    const billing = await createExtraRenderBilling(args.userId, crypto.randomUUID())
    return { intent, reply: TRANSLATIONS[language].over, subscription, billing, json: { intent, action: 'billing_required', subscription, billing } }
  }

  if (!args.sourceVideo) {
    return { intent, reply: TRANSLATIONS[language].queued, subscription, json: { intent, action: 'open_transcoder_panel', subscription } }
  }

  const job = await enqueueVideoJob(args.supabase, {
    accountId: args.userId,
    userId: args.userId,
    sourceVideo: args.sourceVideo,
    captionsPath: args.captionsPath,
    jobType: intent === 'video_transcode' ? 'transcode' : 'export',
  })

  return { intent, reply: TRANSLATIONS[language].queued, subscription, job, json: { intent, action: 'queued', jobId: job.id, subscription } }
}

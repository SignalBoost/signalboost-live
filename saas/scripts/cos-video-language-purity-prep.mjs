#!/usr/bin/env node
// saas/scripts/cos-video-language-purity-prep.mjs
// Enforce one-language campaign scripts before final video generation.
//
// Existing campaign metadata can contain older mixed-language copy. The final
// renderer correctly uses metadata.campaign_script when present, so this step
// replaces mixed copy with a language-locked script and invalidates only the
// previous final artifact once. The next finalizer run rebuilds voice and
// captions from the corrected script.

import { createClient } from '@supabase/supabase-js'

const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').trim()
const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()

if (!url || !key) throw new Error('Supabase URL and service-role key are required')

const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const PURITY_VERSION = 'signalboost-language-purity-v1'

function langOf(campaign) {
  const raw = Array.isArray(campaign?.languages) && campaign.languages.length
    ? String(campaign.languages[0])
    : 'en'
  const short = raw.toLowerCase().split(/[-_]/)[0]
  return ['en', 'es', 'pt', 'pl', 'ru', 'de', 'fr', 'it', 'ja', 'ko', 'ar'].includes(short) ? short : 'en'
}

function isMaintenance(campaign) {
  return /(clear stuck|backup jobs?|maintenance|worker test|queue repair)/i.test(String(campaign?.title || ''))
}

function localizedScript(lang) {
  if (lang === 'pt') {
    return 'A iTMounts ajuda pequenas e médias empresas brasileiras a gerar mais oportunidades com campanhas profissionais e fáceis de revisar. Organize sua mensagem, prepare os materiais e acompanhe os resultados em um só lugar. Comece grátis em itmounts.com.'
  }
  if (lang === 'es') {
    return 'iTMounts ayuda a las pequeñas y medianas empresas a generar más oportunidades con campañas profesionales y fáciles de revisar. Organiza el mensaje, prepara los recursos y controla los resultados en un solo lugar. Comienza gratis en itmounts.com.'
  }
  if (lang === 'pl') {
    return 'iTMounts pomaga małym i średnim firmom zdobywać więcej klientów dzięki profesjonalnym kampaniom, które łatwo sprawdzić. Przygotuj przekaz, materiały i wyniki w jednym miejscu. Zacznij bezpłatnie na itmounts.com.'
  }
  if (lang === 'ru') {
    return 'iTMounts помогает малому и среднему бизнесу получать больше клиентов с помощью профессиональных кампаний, которые легко проверить. Подготовьте сообщение, материалы и отслеживайте результаты в одном месте. Начните бесплатно на itmounts.com.'
  }
  if (lang === 'de') {
    return 'iTMounts hilft kleinen und mittleren Unternehmen, mit professionellen, leicht prüfbaren Kampagnen mehr Chancen zu gewinnen. Bündeln Sie Ihre Botschaft, bereiten Sie die Materialien vor und verfolgen Sie die Ergebnisse an einem Ort. Starten Sie kostenlos auf itmounts.com.'
  }
  if (lang === 'fr') {
    return 'iTMounts aide les petites et moyennes entreprises à générer plus d’opportunités grâce à des campagnes professionnelles faciles à valider. Organisez votre message, préparez vos supports et suivez les résultats au même endroit. Commencez gratuitement sur itmounts.com.'
  }
  if (lang === 'it') {
    return 'iTMounts aiuta le piccole e medie imprese a generare più opportunità con campagne professionali e facili da revisionare. Organizza il messaggio, prepara i materiali e monitora i risultati in un unico posto. Inizia gratis su itmounts.com.'
  }
  if (lang === 'ja') {
    return 'iTMounts は、確認しやすいプロフェッショナルなキャンペーンで中小企業のビジネスチャンス拡大を支援します。メッセージを整理し、素材を準備し、成果を一か所で追跡できます。itmounts.com で無料で始めましょう。'
  }
  if (lang === 'ko') {
    return 'iTMounts는 검토하기 쉬운 전문 캠페인으로 중소기업의 더 많은 기회 창출을 돕습니다. 메시지를 정리하고, 자료를 준비하고, 결과를 한곳에서 추적하세요. itmounts.com에서 무료로 시작하세요.'
  }
  if (lang === 'ar') {
    return 'تساعد iTMounts الشركات الصغيرة والمتوسطة على تحقيق المزيد من الفرص من خلال حملات احترافية يسهل مراجعتها. نظّم رسالتك، وجهّز موادك، وتابع النتائج في مكان واحد. ابدأ مجانًا على itmounts.com.'
  }
  return 'iTMounts helps small and midsize businesses generate more opportunities with professional campaigns that are easy to review. Organize the message, prepare the assets, and track results in one place. Start free at itmounts.com.'
}

const { data: campaigns, error } = await sb
  .from('cos_campaign_queue')
  .select('*')
  .in('channel', ['youtube', 'short_video'])
  .neq('status', 'rejected')
  .order('created_at', { ascending: false })
  .limit(50)

if (error) throw new Error(error.message)

let prepared = 0
for (const campaign of campaigns || []) {
  if (campaign?.approved_at || isMaintenance(campaign)) continue

  const metadata = campaign?.metadata || {}
  const video = metadata?.video || {}
  if (video.status !== 'ready' || !video.url) continue

  const lang = langOf(campaign)
  const currentPurity = String(video.languagePurityVersion || '')
  const currentScript = String(metadata.campaign_script || metadata.campaignScript || '').trim()
  const desiredScript = localizedScript(lang)

  if (currentPurity === PURITY_VERSION && currentScript === desiredScript) continue

  const updatedVideo = {
    ...video,
    branded: false,
    voicedUrl: null,
    finalUrl: null,
    previewUrl: video.url || null,
    previewKind: video.url ? 'base draft' : null,
    finalSchemaVersion: null,
    brandSchemaVersion: null,
    brandedAt: null,
    voiceStatus: 'PENDING_LANGUAGE_REBUILD',
    captionsBurned: false,
    audioTrack: false,
    voiceError: null,
    languagePurityVersion: PURITY_VERSION,
    languagePurity: lang,
    languagePurityPreparedAt: new Date().toISOString(),
  }

  const nextMetadata = {
    ...metadata,
    campaign_script: desiredScript,
    campaignScript: desiredScript,
    video: updatedVideo,
  }

  const { error: updateError } = await sb
    .from('cos_campaign_queue')
    .update({ metadata: nextMetadata })
    .eq('id', campaign.id)

  if (updateError) {
    console.error(`Language purity update failed for ${campaign.id}: ${updateError.message}`)
    continue
  }

  prepared++
  console.log(`COSA campaign ${campaign.id}: locked narration/captions to ${lang}.`)
}

console.log(`COSA language purity preparation complete. Prepared: ${prepared}.`)

#!/usr/bin/env node
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
  return ['en', 'es', 'pt', 'pl', 'ru'].includes(short) ? short : 'en'
}

function isMaintenance(campaign) {
  return /(clear stuck|backup jobs?|maintenance|worker test|queue repair)/i.test(String(campaign?.title || ''))
}

function localizedScript(lang) {
  if (lang === 'pt') {
    return 'A SignalBoostAi ajuda pequenas e médias empresas brasileiras a gerar mais oportunidades com campanhas profissionais e fáceis de revisar. Organize sua mensagem, prepare os materiais e acompanhe os resultados em um só lugar. Comece grátis em saas.signalboostapp.com.'
  }
  if (lang === 'es') {
    return 'SignalBoostAi ayuda a las pequeñas y medianas empresas a generar más oportunidades con campañas profesionales y fáciles de revisar. Organiza el mensaje, prepara los recursos y controla los resultados en un solo lugar. Comienza gratis en saas.signalboostapp.com.'
  }
  if (lang === 'pl') {
    return 'SignalBoostAi pomaga małym i średnim firmom zdobywać więcej klientów dzięki profesjonalnym kampaniom, które łatwo sprawdzić. Przygotuj przekaz, materiały i wyniki w jednym miejscu. Zacznij bezpłatnie na saas.signalboostapp.com.'
  }
  if (lang === 'ru') {
    return 'SignalBoostAi помогает малому и среднему бизнесу получать больше клиентов с помощью профессиональных кампаний, которые легко проверить. Подготовьте сообщение, материалы и отслеживайте результаты в одном месте. Начните бесплатно на saas.signalboostapp.com.'
  }
  return 'SignalBoostAi helps small and midsize businesses generate more opportunities with professional campaigns that are easy to review. Organize the message, prepare the assets, and track results in one place. Start free at saas.signalboostapp.com.'
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

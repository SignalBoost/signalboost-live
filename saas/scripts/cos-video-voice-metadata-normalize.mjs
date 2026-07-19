#!/usr/bin/env node
// Normalize metadata for real local narration artifacts.
//
// The legacy field voiceFallback meant "silent base video promoted as voice".
// Real espeak-ng narration is a legitimate audio artifact, so keep its engine
// detail separately and clear the legacy fallback flag to prevent reprocessing.

import { createClient } from '@supabase/supabase-js'

const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').trim()
const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
if (!url || !key) throw new Error('Supabase URL and service-role key are required')

const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

const { data, error } = await sb
  .from('cos_campaign_queue')
  .select('id, metadata')
  .in('channel', ['youtube', 'short_video'])
  .neq('status', 'rejected')
  .order('created_at', { ascending: false })
  .limit(50)

if (error) throw new Error(error.message)

let normalized = 0
for (const campaign of data || []) {
  const video = campaign?.metadata?.video || {}
  const realLocalVoice = video.voiceFallback === true
    && video.voiceStatus === 'COMPLETED'
    && video.captionsBurned === true
    && video.audioTrack === true
    && String(video.voiceEngine || '').includes('espeak')

  if (!realLocalVoice) continue

  const patch = {
    ...video,
    voiceFallback: false,
    voiceLocalFallback: true,
    voiceLocalFallbackReason: video.voiceFallbackReason || 'Real local narration created with espeak-ng.',
  }
  delete patch.voiceFallbackReason

  const { error: updateError } = await sb
    .from('cos_campaign_queue')
    .update({ metadata: { ...(campaign.metadata || {}), video: patch } })
    .eq('id', campaign.id)

  if (updateError) {
    console.error(`Could not normalize campaign ${campaign.id}: ${updateError.message}`)
  } else {
    normalized++
    console.log(`COSA campaign ${campaign.id}: normalized real local voice metadata.`)
  }
}

console.log(`COSA voice metadata normalization complete. Updated ${normalized} campaign(s).`)

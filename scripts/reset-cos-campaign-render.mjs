#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'

const campaignId = process.argv[2] || '99cbb93f-c448-4f40-9ae2-90a817a71e69'
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })
const { data: campaign, error } = await supabase
  .from('cos_campaign_queue')
  .select('metadata')
  .eq('id', campaignId)
  .maybeSingle()

if (error) throw error
if (!campaign) throw new Error(`Campaign not found: ${campaignId}`)

const metadata = { ...(campaign.metadata || {}) }
metadata.video = {
  ...(metadata.video || {}),
  status: 'queued',
  url: null,
  voicedUrl: null,
  unbrandedVoicedUrl: null,
  voiced: {},
  unbrandedVoiced: {},
  branded: false,
  brandedLangs: {},
  brandingLock: null,
  brandingExhausted: false,
  voiceError: null,
  renderResetAt: new Date().toISOString(),
  renderResetReason: 'Forced full rerender after local FFmpeg audio/captions/banner integration fix.',
}

const { error: updateError } = await supabase
  .from('cos_campaign_queue')
  .update({ status: 'queued', metadata })
  .eq('id', campaignId)

if (updateError) throw updateError

const { error: jobError } = await supabase
  .from('cos_video_production_jobs')
  .update({ status: 'queued', error: null, output_url: null, thumbnail_url: null, updated_at: new Date().toISOString() })
  .eq('campaign_id', campaignId)

if (jobError) console.warn(`Could not reset production jobs for ${campaignId}: ${jobError.message}`)
console.log(`Campaign render cache reset: ${campaignId}`)

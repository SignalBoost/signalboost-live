// saas/lib/cos/script-worker/batchGenerator.ts
// Batch-powered, multilingual, platform-aware campaign copy generator.
//
// Drives off the campaign's REQUESTED languages (campaign.languages) and the
// channel's platform standard. Every human-readable field is produced by the
// model in the target language — no campaign copy is hardcoded. On a parse
// failure the language is marked 'error' rather than substituting fixed text.
// Publishing stays owner-gated; this only prepares review-ready drafts.
//
// tsconfig non-strict: flat results; never throws to callers.

import { createClient } from '@supabase/supabase-js'
import type { BatchRequest, BatchOutput } from '@/lib/ai/batch/openaiBatch'
import type { CosContentWorkerOutput } from './types'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'

const TABLE = 'cos_campaign_queue'
const MODEL = 'gpt-4o-mini'

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
}

// Language autonyms — each language named in its own script, so no English label
// stands in for another language.
const LANG_AUTONYM: Record<Lang, string> = {
  en: 'English',
  es: 'Espanol',
  pt: 'Portugues',
  pl: 'Polski',
  ru: 'Russkij',
}

// Platform standards expressed as language-neutral config (schema tokens +
// numbers only). The model turns these into localized copy.
type PlatformSpec = {
  format: string
  structure: 'scenes' | 'paragraphs' | 'single_message' | 'sections'
  max_chars: number
  scene_count: number
  tone: 'educational' | 'professional' | 'conversational' | 'concise' | 'persuasive'
  include_hashtags: boolean
  include_cta: boolean
}

const PLATFORM_SPEC: Record<string, PlatformSpec> = {
  youtube:         { format: 'long_form_video_script', structure: 'scenes',         max_chars: 5000, scene_count: 5, tone: 'educational',    include_hashtags: false, include_cta: true },
  short_video:     { format: 'short_video_script',     structure: 'scenes',         max_chars: 1200, scene_count: 3, tone: 'conversational', include_hashtags: true,  include_cta: true },
  linkedin:        { format: 'professional_post',      structure: 'paragraphs',     max_chars: 2800, scene_count: 0, tone: 'professional',   include_hashtags: true,  include_cta: true },
  blog:            { format: 'article',                structure: 'sections',       max_chars: 9000, scene_count: 0, tone: 'educational',    include_hashtags: false, include_cta: true },
  email:           { format: 'email',                  structure: 'paragraphs',     max_chars: 2200, scene_count: 0, tone: 'persuasive',     include_hashtags: false, include_cta: true },
  outreach:        { format: 'direct_message',         structure: 'single_message', max_chars: 900,  scene_count: 0, tone: 'concise',        include_hashtags: false, include_cta: true },
  landing_page:    { format: 'landing_copy',           structure: 'sections',       max_chars: 4000, scene_count: 0, tone: 'persuasive',     include_hashtags: false, include_cta: true },
  review_campaign: { format: 'review_request',         structure: 'single_message', max_chars: 700,  scene_count: 0, tone: 'concise',        include_hashtags: false, include_cta: true },
}

function specFor(channel: string): PlatformSpec {
  return PLATFORM_SPEC[channel] || PLATFORM_SPEC.linkedin
}

// The requested language set: the campaign's own list, falling back to whatever
// languages already exist on its work items. Never invents a default.
function requestedLanguages(campaign: any): Lang[] {
  const fromCampaign = Array.isArray(campaign?.languages) ? campaign.languages : []
  const valid = fromCampaign.filter((l: any): l is Lang => typeof l === 'string' && l in LANG_AUTONYM)
  if (valid.length) return Array.from(new Set(valid)) as Lang[]

  const items = Array.isArray(campaign?.work_items) ? campaign.work_items : []
  const fromItems = items
    .map((it: any) => it?.input?.language)
    .filter((l: any): l is Lang => typeof l === 'string' && l in LANG_AUTONYM)
  return Array.from(new Set(fromItems)) as Lang[]
}

// Model instruction. This is the one place natural-language text lives: it is the
// instruction we give the AI, not copy that ships. Every field the model returns
// is written in the requested target language.
function systemPrompt(spec: PlatformSpec, autonym: string): string {
  return [
    'You are a senior multilingual marketing copywriter.',
    `Write every human-readable field entirely in this language: ${autonym}.`,
    'Do not mix languages and do not include text in any other language.',
    `Target platform format: ${spec.format} (structure=${spec.structure}, tone=${spec.tone}).`,
    `Keep the whole output within about ${spec.max_chars} characters.`,
    spec.scene_count > 0
      ? `Provide ${spec.scene_count} scenes; each scene has label, narration and visual_direction, all written in ${autonym}.`
      : 'Do not invent scenes; return an empty scenes array and put the full body in the "draft" field.',
    spec.include_hashtags ? 'Include platform-appropriate hashtags inside the draft.' : 'Do not add hashtags.',
    spec.include_cta ? 'Include one clear call_to_action.' : 'Keep the call_to_action short.',
    'Be specific and honest. Do not fabricate statistics, prices, results or guarantees.',
    'Return ONLY a JSON object with exactly these keys: title, opening, draft, scenes, call_to_action, estimated_duration_minutes.',
    'scenes is an array of objects {label, narration, visual_direction}. estimated_duration_minutes is a number.',
    'No markdown, no commentary, no code fences. JSON only.',
  ].join(' ')
}

// One OpenAI chat-completions request per requested language. custom_id encodes
// the campaign id and language so the writeback can route each result.
export function buildCampaignCopyRequests(campaign: any): BatchRequest[] {
  const spec = specFor(String(campaign?.channel || ''))
  const langs = requestedLanguages(campaign)
  const baseBrief = String(campaign?.work_items?.[0]?.input?.brief || campaign?.objective || '')

  return langs.map((lang) => {
    const autonym = LANG_AUTONYM[lang]
    const userPayload = {
      language: autonym,
      language_code: lang,
      platform: campaign?.channel,
      platform_spec: spec,
      title: campaign?.title,
      objective: campaign?.objective,
      audience: campaign?.audience,
      brief: baseBrief,
    }
    return {
      custom_id: `${campaign.id}::${lang}`,
      body: {
        model: MODEL,
        response_format: { type: 'json_object' },
        temperature: 0.7,
        messages: [
          { role: 'system', content: systemPrompt(spec, autonym) },
          { role: 'user', content: JSON.stringify(userPayload) },
        ],
      },
    }
  })
}

// Defensive parse into the existing worker output contract. Returns null on any
// failure so the caller can mark the language 'error' instead of writing junk.
export function parseCopyContent(content: string): CosContentWorkerOutput | null {
  if (!content) return null
  try {
    const raw = JSON.parse(content)
    if (!raw || typeof raw !== 'object') return null

    const scenes = Array.isArray(raw.scenes)
      ? raw.scenes.map((s: any) => ({
          label: String(s?.label || ''),
          narration: String(s?.narration || ''),
          visual_direction: String(s?.visual_direction || ''),
        }))
      : []

    const draft = String(raw.draft || '')
    if (!draft && !scenes.length) return null

    return {
      title: String(raw.title || ''),
      opening: String(raw.opening || ''),
      draft,
      scenes,
      call_to_action: String(raw.call_to_action || ''),
      estimated_duration_minutes: Number(raw.estimated_duration_minutes) || 0,
      created_at: new Date().toISOString(),
    }
  } catch {
    return null
  }
}

// Batch-poll handler body: load the campaign, write one completed (or errored)
// work item per language, and stamp metadata. Never changes campaign status and
// never unlocks the publishing gate — the owner still drives approval.
export async function applyCampaignCopyOutputs(outputs: BatchOutput[], context: any): Promise<void> {
  const campaignId = String(context?.campaign_id || '')
  if (!campaignId) return

  const sb = db()
  const { data: campaign, error } = await sb.from(TABLE).select('*').eq('id', campaignId).single()
  if (error || !campaign) return

  const timestamp = new Date().toISOString()
  const next: any[] = Array.isArray(campaign.work_items) ? [...campaign.work_items] : []
  const baseBrief = String(next?.[0]?.input?.brief || campaign.objective || '')

  const upsertForLang = (lang: string, status: string, output: any) => {
    const idx = next.findIndex((it) => it?.kind === 'script_worker' && it?.input?.language === lang)
    if (idx >= 0) {
      next[idx] = { ...next[idx], status, output, updated_at: timestamp }
    } else {
      next.push({
        id: `work_script_${lang}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        kind: 'script_worker',
        status,
        input: {
          campaign_id: campaign.id,
          recommendation_id: campaign.recommendation_id,
          channel: campaign.channel,
          language: lang,
          brief: baseBrief,
        },
        output,
        created_at: timestamp,
        updated_at: timestamp,
      })
    }
  }

  let okCount = 0
  let errCount = 0

  for (const out of outputs || []) {
    const lang = String(out?.custom_id || '').split('::')[1] || ''
    if (!lang) continue
    const parsed = parseCopyContent(out?.content || '')
    if (parsed) {
      upsertForLang(lang, 'completed', parsed)
      okCount++
    } else {
      upsertForLang(lang, 'error', undefined)
      errCount++
    }
  }

  const metadata = {
    ...(campaign.metadata || {}),
    last_worker: 'campaign_copy_batch',
    last_worker_completed_at: timestamp,
    languages_drafted: okCount,
    languages_failed: errCount,
    all_languages_drafted: errCount === 0 && okCount > 0,
    publishing_gate: 'locked_until_owner_approval',
  }

  await sb.from(TABLE).update({ work_items: next, metadata }).eq('id', campaign.id)
}

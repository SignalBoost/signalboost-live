// Durable-intent routing boundary for the support API.
//
// Long-running owner work is promoted into background jobs BEFORE the bounded chat
// handler sees it. Cheap deterministic customer help, durable reuse, and COS-local
// reasoning are resolved here BEFORE routeCore initializes an external model client.

import { NextRequest, NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'
import { getConciergeAnswer } from '@/lib/platform/unifiedPlatform'
import { decideSupportLocalPreflight } from '@/lib/cos-core/layers/autonomy/supportPreflight'
import { createSupabaseCOSStores } from '@/lib/cos-core/storage/supabase'
import { tryCOSFirstAnswer } from '@/lib/ai/cos/cosFirstAnswer'
import {
  isStableSupportReuseCandidate,
  loadSupportReuse,
  saveSupportReuse,
  supportReuseKey,
} from '@/lib/cos/supportResponseReuse'
import {
  parseProspectCampaignRequest,
  prospectCampaignQueuedReply,
  prospectCampaignQueueError,
} from '@/lib/outreach/prospectCampaignRequest'
import { createProspectCampaignJob } from '@/lib/outreach/prospectCampaign'
import {
  createPressCampaignJob,
  parsePressCampaignRequest,
  pressCampaignQueuedReply,
} from '@/lib/outreach/pressCampaign'
import {
  createOwnerEngineeringMission,
  engineeringMissionQueuedReply,
  isOwnerEngineeringRequest,
  listActiveOwnerEngineeringMissions,
} from '@/lib/ai/cos/engineeringMission'
import { ensureCosMissionStore } from '@/lib/ai/cos/autonomy/missionStoreBootstrap'

export { guardConfabulatedAction } from './routeCore'
export const maxDuration = 300

function latestUserMessage(body: any): string {
  const messages = Array.isArray(body?.messages) ? body.messages : []
  for (let i = messages.length - 1; i >= 0; i--) {
    const item = messages[i]
    if (item?.role === 'user' && typeof item?.content === 'string' && item.content.trim()) {
      return item.content.trim()
    }
  }
  return ''
}

function languageCode(body: any): string {
  const value = String(body?.context?.language || 'en').toLowerCase()
  return ['en', 'es', 'pt', 'pl', 'ru'].includes(value) ? value : 'en'
}

function routedReply(reply: string, source: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ reply, telemetry: { source, ...extra }, source, ...extra })
}

async function recordLocalSavings(prompt: string, startedAt: number, source: 'business_rule' | 'exact_cache') {
  try {
    const stores = createSupabaseCOSStores()
    if (!stores) return
    await stores.roi.record({
      taskId: 'support',
      source,
      providerCalls: 0,
      estimatedProviderCostUsd: 0,
      estimatedCostAvoidedUsd: 0,
      promptCharactersBefore: prompt.length,
      promptCharactersAfter: 0,
      latencyMs: Date.now() - startedAt,
    })
  } catch {
    // Savings telemetry is best-effort and must never turn a free local answer into a failure.
  }
}

function asksEngineeringStatus(text: string): boolean {
  return /\b(engineering|coding|code|repo|github|deployment|vercel|mission|build|pull request|pr)\b/i.test(text)
    && /\b(status|progress|still running|what.*doing|where.*at|finished|done)\b/i.test(text)
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now()
  const body = await req.clone().json().catch(() => ({}))
  const prompt = latestUserMessage(body)
  const lang = languageCode(body)
  const access = await getAccess()
  const privileged = Boolean(access.isOwner || access.isAdmin)

  if (privileged && prompt && asksEngineeringStatus(prompt)) {
    const active = await listActiveOwnerEngineeringMissions().catch(() => [])
    if (active.length) {
      const lines = active.slice(0, 8).map((mission: any) => `• ${mission.title || mission.id}: ${mission.status || 'running'}`)
      return routedReply(lines.join('\n'), 'owner_engineering_status', { mission_count: active.length })
    }
  }

  if (privileged && prompt && isOwnerEngineeringRequest(prompt)) {
    try {
      await ensureCosMissionStore()
      const mission = await createOwnerEngineeringMission({ prompt, userId: access.userId || null, language: lang })
      return routedReply(engineeringMissionQueuedReply(mission, lang), 'owner_engineering_mission', { mission_id: mission.id })
    } catch (error) {
      return routedReply(String(error instanceof Error ? error.message : error), 'owner_engineering_mission_error')
    }
  }

  const prospectRequest = parseProspectCampaignRequest(prompt)
  if (prospectRequest) {
    try {
      const job = await createProspectCampaignJob({ ...prospectRequest, userId: access.userId || null })
      return routedReply(prospectCampaignQueuedReply(job, lang), 'prospect_campaign_job', { job_id: job.id })
    } catch (error) {
      return routedReply(prospectCampaignQueueError(error, lang), 'prospect_campaign_job_error')
    }
  }

  const pressRequest = parsePressCampaignRequest(prompt)
  if (pressRequest) {
    try {
      const job = await createPressCampaignJob({ ...pressRequest, userId: access.userId || null })
      return routedReply(pressCampaignQueuedReply(job, lang), 'press_campaign_job', { job_id: job.id })
    } catch (error) {
      return routedReply(String(error instanceof Error ? error.message : error), 'press_campaign_job_error')
    }
  }

  const platformAnswer = prompt ? await getConciergeAnswer(prompt, { userId: access.userId || undefined, language: lang }).catch(() => null) : null
  if (platformAnswer?.answer) return routedReply(platformAnswer.answer, 'platform_unified')

  const localPreflight = prompt ? await decideSupportLocalPreflight({ prompt, userId: access.userId || null, language: lang }).catch(() => null) : null
  if (localPreflight?.handled && localPreflight.reply) {
    void recordLocalSavings(prompt, startedAt, localPreflight.source === 'exact_cache' ? 'exact_cache' : 'business_rule')
    return routedReply(localPreflight.reply, localPreflight.source, localPreflight.telemetry || {})
  }

  const reusablePrompt = prompt && isStableSupportReuseCandidate(prompt) ? prompt : null
  const reusableKey = reusablePrompt ? supportReuseKey(reusablePrompt, lang) : null
  if (reusableKey) {
    const reused = await loadSupportReuse(reusableKey).catch(() => null)
    if (reused?.reply) {
      void recordLocalSavings(prompt, startedAt, 'exact_cache')
      return routedReply(reused.reply, 'support_response_reuse')
    }
  }

  const cosFallback = prompt
    ? await tryCOSFirstAnswer({ prompt, userId: access.userId || null, language: lang, privileged }).catch(() => null)
    : null

  if (cosFallback?.handled) {
    return routedReply(cosFallback.reply, 'local_cos_reasoning', {
      confidence_score: cosFallback.confidence,
      provenance: cosFallback.provenance,
      external_ai_invoked: false,
    })
  }

  const core = await import('./routeCore')
  const response = await core.POST(req)

  if (reusableKey && reusablePrompt && response.ok) {
    try {
      const payload = await response.clone().json()
      const reply = typeof payload?.reply === 'string' ? payload.reply.trim() : ''
      const source = String(payload?.source || '')
      if (reply && !source.includes('error')) {
        void saveSupportReuse(reusableKey, reply)
      }
    } catch {
      // Reuse persistence is best-effort and must never affect the live response.
    }
  }

  const unresolvedCOS = cosFallback && !cosFallback.handled ? cosFallback : null
  if (unresolvedCOS && response.ok) {
    try {
      const payload = await response.clone().json()
      return NextResponse.json({
        ...payload,
        external_ai_invoked: true,
        cos_local_attempt: {
          attempted: unresolvedCOS.provenance.localModelInvoked,
          confidence_score: unresolvedCOS.confidence,
          escalation_reason: 'reason' in unresolvedCOS ? unresolvedCOS.reason : 'external_fallback_required',
          provenance: unresolvedCOS.provenance,
        },
      }, { status: response.status })
    } catch {
      // Preserve the executor response unchanged when it is not JSON.
    }
  }

  return response
}
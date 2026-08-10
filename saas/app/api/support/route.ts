// Durable-intent routing boundary for the support API.
//
// Long-running owner work is promoted into background jobs BEFORE the bounded chat
// handler sees it. Cheap deterministic customer help is also resolved here BEFORE
// routeCore initializes an external model client.

import { NextRequest, NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'
import { getConciergeAnswer } from '@/lib/platform/unifiedPlatform'
import { decideSupportLocalPreflight } from '@/lib/cos-core/layers/autonomy/supportPreflight'
import { createSupabaseCOSStores } from '@/lib/cos-core/storage/supabase'
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

async function recordLocalSavings(prompt: string, startedAt: number) {
  try {
    const stores = createSupabaseCOSStores()
    if (!stores) return
    await stores.roi.record({
      taskId: 'support',
      source: 'business_rule',
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
  return /\b(status|progress|how(?:'s| is)|where are we|what happened|still working|audit status)\b/i.test(text)
    && /\b(fix|repair|engineering|repo|repository|audit|bug|pipeline|platform|mission)\b/i.test(text)
}

function engineeringStatusReply(mission: any): string {
  const state = mission.state || {}
  const trace = Array.isArray(state.trace) ? state.trace.slice(-3) : []
  const recent = trace.length
    ? trace.map((item: any) => `- ${item.action}: ${item.summary}`).join('\n')
    : '- No tool action has completed yet.'
  const commit = state.lastCommit
    ? `\nBranch: ${state.lastCommit.branch}\nPR: ${state.lastCommit.prUrl || 'not created yet'}\nCommit: ${state.lastCommit.sha || 'none'}`
    : `\nBranch: ${state.branch || 'not assigned'}\nNo commit has been created yet.`
  const blocked = state.blockedReason ? `\nBlock: ${state.blockedReason}` : ''
  return `COS engineering mission ${mission.id}\nStatus: ${mission.status}\nIteration: ${state.iteration || 0}/${state.maxIterations || '?'}${commit}${blocked}\nRecent grounded work:\n${recent}\nCOS continues automatically while the mission remains active; you do not need to say “continue”.`
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now()
  try {
    const copy = req.clone()
    const body = await copy.json().catch(() => null)
    const text = latestUserMessage(body)

    if (text) {
      const access = await getAccess().catch(() => null)
      if (access?.isOwner) {
        const engineeringIntent = isOwnerEngineeringRequest(text)
        const statusIntent = asksEngineeringStatus(text)

        if (engineeringIntent || statusIntent) {
          const store = await ensureCosMissionStore()
          if (!store.ok) {
            console.error('COS mission-store recovery unavailable:', store.error)
          } else {
            if (statusIntent) {
              const active = await listActiveOwnerEngineeringMissions(20)
              const mission = active.find(item => !access.userId || item.user_id === access.userId) || active[0]
              if (mission) return routedReply(engineeringStatusReply(mission), 'cos-engineering-mission-status')
            }

            if (engineeringIntent) {
              const started = await createOwnerEngineeringMission({ objective: text, userId: access.userId || null })
              if (started.ok && started.mission) {
                const repairNote = store.repaired ? ' COS repaired its mission persistence automatically before starting.' : ''
                return routedReply(`${engineeringMissionQueuedReply(started.mission)}${repairNote}`, 'cos-engineering-mission-router')
              }
              console.error('COS engineering mission creation failed after store verification:', started.error)
            }
          }
        }

        const lang = languageCode(body)

        const press = parsePressCampaignRequest(text, lang)
        if (press) {
          const started = await createPressCampaignJob({
            brief: text,
            goal: press.goal,
            region: press.region,
            language: press.language,
            requestedCount: press.requestedCount,
            createdBy: access.userId || null,
          })
          if (!started.ok || !started.job) {
            return routedReply(`Press campaign could not be started: ${started.error || 'unknown error'}. Nothing was sent and no publication was contacted.`, 'campaign-intent-router')
          }
          return routedReply(pressCampaignQueuedReply({
            jobId: started.job.id,
            requestedCount: started.job.requested_count,
            region: started.job.region,
            capNote: started.capNote,
            duplicateOf: started.duplicateOf,
          }), 'campaign-intent-router')
        }

        const prospect = parseProspectCampaignRequest(text, lang)
        if (prospect) {
          const started = await createProspectCampaignJob({
            offer: prospect.offer,
            targetCriteria: prospect.targetCriteria,
            region: prospect.region,
            requestedCount: prospect.requestedCount,
            language: prospect.language,
            createdBy: access.userId || null,
          })
          if (!started.ok || !started.job) {
            return routedReply(prospectCampaignQueueError(started.error || 'unknown error', prospect.language), 'campaign-intent-router')
          }
          return routedReply(prospectCampaignQueuedReply({
            jobId: started.job.id,
            requestedCount: started.job.requested_count,
            region: started.job.region,
            language: started.job.language,
          }), 'campaign-intent-router')
        }
      }

      // Customer/visitor zero-provider path. Owner/admin traffic deliberately bypasses
      // this gate because privileged requests need the full grounded COS executor.
      const isPrivileged = Boolean(access?.isAdmin || access?.isOwner)
      if (!isPrivileged && body?.executeMode !== true) {
        const lang = languageCode(body)
        const currentPage = String(body?.context?.currentPage || '/')
        const local = getConciergeAnswer(text, lang, currentPage)
        const decision = decideSupportLocalPreflight({
          prompt: text,
          localReply: local.reply,
          isPrivileged,
          executeMode: false,
        })
        if (decision.handled) {
          const output = decision.output as { reply: string; source: string; providerCalls: number }
          void recordLocalSavings(text, startedAt)
          return routedReply(output.reply, output.source, { providerCalls: 0, local: true })
        }
      }
    }
  } catch (error) {
    console.error('support durable-intent/local-preflight router failed:', error)
  }

  // Anything uncertain, current, actionable, privileged, or tool-shaped falls through
  // to the existing grounded executor. The optimization is deliberately fail-closed.
  const core = await import('./routeCore')
  return core.POST(req)
}

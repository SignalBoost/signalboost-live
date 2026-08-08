// Durable-intent routing boundary for the support API.
//
// Long-running owner work is promoted into background jobs BEFORE the bounded chat
// handler sees it. This prevents an HTTP turn ending from becoming a mission stop.

import { NextRequest, NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'
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
} from '@/lib/ai/cos/engineeringMission'

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

function routedReply(reply: string, source: string) {
  return NextResponse.json({
    reply,
    telemetry: { source },
    source,
  })
}

export async function POST(req: NextRequest) {
  try {
    const copy = req.clone()
    const body = await copy.json().catch(() => null)
    const text = latestUserMessage(body)

    if (text) {
      const access = await getAccess().catch(() => null)
      if (access?.isOwner) {
        // ENGINEERING FIRST. A sentence such as "the outreach campaign is not working,
        // fix it" contains campaign vocabulary but is a software-repair mission, not a
        // request to launch a new campaign. Durable engineering intent therefore wins
        // over press/prospect routing whenever the owner is describing a broken system.
        if (isOwnerEngineeringRequest(text)) {
          const started = await createOwnerEngineeringMission({
            objective: text,
            userId: access.userId || null,
          })
          if (!started.ok || !started.mission) {
            return routedReply(
              `COS could not start the engineering mission: ${started.error || 'unknown error'}. No code was changed.`,
              'cos-engineering-mission-router',
            )
          }
          return routedReply(engineeringMissionQueuedReply(started.mission), 'cos-engineering-mission-router')
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
    }
  } catch {
    // Routing is additive and fail-open: a router problem must never break the existing
    // support/COSA handler. Delegate below exactly as before.
  }

  const core = await import('./routeCore')
  return core.POST(req)
}

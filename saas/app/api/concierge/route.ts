// saas/app/api/concierge/route.ts
import { after, NextRequest, NextResponse } from 'next/server'
import { POST as supportPost } from '@/app/api/support/route'
import { buildBoundedResearchPartial, planResearchTask, type ResearchTaskPlan, type VerifiedResearchResult } from '@/lib/ai/cos/researchBudget'
import { getExternalInfo } from '@/lib/ai/tools/getExternalInfo'
import { persistTurn } from '@/lib/ai/tools/conversationHistory'
import { getAccess } from '@/lib/auth/access'
import { detectPrimaryCorruption } from '@/lib/cos-backup/policy'
import { recordCosRecovery, runBackupCos } from '@/lib/cos-backup/runtime'
import { advanceProspectCampaigns, createProspectCampaignJob } from '@/lib/outreach/prospectCampaign'
import {
  advancePressCampaigns,
  createPressCampaignJob,
  parsePressCampaignRequest,
  pressCampaignQueuedReply,
} from '@/lib/outreach/pressCampaign'
import {
  campaignBriefMiss,
  parseProspectCampaignRequest,
  prospectCampaignQueuedReply,
  prospectCampaignQueueError,
} from '@/lib/outreach/prospectCampaignRequest'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

// The support route has its own 240-second model/tool budget, WITH ITS OWN
// graceful degradation built in (round cap, forced final synthesis, self-
// correction). This outer deadline MUST stay ABOVE that 240s inner budget —
// setting it lower (as a prior version of this file did, at 195s) silently
// discards the inner route's real, synthesized answer every time, before its
// own degradation logic ever runs, and replaces it with this file's much
// weaker single-search fallback. 260s leaves the inner route its full 240s
// plus buffer, while staying under the platform-level 300-second limit so the
// browser still always receives a terminal response instead of an endless
// "Thinking…" state.
const PRIMARY_TIMEOUT_MS = 260_000

// Start a read-only research lifeline shortly before the hard outer deadline.
// Normal requests never pay for this duplicate lookup: the timer is cancelled
// when Primary finishes. If Primary is still running, the lifeline preserves a
// bounded set of source-backed results for an honest partial response.
const RESEARCH_LIFELINE_START_MS = 235_000
const RESEARCH_RESULT_LIMIT = 12

function latestUserText(body: any): string {
  const messages = Array.isArray(body?.messages) ? body.messages : []
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role !== 'user') continue
    const content = messages[i]?.content
    if (typeof content === 'string') return content
    if (Array.isArray(content)) {
      return content.map((block: any) => String(block?.text || '')).join('\n').trim()
    }
  }
  return ''
}

function languageFrom(body: any): string {
  const value = String(body?.context?.language || 'en').toLowerCase()
  return ['en', 'es', 'pt', 'pl', 'ru'].includes(value) ? value : 'en'
}

function conversationIdFrom(body: any): string | null {
  const value = String(body?.context?.conversationId || '')
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null
}

async function directProspectCampaign(
  body: any,
  input: string,
  language: string,
): Promise<NextResponse | null> {
  const parsed = parseProspectCampaignRequest(input, language)

  // THE SILENT FALL-THROUGH WAS THE WORST PART OF THIS.
  //
  // When parsing failed this returned null and the brief went to the ordinary assistant,
  // which answered it as a question — thoughtfully, at length, and about nothing that was
  // asked. No job, no id, and NOTHING saying the campaign had not started. The operator
  // discovered it by going to look for drafts that did not exist.
  //
  // A message that was never campaign-shaped still falls through silently, which is correct:
  // an ordinary question deserves an ordinary answer. Only a NEAR MISS is reported, and the
  // report names the missing piece.
  if (!parsed) {
    const miss = campaignBriefMiss(input)
    if (!miss) return null
    const nearMissAccess = await getAccess().catch(() => null)
    if (!nearMissAccess?.isOwner) return null
    return NextResponse.json({
      reply: miss,
      source: 'cos-prospect-campaign-not-recognised',
      background_job: false,
      execution_allowed: false,
      external_action_taken: false,
    })
  }

  // Only the verified owner may create this durable business job. Everyone else
  // falls through to the governed support route, which keeps its existing access
  // controls and customer-facing behavior.
  const access = await getAccess().catch(() => null)
  if (!access?.isOwner) return null

  try {
    const started = await createProspectCampaignJob({
      offer: parsed.offer,
      targetCriteria: parsed.targetCriteria,
      region: parsed.region,
      requestedCount: parsed.requestedCount,
      language: parsed.language,
      createdBy: access.userId || null,
    })

    if (!started.ok || !started.job) {
      return NextResponse.json({
        reply: prospectCampaignQueueError(started.error || 'unknown queue error', language),
        source: 'cos-prospect-campaign-queue-error',
        background_job: false,
        execution_allowed: false,
        external_action_taken: false,
      })
    }

    const reply = prospectCampaignQueuedReply({
      jobId: started.job.id,
      requestedCount: started.job.requested_count,
      region: started.job.region,
      language,
    })
    const conversationId = conversationIdFrom(body)

    // Kick the exact job immediately after the response so a previously stuck campaign
    // can never steal this campaign's first worker tick. Cron remains the durable retry
    // path and uses fair scheduling across all unfinished campaigns.
    after(async () => {
      const tasks: Promise<unknown>[] = [advanceProspectCampaigns(started.job.id)]
      if (access.userId && conversationId) {
        tasks.push(persistTurn({
          conversationId,
          userId: access.userId,
          userMessage: input,
          assistantReply: reply,
        }))
      }
      await Promise.allSettled(tasks)
    })

    return NextResponse.json({
      reply,
      source: 'cos-prospect-campaign-queued',
      background_job: true,
      job_id: started.job.id,
      requested_count: started.job.requested_count,
      region: started.job.region,
      status: started.job.status,
      execution_allowed: false,
      external_action_taken: false,
      approval_required_before_send: true,
    })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown queue error'
    return NextResponse.json({
      reply: prospectCampaignQueueError(detail, language),
      source: 'cos-prospect-campaign-queue-error',
      background_job: false,
      execution_allowed: false,
      external_action_taken: false,
    })
  }
}

async function responseSnapshot(response: Response): Promise<{ reply: string; source: string }> {
  try {
    const payload = await response.clone().json()
    return {
      reply: String(payload?.reply || payload?.message || ''),
      source: String(payload?.source || payload?.telemetry?.source || ''),
    }
  } catch {
    try {
      return { reply: await response.clone().text(), source: '' }
    } catch {
      return { reply: '', source: '' }
    }
  }
}

function sourceCommit(): string {
  return process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || 'runtime-unknown'
}

function timestamp(): string {
  return new Date().toISOString().replace('T', ' ').replace('Z', '')
}

function boundedPrimary(req: NextRequest): Promise<{ response: Response | null; timedOut: boolean }> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<{ response: null; timedOut: true }>((resolve) => {
    timer = setTimeout(() => resolve({ response: null, timedOut: true }), PRIMARY_TIMEOUT_MS)
  })
  const primary = supportPost(new NextRequest(req.clone()))
    .then((response) => ({ response, timedOut: false as const }))
    .catch(() => ({ response: null, timedOut: false as const }))
  return Promise.race([primary, deadline]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

async function directPressCampaign(
  body: any,
  input: string,
  language: string,
): Promise<NextResponse | null> {
  const parsed = parsePressCampaignRequest(input, language)
  // Not a multi-outlet press brief — an ordinary question deserves an ordinary answer,
  // and a single-outlet pitch still fits comfortably in one turn.
  if (!parsed) return null

  // Only the verified owner may create this durable business job. Everyone else falls
  // through to the governed support route with its existing access controls.
  const access = await getAccess().catch(() => null)
  if (!access?.isOwner) return null

  try {
    const started = await createPressCampaignJob({
      goal: parsed.goal,
      region: parsed.region,
      language: parsed.language,
      requestedCount: parsed.requestedCount,
      createdBy: access.userId || null,
    })

    if (!started.ok || !started.job) {
      return NextResponse.json({
        reply: `The press campaign could not be queued: ${started.error || 'unknown queue error'}. Nothing was started and no editor was contacted.`,
        source: 'cos-press-campaign-queue-error',
        background_job: false,
        execution_allowed: false,
        external_action_taken: false,
      })
    }

    const reply = pressCampaignQueuedReply({
      jobId: started.job.id,
      requestedCount: started.job.requested_count,
      region: started.job.region,
      capNote: started.capNote,
      duplicateOf: started.duplicateOf,
    })
    const conversationId = conversationIdFrom(body)

    // Kick the worker straight after the response so the first drafts do not wait for
    // the next cron tick. The cron remains the durable retry path; persisting the turn
    // is best-effort and must never delay the acknowledgement that the job is safe.
    after(async () => {
      const tasks: Promise<unknown>[] = [advancePressCampaigns()]
      if (access.userId && conversationId) {
        tasks.push(persistTurn({
          conversationId,
          userId: access.userId,
          userMessage: input,
          assistantReply: reply,
        }).then(() => undefined).catch(() => undefined))
      }
      await Promise.allSettled(tasks)
    })

    return NextResponse.json({
      reply,
      source: 'cos-press-campaign-queued',
      background_job: true,
      job_id: started.job.id,
      execution_allowed: false,
      external_action_taken: false,
    })
  } catch (error) {
    return NextResponse.json({
      reply: `The press campaign could not be queued: ${error instanceof Error ? error.message : 'unexpected error'}. Nothing was started and no editor was contacted.`,
      source: 'cos-press-campaign-queue-error',
      background_job: false,
      execution_allowed: false,
      external_action_taken: false,
    })
  }
}

type ResearchLifeline = {
  cancel: () => void
  results: () => Promise<VerifiedResearchResult[]>
}

function createResearchLifeline(plan: ResearchTaskPlan | null): ResearchLifeline | null {
  if (!plan) return null

  let resultPromise: Promise<VerifiedResearchResult[]> | null = null
  const start = () => {
    if (!resultPromise) {
      resultPromise = getExternalInfo(
        plan.researchQuery,
        Math.min(plan.requestedTotal, RESEARCH_RESULT_LIMIT),
      )
        .then((result) => result.ok ? result.results : [])
        .catch(() => [])
    }
    return resultPromise
  }

  const timer = setTimeout(() => { void start() }, RESEARCH_LIFELINE_START_MS)
  return {
    cancel: () => clearTimeout(timer),
    results: () => {
      clearTimeout(timer)
      return start()
    },
  }
}

function timeoutReply(language: string) {
  const messages: Record<string, string> = {
    en: 'This request reached the bounded processing limit before the final response was ready. No one was contacted and no external action was taken. Reply “continue this task” and COS will continue from the original request.',
    es: 'Esta solicitud alcanzó el límite de procesamiento antes de que la respuesta final estuviera lista. No se contactó a nadie ni se realizó ninguna acción externa. Responda “continuar esta tarea” y COS continuará desde la solicitud original.',
    pt: 'Esta solicitação atingiu o limite de processamento antes de a resposta final ficar pronta. Ninguém foi contatado e nenhuma ação externa foi realizada. Responda “continuar esta tarefa” e o COS continuará a partir do pedido original.',
    pl: 'To żądanie osiągnęło limit przetwarzania, zanim odpowiedź końcowa była gotowa. Z nikim się nie skontaktowano i nie wykonano żadnej czynności zewnętrznej. Odpowiedz „kontynuuj to zadanie”, a COS podejmie pracę od pierwotnej prośby.',
    ru: 'Этот запрос достиг лимита обработки до подготовки итогового ответа. Ни с кем не связывались и никаких внешних действий не выполнялось. Ответьте «продолжить эту задачу», и COS продолжит исходный запрос.',
  }
  return messages[language] || messages.en
}

export async function POST(req: NextRequest) {
  const body = await req.clone().json().catch(() => ({}))
  const input = latestUserText(body)
  const language = languageFrom(body)

  // Multi-company outreach is a durable job, not a four-minute chat response.
  // Dispatch it before any web-search lifeline, model call, backup comparison, or
  // long HTTP transport can fail. This is the exact class of request that used to
  // end as “Sorry, I could not answer that right now.”
  const prospectCampaign = await directProspectCampaign(body, input, language)
  if (prospectCampaign) return prospectCampaign

  // A MULTI-OUTLET PRESS CAMPAIGN IS THE SAME SHAPE OF WORK, and for five rounds it
  // was attempted in the turn anyway. "Find thirty publications and prepare a campaign
  // for each" is a live crawl plus thirty AI-written releases; the bounded limit is 260
  // seconds. It never fitted, so the owner kept receiving a polished document, a
  // “reply continue” message, and an empty cockpit. Dispatched here for the same reason
  // and in the same place as sales: before anything that can time out.
  const pressCampaign = await directPressCampaign(body, input, language)
  if (pressCampaign) return pressCampaign

  const researchPlan = planResearchTask(input)
  const researchLifeline = createResearchLifeline(researchPlan)

  const primaryRun = await boundedPrimary(req)
  if (primaryRun.timedOut) {
    if (researchPlan && researchLifeline) {
      const partial = buildBoundedResearchPartial(
        researchPlan,
        await researchLifeline.results(),
        language,
      )
      return NextResponse.json({
        reply: partial.reply,
        source: 'cos-bounded-research-partial',
        timed_out: true,
        partial_completion: true,
        completed_count: partial.completed,
        total_count: partial.total,
        remaining_count: partial.remaining,
        continuation_available: partial.continuationAvailable,
        continuation_prompt: partial.continuationPrompt,
        deliverables: {
          research: partial.researchState,
          outreach_draft: partial.draftState,
        },
        execution_allowed: partial.executionAllowed,
        external_action_taken: partial.externalActionTaken,
      })
    }

    return NextResponse.json({
      reply: timeoutReply(language),
      source: 'cos-bounded-timeout',
      timed_out: true,
      continuation_available: true,
      continuation_prompt: 'Continue the previous task from the original request. Do not take any external action without explicit human approval.',
      execution_allowed: false,
      external_action_taken: false,
    })
  }
  researchLifeline?.cancel()
  const primary = primaryRun.response

  // Primary authentication, authorization, validation, and rate-limit decisions
  // are terminal. Backup COS must never turn a governed 4xx denial into HTTP 200,
  // and it must not invoke the redundant provider for a denied request.
  if (primary && primary.status >= 400 && primary.status < 500) return primary

  const primarySnapshot = primary
    ? await responseSnapshot(primary)
    : { reply: '', source: '' }
  const immediateReasons = detectPrimaryCorruption({
    status: primary?.status ?? 500,
    reply: primarySnapshot.reply,
    source: primarySnapshot.source,
  })

  if (primary && immediateReasons.length === 0) {
    const healthyPrimary = primary

    // Run the optional read-only shadow comparison only after the healthy Primary
    // response is ready. It cannot delay the user response and remains bounded by
    // runBackupCos's hard deadline.
    after(async () => {
      const backup = await runBackupCos(input, language).catch(() => null)
      if (!backup?.ok) return
      const shadowReasons = detectPrimaryCorruption({
        status: healthyPrimary.status,
        reply: primarySnapshot.reply,
        source: primarySnapshot.source,
        backup,
      })
      if (!shadowReasons.includes('primary_backup_quality_divergence')) return
      await recordCosRecovery({
        ok: true,
        sourceCommit: sourceCommit(),
        action: 'Flagged Primary for Review',
        reason: shadowReasons.join(', '),
        timestamp: timestamp(),
        divergenceDetails: shadowReasons,
        recoveryStatus: 'primary_returned_shadow_alert',
      })
    })
    return healthyPrimary
  }

  // A failed, empty, canned, or error-degraded Primary response is quarantined
  // for this request. Only degraded requests invoke and await Backup COS.
  const backup = await runBackupCos(input, language).catch(() => null)
  const reasons = detectPrimaryCorruption({
    status: primary?.status ?? 500,
    reply: primarySnapshot.reply,
    source: primarySnapshot.source,
    backup,
  })
  const recovered = Boolean(backup?.ok)
  const commit = sourceCommit()

  await recordCosRecovery({
    ok: recovered,
    sourceCommit: commit,
    action: 'Activated Backup Read-Only Continuity',
    reason: reasons.join(', ') || 'Primary unavailable',
    timestamp: timestamp(),
    divergenceDetails: reasons,
    recoveryStatus: recovered ? 'backup_read_only_active' : 'backup_failed',
  })

  if (recovered && backup) {
    return NextResponse.json({
      reply: backup.answer,
      source: 'backup-cos-continuity',
      continuity_mode: 'backup_read_only',
      primary_quarantined: true,
      divergence: reasons,
      sourceCommit: commit,
      execution_allowed: false,
      approval_required: backup.requiresApproval,
    })
  }

  return NextResponse.json({
    reply: 'COS continuity protection detected a primary failure. The immutable core remains protected, but both reasoning providers are temporarily unavailable. No action was executed.',
    source: 'cos-immutable-core-fallback',
    continuity_mode: 'immutable_core_only',
    primary_quarantined: true,
    divergence: reasons,
    sourceCommit: commit,
    execution_allowed: false,
  }, { status: 200 })
}
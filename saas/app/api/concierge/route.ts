import { after, NextRequest, NextResponse } from 'next/server'
import { POST as supportPost } from '@/app/api/support/route'
import { buildBoundedResearchPartial, planResearchTask, type ResearchTaskPlan, type VerifiedResearchResult } from '@/lib/ai/cos/researchBudget'
import { getExternalInfo } from '@/lib/ai/tools/getExternalInfo'
import { detectPrimaryCorruption } from '@/lib/cos-backup/policy'
import { recordCosRecovery, runBackupCos } from '@/lib/cos-backup/runtime'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

// The support route has its own 240-second model/tool budget. Keep a smaller
// outer deadline so the browser always receives a terminal response before the
// platform-level 300-second limit. A timed-out research request must never leave
// the dashboard on an endless "Thinking…" state.
const PRIMARY_TIMEOUT_MS = 195_000

// Start a read-only research lifeline shortly before the hard outer deadline.
// Normal requests never pay for this duplicate lookup: the timer is cancelled
// when Primary finishes. If Primary is still running, the lifeline preserves a
// bounded set of source-backed results for an honest partial response.
const RESEARCH_LIFELINE_START_MS = 165_000
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

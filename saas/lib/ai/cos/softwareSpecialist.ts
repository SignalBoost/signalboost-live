// saas/lib/ai/cos/softwareSpecialist.ts
import { selectBuilderProject, builderProjectBlockedReply, isNewBuilderProjectObjective } from '@/lib/builder/project-continuity'
import { isBuilderProposalApproval, wantsBuilderProposal, readBuilderProposal, proposalMatches } from '@/lib/builder/proposal'
import { readBuilderWorkspaceFingerprint, saveBuilderProposal } from '@/lib/builder/job-store'
import { explainBuilderEvidence } from '@/lib/builder/explain-evidence'
import { createBuilderCodingAiPort } from '@/lib/cos/aiPort'
import { createGovernedBuilderAiPort } from '@/lib/builder/control-adapter'
import { builderRepositoryImportIntent, builderRepositoryTarget, importBuilderRepository, builderRepositoryErrorReply } from '@/lib/builder/repository-import'
import { after, NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'
import { publicAuditUserId } from '@/lib/auth/publicAuditIdentity'
import { isConciergeBuilderObjective, type CosCodingRoutingContext } from '@/lib/ai/cos/cosReasoningRolePolicy'
import { isSoftwareRepairRequest } from '@/lib/ai/cos/softwareRepairIntent'
import { resolveResponseLanguage } from '@/lib/i18n/responseLanguage'
import type { SupportedLanguage } from '@/lib/i18n/supportedLanguages'
import { trimObjectiveForHarness, runSoftwareDelegationWithSafeRetry } from '@/lib/ai/cos/softwareSpecialistRecovery'
export { extractFailureEvidence } from '@/lib/ai/cos/softwareSpecialistRecovery'
import { isOperationalLogEvidence } from '@/lib/ai/cos/pastedOperationalLog'
import { createSupabaseBuilderWorkspace } from '@/lib/builder/workspace-supabase'
import { extractBuilderSourceFiles, planDebugFileJob } from '@/lib/builder/debug-file-job'
import { enqueueBuilderJob } from '@/lib/builder/job-store'
import { readBuilderEvidenceJob } from '@/lib/builder/job-store'
import { builderEvidenceReply, isBuilderEvidenceRequest, isBuilderProjectQuestion } from '@/lib/builder/execution-evidence'
import { runBuilderJob } from '@/lib/builder/job-runner'
import {
  parseSignalBoostRepositoryRepairTarget,
  signalBoostDeployedRepairTarget,
  type SignalBoostRepositoryRepairTarget,
} from '@/lib/builder/repository-repair-target'
import { enqueueSignalBoostRepositoryRepairJob } from '@/lib/builder/repository-repair-job'
import { readBuilderObjective } from '@/lib/builder/request-contract'
import { runCosSoftwareSpecialistProductionHarness } from '@/lib/ai/cos/softwareSpecialistHarness'
import { builderExecutionAdmissionBlocker } from '@/lib/builder/execution-admission'
import {
  COS_PRIMARY_SOFTWARE_DELEGATION_CAPABILITY,
  createCosProductionIngressManifest,
  currentCosHarnessIngress,
  withCosHarnessIngress,
} from '@/platform-harness/adapters/cos-ingress'

export type CosSoftwareSpecialistSurface = 'concierge' | 'assistant'

export type CosSoftwareSpecialistRequest = Readonly<{
  body: any
  objective: string
  surface: CosSoftwareSpecialistSurface
  allowRepositoryRepair?: boolean
  signalBoostDeploymentContext?: boolean
  deployment?: Readonly<{
    commitSha?: string | null
    branch?: string | null
  }>
}>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SOURCE_ATTACHMENT = /\.(?:c?js|mjs|cts|mts|ts|tsx|jsx|py|html|css|json|sql|sh|bash|java|cpp|cc|cxx|cs|go|rs|php|rb|swift|kt)$/i
const SIGNALBOOST_OPERATIONAL_TARGET = /\b(?:signalboost-live|(?:saas\.)?signalboostapp\.com)\b/i
const DESIGN_ARTIFACT = /\b(?:website|web\s*page|landing(?:\s|-)?page|dashboard|user interface|ui|component|mockup|prototype)\b/i
const DESIGN_REQUEST = /(?:^(?:please\s+)?(?:design|build|create|make)\b|\b(?:can|could)\s+you\b|\b(?:i\s+(?:need|want|would\s+like)|give\s+me|help\s+me)\b)/i

function routingContext(body: any): CosCodingRoutingContext {
  const attachments = Array.isArray(body?.attachments) ? body.attachments : []
  return {
    attachmentNames: attachments.map((item: any) => String(item?.name || '')),
    attachmentMimeTypes: attachments.map((item: any) => String(item?.mimeType || item?.type || '')),
    attachmentSizes: attachments.map((item: any) => Number(item?.size || 0)),
  }
}

function hasSourceAttachment(context: CosCodingRoutingContext): boolean {
  return (context.attachmentNames || []).some(name => SOURCE_ATTACHMENT.test(String(name || '').trim()))
}

function hasImageOrPdfAttachment(body: any): boolean {
  const attachments = Array.isArray(body?.attachments) ? body.attachments : []
  return attachments.some((item: any) => /image\/|application\/pdf/i.test(String(item?.mimeType || item?.type || '')))
}

function conversationIdFrom(body: any): string | null {
  const value = String(body?.context?.conversationId || '')
  return UUID.test(value) ? value : null
}

function workspaceIdFrom(body: any): string {
  const requested = String(body?.workspaceId || body?.context?.workspaceId || '').trim()
  return UUID.test(requested) ? requested : crypto.randomUUID()
}

function softwareSpecialistFields(skill: string) {
  return {
    specialist_family: 'software',
    specialist_skill: skill,
    orchestrator: 'cos',
  }
}

// Asked when a repair request arrives with nothing to repair yet: one concrete next step, never a dead end.
const SOURCE_REQUEST_REPLY: Readonly<Record<SupportedLanguage, string>> = Object.freeze({
  en: 'I can fix that. Attach the file or files involved, paste the code here, or send the link to a public GitHub repository, and I will find the problem, repair it, run the tests and send you back the corrected files.',
  es: 'Puedo arreglarlo. Adjunta el archivo o los archivos afectados, pega el código aquí o envía el enlace a un repositorio público de GitHub, y encontraré el problema, lo repararé, ejecutaré las pruebas y te devolveré los archivos corregidos.',
  pt: 'Posso corrigir isso. Anexe o arquivo ou os arquivos envolvidos, cole o código aqui ou envie o link de um repositório público do GitHub, e eu vou encontrar o problema, corrigi-lo, executar os testes e devolver os arquivos corrigidos.',
  pl: 'Mogę to naprawić. Dołącz plik lub pliki, których to dotyczy, wklej tutaj kod albo wyślij link do publicznego repozytorium GitHub, a znajdę problem, naprawię go, uruchomię testy i odeślę poprawione pliki.',
  ru: 'Я могу это исправить. Прикрепите нужный файл или файлы, вставьте код сюда или пришлите ссылку на публичный репозиторий GitHub — я найду проблему, исправлю её, запущу тесты и верну вам исправленные файлы.',
  de: 'Das kann ich beheben. Hängen Sie die betroffene Datei oder Dateien an, fügen Sie den Code hier ein oder senden Sie den Link zu einem öffentlichen GitHub-Repository, dann finde ich das Problem, behebe es, führe die Tests aus und schicke Ihnen die korrigierten Dateien zurück.',
  fr: 'Je peux corriger cela. Joignez le ou les fichiers concernés, collez le code ici ou envoyez le lien d’un dépôt GitHub public, et je trouverai le problème, le corrigerai, exécuterai les tests et vous renverrai les fichiers corrigés.',
  it: 'Posso risolverlo. Allega il file o i file coinvolti, incolla qui il codice o invia il link a un repository GitHub pubblico, e troverò il problema, lo correggerò, eseguirò i test e ti rimanderò i file corretti.',
  ja: '修正できます。対象のファイルを添付するか、ここにコードを貼り付けるか、公開 GitHub リポジトリのリンクを送ってください。問題を特定して修正し、テストを実行してから、修正済みのファイルをお返しします。',
  ko: '고칠 수 있습니다. 관련 파일을 첨부하거나, 여기에 코드를 붙여 넣거나, 공개 GitHub 저장소 링크를 보내 주세요. 문제를 찾아 수정하고 테스트를 실행한 뒤 수정된 파일을 돌려드리겠습니다.',
  ar: 'يمكنني إصلاح ذلك. أرفق الملف أو الملفات المعنية، أو الصق الشيفرة هنا، أو أرسل رابط مستودع GitHub عام، وسأجد المشكلة وأصلحها وأشغّل الاختبارات ثم أعيد إليك الملفات المصحّحة.',
})

function runningReply(jobId: string): string {
  return `COS Software Specialist is running Builder job ${jobId}. Progress and the final result are durable in History; the action will not be replayed.`
}

async function enqueueRepositoryRepair(input: {
  body: any
  objective: string
  userId: string
  target: SignalBoostRepositoryRepairTarget
  signal?: AbortSignal
}) {
  if (input.signal?.aborted) throw new Error('harness_software_specialist_delegation_aborted')
  const conversationId = conversationIdFrom(input.body) || crypto.randomUUID()
  const objective = readBuilderObjective({ objective: input.objective }).objective
  const job = await enqueueSignalBoostRepositoryRepairJob({
    userId: input.userId,
    conversationId,
    objective,
    target: input.target,
  })
  if (input.signal?.aborted) return NextResponse.json({
    reply: 'COS Software Specialist stopped before starting repository repair because its Harness deadline expired.',
    execution_allowed: false,
    external_action_taken: false,
  }, { status: 503 })
  after(async () => { await runBuilderJob(job.jobId, input.userId) })
  return NextResponse.json({
    ...job,
    status: 'queued',
    source: 'cos-platform-engineer',
    ...softwareSpecialistFields('software.platform-repair'),
  }, { status: 202 })
}

/**
 * COS-owned Software Specialist execution seam.
 *
 * Surfaces may supply the user's request and surface context, but they do not independently choose
 * a coding brain. This function owns the software-specialist admission/execution decision while
 * preserving the existing public-workspace and owner-only repository-repair authority boundaries.
 */
async function tryCosSoftwareSpecialistLegacy(
  input: CosSoftwareSpecialistRequest,
  signal?: AbortSignal,
): Promise<NextResponse | null> {
  const rawObjective = String(input.objective || '').trim()
  let objective = trimObjectiveForHarness(rawObjective)
  if (!objective) return null
  if (signal?.aborted) throw new Error('harness_software_specialist_delegation_aborted')

  const context = routingContext(input.body)
  const sourceAttached = hasSourceAttachment(context)
  const mediaAttached = hasImageOrPdfAttachment(input.body)
  const roleMatched = isConciergeBuilderObjective(objective, context)
  const designMatched = DESIGN_ARTIFACT.test(objective) && DESIGN_REQUEST.test(objective)
  const importRequested = builderRepositoryImportIntent(objective)
  const repairRequested = isSoftwareRepairRequest(objective)
  const specialistRelevant = sourceAttached
    || mediaAttached
    || repairRequested
    || roleMatched
    || designMatched
    || importRequested
    || isBuilderProposalApproval(objective)
    || wantsBuilderProposal(objective)
    || isBuilderEvidenceRequest(objective)
    || isBuilderProjectQuestion(objective)
    || (input.allowRepositoryRepair === true && isOperationalLogEvidence(objective))

  // Ordinary Concierge conversation must never pay the Builder/project-state admission cost.
  // In Production this mattered during a local-inference outage: a simple educational question was
  // forced through Software Specialist storage/evidence lookups before COS could fail closed, leaving
  // the browser displaying "connection active" for minutes. Only software-shaped requests may cross
  // this boundary; general questions continue directly to the ordinary COS answer path.
  if (!specialistRelevant) return null

  const access = await getAccess().catch(() => null)

  const priorAnswer = (Array.isArray(input.body?.messages) ? input.body.messages : [])
    .filter((message: any) => message?.role === 'assistant' && typeof message.content === 'string').at(-1)?.content || ''
  let explanationModelInvoked = false
  if (isBuilderProposalApproval(objective) && !sourceAttached && !(Array.isArray(input.body?.files) && input.body.files.length) && !mediaAttached) {
    const userId = access?.userId || publicAuditUserId()
    const conversationId = conversationIdFrom(input.body)
    if (userId && conversationId) {
      try {
        const job = await readBuilderEvidenceJob({ userId, conversationId })
        if (job && job.metadata.platformRepair !== true) {
          const proposal = readBuilderProposal(job.metadata.pendingProposal)
          if (job.status !== 'succeeded' || !proposal || !proposalMatches(proposal, {
            sourceJobId: job.id, fingerprint: await readBuilderWorkspaceFingerprint(userId, job.workspaceId), priorAnswer, now: Date.now(),
          })) return NextResponse.json({ reply: 'There is no current, unchanged Builder proposal to apply. Ask me to suggest the next improvement for this project.', execution_allowed: false })
          return NextResponse.json({ reply: 'Builder V2 requires a fresh workspace; legacy proposal continuation is unavailable. Start a new V2 task.', execution_allowed: false, source: 'builder-v2-only' }, { status: 409 })
        }
      } catch {
        return NextResponse.json({ reply: 'I could not safely start that saved proposal. It may already be running or the project may have changed. Check the project status before retrying.', execution_allowed: false }, { status: 409 })
      }
    }
  }
  const evidence = await builderEvidenceReply({
    prompt: objective,
    userId: access?.userId || publicAuditUserId(),
    conversationId: conversationIdFrom(input.body),
    priorAnswer,
    hasNewSource: sourceAttached || (Array.isArray(input.body?.files) && input.body.files.length > 0) || mediaAttached,
    allowRepositoryEvidence: input.surface === 'assistant' && access?.isOwner === true,
  }, readBuilderEvidenceJob, async job => {
    const ai = createGovernedBuilderAiPort(createBuilderCodingAiPort(), { deadlineAtMs: Date.now() + 45_000 })
    const workspace = createSupabaseBuilderWorkspace(job.userId)
    const fingerprint = job.status === 'succeeded' && job.metadata.platformRepair !== true && wantsBuilderProposal(objective)
      ? await readBuilderWorkspaceFingerprint(job.userId, job.workspaceId) : null
    return explainBuilderEvidence({ prompt: objective, job,
      workspace: workspace ? { readFile: (id, path) => workspace.readExistingFile(id, path) } : null,
      ai: { generate: request => { explanationModelInvoked = true; return ai.generate(request) } },
      ...(fingerprint ? { saveProposal: async (proposed: string) => {
        await saveBuilderProposal({ userId: job.userId, conversationId: job.conversationId, sourceJobId: job.id, fingerprint, objective: proposed })
      } } : {}),
    })
  })
  if (evidence !== null) return NextResponse.json({
    reply: evidence, source: 'cos-builder-recorded-evidence',
    execution_allowed: false, external_action_taken: false,
    local_model_invoked: explanationModelInvoked, external_ai_invoked: false,
    ...softwareSpecialistFields('software.verify'),
  })

  if (input.allowRepositoryRepair && access?.isOwner && access.userId && !sourceAttached) {
    const operationalEvidence = isOperationalLogEvidence(rawObjective)
    const exactTarget = operationalEvidence ? parseSignalBoostRepositoryRepairTarget(rawObjective) : null
    const ownerDeveloperLogSubmission = operationalEvidence
      && (SIGNALBOOST_OPERATIONAL_TARGET.test(rawObjective) || input.signalBoostDeploymentContext === true)
    const deployment = {
      commitSha: input.deployment?.commitSha || undefined,
      branch: input.deployment?.branch || undefined,
    }
    const target = exactTarget
      ?? signalBoostDeployedRepairTarget(rawObjective, deployment)
      ?? signalBoostDeployedRepairTarget(rawObjective, deployment, {
        ownerDeveloperLogSubmission,
        ownerPlatformEngineeringSubmission: input.signalBoostDeploymentContext === true,
      })

    if (target) {
      return enqueueRepositoryRepair({
        body: input.body,
        objective,
        userId: access.userId,
        target,
        signal,
      })
    }
  }

  let repositoryTarget
  try { repositoryTarget = importRequested ? builderRepositoryTarget(objective, input.body?.repositoryUrl) : null }
  catch (error) { return NextResponse.json({ reply: builderRepositoryErrorReply((error as Error).message), execution_allowed: false }, { status: 400 }) }

  // A new project never inherits the workspace the surface had selected (same rule as /api/builder; Codex on #4639).
  const newProject = isNewBuilderProjectObjective(objective)
  const selectionBody = newProject ? {} : input.body
  const project = await selectBuilderProject({
    objective, userId: access?.userId || publicAuditUserId(), conversationId: conversationIdFrom(input.body),
    requestedWorkspaceId: String(selectionBody?.workspaceId || selectionBody?.context?.workspaceId || ''),
    hasNewSource: sourceAttached || (Array.isArray(input.body?.files) && input.body.files.length > 0),
    repositoryImport: Boolean(repositoryTarget),
  }, readBuilderEvidenceJob)
  if (project.blocked) return NextResponse.json({ reply: builderProjectBlockedReply(project.blocked), execution_allowed: false }, { status: project.blocked === 'busy' ? 409 : 503 })

  // A plain-language repair request with nothing to repair yet. The owner's request is a platform
  // repair at the deployed revision (fix, test, commit, merge); anyone else is asked for the code
  // instead of being given a generic answer.
  const suppliedSource = sourceAttached || (Array.isArray(input.body?.files) && input.body.files.length > 0)
  if (repairRequested && !suppliedSource && !mediaAttached && !repositoryTarget && !project.context) {
    if (input.allowRepositoryRepair && access?.isOwner && access.userId) {
      const target = signalBoostDeployedRepairTarget(rawObjective, {
        commitSha: input.deployment?.commitSha || undefined,
        branch: input.deployment?.branch || undefined,
      }, { ownerRepairWithoutSource: true })
      if (target) return enqueueRepositoryRepair({ body: input.body, objective, userId: access.userId, target, signal })
    }
    return NextResponse.json({
      reply: SOURCE_REQUEST_REPLY[resolveResponseLanguage(rawObjective, input.body?.context?.language)],
      source: 'cos-builder-source-requested',
      execution_allowed: false,
      external_action_taken: false,
      ...softwareSpecialistFields('software.repair'),
    })
  }

  if (mediaAttached || !(roleMatched || designMatched || repairRequested || repositoryTarget || project.context)) return null
  // PR #4719: Builder V2 continues and repairs an existing project; only an explicitly selected
  // workspace with no recorded job in this conversation is refused.
  if (!project.context && selectionBody?.workspaceId) return NextResponse.json({ reply: 'Builder V2 requires a fresh workspace; legacy workspace continuation is disabled.', execution_allowed: false, source: 'builder-v2-only' }, { status: 409 })

  // Public Concierge intentionally receives guest access under public-delivery scope. Its server-
  // captured audit identity may own an isolated workspace, but it never gains owner repository authority.
  const builderUserId = access?.userId || publicAuditUserId()
  if (!builderUserId || !UUID.test(builderUserId)) {
    return NextResponse.json({
      reply: 'I can debug and build that in an isolated sandbox. Sign in so the Software Specialist can attach a workspace to your account, then send the same request again.',
      source: 'cos-builder-sign-in-required',
      execution_allowed: false,
      external_action_taken: false,
      ...softwareSpecialistFields('software.build'),
    })
  }

  const workspace = createSupabaseBuilderWorkspace(builderUserId)
  if (!workspace) {
    return NextResponse.json({
      reply: 'COS Software Specialist storage is unavailable right now. No code was run.',
      source: 'cos-builder-storage-unavailable',
      execution_allowed: false,
      external_action_taken: false,
      ...softwareSpecialistFields('software.build'),
    }, { status: 503 })
  }

  const workspaceId = project.workspaceId || workspaceIdFrom(selectionBody)
  if (signal?.aborted) throw new Error('harness_software_specialist_delegation_aborted')
  await workspace.ensureWorkspace(workspaceId)
  let stagedFiles = extractBuilderSourceFiles([
    ...(Array.isArray(input.body?.files) ? input.body.files : []),
    ...(Array.isArray(input.body?.attachments) ? input.body.attachments : []),
  ])
  if (repositoryTarget) {
    try {
      if ((await workspace.listFiles(workspaceId)).length || stagedFiles.length) throw new Error('builder_repository_requires_empty_workspace')
      const imported = await importBuilderRepository(repositoryTarget)
      stagedFiles = imported.files
      objective += `\nSource imported from ${imported.repository} at commit ${imported.commitSha}${imported.directory ? `, folder ${imported.directory}` : ''}.`
    } catch (error) {
      return NextResponse.json({ reply: builderRepositoryErrorReply((error as Error).message), execution_allowed: false }, { status: 422 })
    }
  }
  for (const file of stagedFiles) {
    if (signal?.aborted) throw new Error('harness_software_specialist_delegation_aborted')
    await workspace.writeFile(workspaceId, file.path, file.content)
  }

  const conversationId = conversationIdFrom(input.body) || crypto.randomUUID()
  const jobId = crypto.randomUUID()
  const debugPlan = repositoryTarget ? null : planDebugFileJob(objective, stagedFiles)
  if (debugPlan) return NextResponse.json({ reply: 'Legacy Builder debug mode is retired. Use a fresh Builder V2 request.', execution_allowed: false, source: 'builder-v2-only' }, { status: 409 })
  const reply = runningReply(jobId)
  const specialistSkill = debugPlan ? 'software.repair' : 'software.build'

  try {
    if (signal?.aborted) throw new Error('harness_software_specialist_delegation_aborted')
    await enqueueBuilderJob({
      jobId,
      workspaceId,
      userId: builderUserId,
      conversationId,
      objective,
      jobKind: debugPlan ? 'debug_file' : 'standard',
      metadata: debugPlan
        ? {
            productionHarnessRunId: currentCosHarnessIngress()?.manifest.runId ?? null,
            debugPath: debugPlan.path,
            debugCommand: debugPlan.command,
            debugRuntime: debugPlan.runtime,
            debugPaths: debugPlan.files,
          }
        : { productionHarnessRunId: currentCosHarnessIngress()?.manifest.runId ?? null, ...(project.context ? { projectContext: project.context } : {}),
            // The claimed worker re-reads the existing workspace before any edit (same rule as /api/builder).
            ...(project.context && !stagedFiles.length ? { requiresExistingSource: true } : {}),
            builderEngine: 'v2' },
      ownerAuthorized: access?.isOwner === true,
      runningReply: reply,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'builder_job_enqueue_failed'
    return NextResponse.json({
      reply: `COS Software Specialist stopped: ${message}`,
      source: 'cos-builder',
      workspaceId,
      files: stagedFiles.map(file => file.path),
      execution_allowed: true,
      external_action_taken: false,
      ...softwareSpecialistFields(specialistSkill),
    }, { status: 422 })
  }
  if (signal?.aborted) throw new Error('harness_software_specialist_delegation_aborted')
  after(async () => { await runBuilderJob(jobId, builderUserId) })

  return NextResponse.json({
    reply,
    source: 'cos-builder',
    jobId,
    workspaceId,
    status: 'queued',
    files: stagedFiles.map(file => file.path),
    execution_allowed: true,
    external_action_taken: false,
    ...softwareSpecialistFields(specialistSkill),
  }, { status: 202 })
}

/**
 * Public COS-owned Software Specialist seam.
 *
 * Non-software turns exit before Harness admission. Every software-shaped turn is delegated through
 * the Production Harness before the legacy specialist controller can read project state, enqueue a
 * Builder job, or schedule repository repair. The legacy controller remains the deeper authority
 * boundary for owner-only repository operations.
 */
export async function tryCosSoftwareSpecialist(input: CosSoftwareSpecialistRequest): Promise<NextResponse | null> {
  const objective = String(input.objective || '').trim()
  if (!objective) return null

  const context = routingContext(input.body)
  const sourceAttached = hasSourceAttachment(context)
  const mediaAttached = hasImageOrPdfAttachment(input.body)
  // Guidance-only requests must not enqueue Builder or mutate a repository.
  // The default remains autonomous for existing clients; collaboration requires consent.
  const assistanceMode = input.body?.assistanceMode ?? input.body?.context?.assistanceMode
  const specialistRelevant = sourceAttached
    || mediaAttached
    || isSoftwareRepairRequest(objective)
    || isConciergeBuilderObjective(objective, context)
    || (DESIGN_ARTIFACT.test(objective) && DESIGN_REQUEST.test(objective))
    || builderRepositoryImportIntent(objective)
    || isBuilderProposalApproval(objective)
    || wantsBuilderProposal(objective)
    || isBuilderEvidenceRequest(objective)
    || isBuilderProjectQuestion(objective)
    || (input.allowRepositoryRepair === true && isOperationalLogEvidence(objective))

  if (!specialistRelevant) return null

  if (assistanceMode === 'guide') return null
  if (assistanceMode === 'collaborate') {
    return NextResponse.json({
      reply: 'I can prepare and explain the proposed code changes. To authorize Builder to make changes, switch to Handle it for me. Repository access remains separately permissioned.',
      source: 'cos-builder-approval-required',
      assistanceMode: 'collaborate',
      execution_allowed: false,
      external_action_taken: false,
      ...softwareSpecialistFields('software.guide'),
    })
  }

  const admissionBlocker = builderExecutionAdmissionBlocker(objective)
  if (admissionBlocker) return NextResponse.json({
    ...admissionBlocker,
    source: 'cos-builder-admission-blocked',
    ...softwareSpecialistFields('software.delegate'),
  }, { status: 422 })

  const existingParent = currentCosHarnessIngress()?.manifest ?? null
  if (!existingParent) {
    let parentManifest
    try {
      parentManifest = createCosProductionIngressManifest({
        objective,
        tenantId: 'itmounts',
        requestedCapabilities: [COS_PRIMARY_SOFTWARE_DELEGATION_CAPABILITY],
      })
    } catch {
      return NextResponse.json({
        reply: 'COS Software Specialist could not establish its parent Production Harness. No software work was started.',
        source: 'cos-software-parent-harness-unavailable',
        execution_allowed: false,
        external_action_taken: false,
        ...softwareSpecialistFields('software.delegate'),
      }, { status: 503 })
    }
    return withCosHarnessIngress(parentManifest, () => tryCosSoftwareSpecialist(input))
  }

  const access = await getAccess().catch(() => null)
  const tenantId = String(existingParent.identity.tenantId || access?.userId || publicAuditUserId() || '').trim()
  if (!tenantId) {
    return NextResponse.json({
      reply: 'COS Software Specialist could not establish a durable execution identity. No software work was started.',
      source: 'cos-software-harness-identity-unavailable',
      execution_allowed: false,
      external_action_taken: false,
      ...softwareSpecialistFields('software.delegate'),
    }, { status: 503 })
  }

  const execute = async (signal?: AbortSignal) => {
    try {
      const delegated = await tryCosSoftwareSpecialistLegacy(input, signal)
      // A recognized executable software request must never silently fall through
      // to the generic conversational answer generator when delegation declines.
      // Guidance requests intentionally use the ordinary conversation path above.
      if (delegated === null && (isConciergeBuilderObjective(objective, context)
        || (DESIGN_ARTIFACT.test(objective) && DESIGN_REQUEST.test(objective))
        || builderRepositoryImportIntent(objective))) {
        return NextResponse.json({
          reply: 'COS recognized a software execution request but could not admit it to Builder. No execution has been confirmed. Check History for an existing job before retrying.',
          source: 'cos-builder-handoff-unavailable',
          execution_allowed: false,
          external_action_taken: false,
          ...softwareSpecialistFields('software.delegate'),
        }, { status: 503 })
      }
      return delegated
    } catch (error) {
      // Cancellation stays a Harness outcome. Never report an uncertain queued action as unstarted.
      if (signal?.aborted) throw error
      console.error('[cos-software-legacy-error]', error instanceof Error ? error.name : 'unknown')
      return NextResponse.json({
        reply: 'The Software Specialist encountered an execution error. Check History for a queued job before retrying; send the failing log excerpt and file name if no job was created.',
        source: 'cos-software-legacy-error',
        execution_allowed: false,
        external_action_taken: false,
        ...softwareSpecialistFields('software.delegate'),
      }, { status: 200 })
    }
  }
  const harness = await runSoftwareDelegationWithSafeRetry(
    guarded => runCosSoftwareSpecialistProductionHarness({
      objective: trimObjectiveForHarness(objective),
      tenantId,
      parentManifest: existingParent,
      execute: guarded,
    }),
    execute,
  )

  if (harness.ok === false) {
    const why: Record<string, string> = {
      harness_software_specialist_exact_scope_required: 'the request was not given software permission',
      harness_evidence_sink_unavailable: 'the audit log database was unreachable',
      software_specialist_delegation_not_executed: 'delegation could not be verified',
      harness_software_specialist_delegation_aborted: 'the delegation deadline expired',
    }
    const reason = why[harness.code]
      ?? (harness.code.startsWith('child_capability_widening_forbidden:')
        ? 'the parent request was not given software permission'
        : 'the execution permission or limit check failed')
    console.error('[cos-software-harness-blocked]', harness.runId, harness.code)
    return NextResponse.json({
      reply: access?.isOwner
        ? `The Software Specialist could not complete delegation: ${reason}. (run ${harness.runId}, code ${harness.code}) Check History before retrying.`
        : `The Software Specialist could not complete delegation: ${reason}. Check History before retrying.`,
      source: 'cos-software-harness-blocked',
      execution_allowed: false,
      external_action_taken: false,
      harness_run_id: harness.runId,
      ...(access?.isOwner ? { harness_failure_code: harness.code } : {}),
      ...softwareSpecialistFields('software.delegate'),
    }, { status: 200 })
  }

  return harness.value
}


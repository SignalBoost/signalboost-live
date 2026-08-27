// saas/lib/ai/cos/cosReasoner.ts
//
// COS'S OWN REASONER — strict independence boundary.
//
// The COS-first path may use only the LOCAL_AI_* inference seam. That seam can point
// to self-hosted Ollama/vLLM/TGI or to an approved managed open-model runtime that
// exposes an OpenAI-compatible transport. Provider ownership is provenance, not identity:
// COS memory, evidence, governance and learning remain COS-owned regardless of runtime.
//
// IMPORTANT: Anthropic/OpenAI/Gemini closed-model fallback routes are intentionally
// NOT accepted here. They belong only in the explicitly labelled external escalation
// layer. A managed open-model runtime such as DeepInfra is allowed only through the
// same exact-host allow-list + API-key controls as any other remote LOCAL_AI_* endpoint.

import { randomUUID } from 'node:crypto'
import { callLocalModel, localInferenceConfigFromEnv, type LocalModelCallArgs } from '@/lib/ai/local-inference'
import { touchRunpodActivityLease } from '@/lib/ai/cos/runpodActivityLease'
import { buildDiagnosticRepairPrompt, preferRepairedDraft, reasonerDraftNeedsRepair, recordQualityRepairDecision, assessReasonerDraft } from '@/lib/ai/cos/reasonerQuality'
import { parseLocalResult } from '@/lib/ai/cos/reasonerOutput'
import { maybeBuildCognitiveCouncilAdvisory } from '@/lib/ai/cos/cognitiveCouncil'
import { runCouncilChallengeRound } from '@/lib/ai/cos/cognitiveCouncilChallenge'
import { startTurnBudget, hasBudgetFor, remainingMs, localCallEstimateMs, challengeRoundEstimateMs } from '@/lib/ai/cos/cosTurnBudget'
import { bindCouncilSessionCorrelations } from '@/lib/ai/cos/councilObjectiveOutcome'
import { TurnRecorder, extractQueryFeatures } from '@/lib/ai/cos/turnExperience'
import { hashPrompt, recordTurnExperience } from '@/lib/ai/cos/turnExperienceStore'
import { classifyProblemClass } from '@/lib/ai/cos/cosProblemClass'
import { confidenceThreshold } from '@/lib/ai/cos/cosOrchestrationEnterprise'
import { scriptRequestDirective } from './scriptRequestIntent.ts'
import { classifyInferenceHost } from './reasonerHostingDisclosure.ts'
import {
  ADVISORY_DIAGNOSIS_OWNER_POLICY,
  advisoryDiagnosisBriefDefects,
  asksForPublishedDiagnosticMethods,
  buildPublishedDiagnosticReferenceBlock,
  isAdvisoryDiagnosisPrompt,
} from './advisoryDiagnosisPolicy.ts'
import { retrievePublishedDiagnosticReferences } from './advisoryDiagnosisPublishedLookup.ts'

export type CosReasonerKind = 'independent-local' | 'managed-open-model'

export interface CosReasonerConfig {
  kind: CosReasonerKind
  /** Provenance label, e.g. independent-local:qwen2.5-coder:32b or managed-open-model:deepinfra:Qwen/Qwen3.6-35B-A3B. */
  label: string
}

function localConfigured(): boolean {
  return Boolean(process.env.LOCAL_AI_BASE_URL?.trim()) && Boolean(process.env.LOCAL_AI_MODEL?.trim())
}

function managedProviderName(baseUrl: string): string | null {
  const explicit = process.env.LOCAL_AI_MANAGED_PROVIDER?.trim().toLowerCase()
  if (explicit) return explicit.replace(/[^a-z0-9._-]+/g, '-')
  const classification = classifyInferenceHost(baseUrl)
  return classification.selfHosted ? null : classification.provider
}

function configuredReasoner(): CosReasonerConfig {
  const inference = localInferenceConfigFromEnv()
  const managedProvider = managedProviderName(inference.baseUrl)
  if (managedProvider) {
    return {
      kind: 'managed-open-model',
      label: `managed-open-model:${managedProvider}:${inference.model}`,
    }
  }
  return {
    kind: 'independent-local',
    label: `independent-local:${inference.model}`,
  }
}

/**
 * Which COS-owned reasoner seam would answer right now.
 * Closed-model external-fallback configuration is deliberately ignored here; those providers
 * must never masquerade as the COS primary reasoner. Managed open-model hosting is represented
 * explicitly in provenance while preserving the same COS-owned reasoning/memory boundary.
 */
export function resolveCosReasoner(): { config: CosReasonerConfig } | { config: null; reason: string } {
  if (localConfigured()) {
    const resolved = configuredReasoner()
    // LOCAL_AI_BASE_URL is the deploy-time COS endpoint. The public Concierge must
    // use its configured Qwen model instead of rejecting it solely because its host
    // is managed; host provenance remains explicit in the response record.
    return { config: resolved }
  }

  return {
    config: null,
    reason:
      'No COS primary reasoner is configured. Set LOCAL_AI_BASE_URL + LOCAL_AI_MODEL to an approved self-hosted or managed open-model endpoint. Closed-model external providers remain fallback routes and are not valid COS primary reasoners.',
  }
}

export function skillCitationTags(text: string): string[] {
  return [...new Set([...String(text ?? '').matchAll(/\[SK(\d{1,2})\]/g)].map(match => `[SK${Number(match[1])}]`))]
}

function normalizeCitationInvariant(text: string): string {
  return String(text ?? '')
    .replace(/\[SK\d{1,2}\]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim()
}

/**
 * A citation repair is accepted only when the model changed nothing except adding citations that
 * were actually supplied in the prompt. The server never infers skill use and never inserts a tag.
 */
export function validSkillCitationOnlyRepair(originalAnswer: string, repairedAnswer: string, allowedTags: string[]): boolean {
  const allowed = new Set(allowedTags)
  const citations = skillCitationTags(repairedAnswer)
  if (!citations.length || citations.some(tag => !allowed.has(tag))) return false
  return normalizeCitationInvariant(originalAnswer) === normalizeCitationInvariant(repairedAnswer)
}

export function skillCitationRepairNeeded(prompt: string, answer: string): boolean {
  return skillCitationTags(prompt).length > 0 && skillCitationTags(answer).length === 0
}

function buildSkillCitationRepairPrompt(originalPrompt: string, originalAnswer: string, allowedTags: string[]): string {
  return [
    'CITATION-ONLY AUDIT. Do not rewrite, improve, shorten, expand, reorder, correct, or reformat the answer.',
    '',
    `The original reasoning prompt supplied these validated procedural skill labels: ${allowedTags.join(', ')}.`,
    'A procedural skill is HOW-to guidance, not factual evidence.',
    '',
    'Your task:',
    '1. Re-read the supplied procedural skill(s), the user question, and your answer.',
    '2. If your answer materially relied on a supplied skill — for example its diagnostic principle, mechanism ordering, observables, or falsification method — add that exact [SK#] label inline at the first materially informed claim.',
    '3. If the answer did not materially rely on a supplied skill, leave the answer exactly unchanged and add no citation.',
    '4. You may add only the supplied [SK#] tags. Do not add KG/CL/EM citations.',
    '5. Apart from inserting [SK#] tags, every word, number, punctuation mark, markdown marker, and ordering from ORIGINAL ANSWER must remain unchanged.',
    '6. Preserve the original confidence value.',
    '',
    'Return ONLY strict JSON: {"answer":"...","confidence":0.0}.',
    '',
    'ORIGINAL REASONING PROMPT:',
    originalPrompt,
    '',
    'ORIGINAL ANSWER:',
    originalAnswer,
  ].join('\n')
}

function primaryCouncilEligible(args: LocalModelCallArgs): boolean {
  if (process.env.COS_COUNCIL_ENABLED === 'false') return false
  return String(args.systemPrompt ?? '').includes("SignalBoost's independent PRIMARY reasoning layer")
}

/**
 * Execute the configured open-model worker directly.
 *
 * This is deliberately below the COS reasoning control plane. Production callers should use
 * callCosReasoner(), which preserves the historical API while routing through COS-owned planning
 * and worker selection. Worker adapters use this raw function to avoid recursive re-entry.
 */
export async function callRawCosReasoner(
  args: LocalModelCallArgs,
): Promise<{ text: string; reasoner: CosReasonerConfig; turnId: string } | null> {
  if (!localConfigured()) return null

  const config = configuredReasoner()
  const inference = localInferenceConfigFromEnv()
  const budget = startTurnBudget()
  const recorder = new TurnRecorder()
  const turnId = randomUUID()
  const features = extractQueryFeatures(args.prompt)
  const problemClass = classifyProblemClass(args.prompt)
  let answered = false
  let finalConfidence: number | null = null

  try {
    await touchRunpodActivityLease('qwen_reasoning')

    let effectiveArgs = args
    const scriptDirective = scriptRequestDirective(args.prompt)
    if (scriptDirective) {
      effectiveArgs = {
        ...effectiveArgs,
        systemPrompt: `${String(effectiveArgs.systemPrompt ?? '').trim()}\n\nREQUEST-SPECIFIC SCRIPT INTERPRETATION:\n${scriptDirective}`.trim(),
      }
    }

    // This hook is deliberately inside the PRIMARY reasoner call. The enterprise COS caller has
    // already retrieved KG/corpus/memory/skills before it invokes this function, so the owner-defined
    // order is structural: internal retrieval first, then (only for method-seeking diagnosis) bounded
    // published reference research, then the model draft. Public Concierge uses a different system
    // prompt and never enters this owner/enterprise policy hook.
    const enterprisePrimary = primaryCouncilEligible(args)
    const advisoryDiagnosis = enterprisePrimary && isAdvisoryDiagnosisPrompt(args.prompt)
    if (advisoryDiagnosis) {
      effectiveArgs = {
        ...effectiveArgs,
        systemPrompt: `${String(effectiveArgs.systemPrompt ?? '').trim()}\n\n${ADVISORY_DIAGNOSIS_OWNER_POLICY}`.trim(),
      }

      if (asksForPublishedDiagnosticMethods(args.prompt)) {
        const published = await recorder.time(
          'published_diagnostic_research',
          () => retrievePublishedDiagnosticReferences(args.prompt),
        ).catch(error => {
          const message = error instanceof Error ? error.message : String(error)
          console.warn('[cos-advisory-diagnosis-research] lookup failed closed', message)
          return { attempted: true, references: [], errors: [message] }
        })
        const referenceBlock = buildPublishedDiagnosticReferenceBlock(published.references)
        if (referenceBlock) {
          effectiveArgs = {
            ...effectiveArgs,
            prompt: `${effectiveArgs.prompt}\n\n${referenceBlock}`,
          }
        }
        console.info('[cos-advisory-diagnosis-research]', JSON.stringify({
          at: new Date().toISOString(),
          attempted: published.attempted,
          documentsAcquired: published.references.length,
          officialDocuments: published.references.filter(item => item.kind === 'official_documentation').length,
          scientificJournals: published.references.filter(item => item.kind === 'scientific_journal').length,
          sourceUrls: published.references.map(item => item.url),
          errors: published.errors,
          referenceOnly: true,
          incidentTelemetry: false,
        }))
      } else {
        recorder.skip('published_diagnostic_research', 'method_lookup_not_requested')
      }
    } else {
      recorder.skip('published_diagnostic_research', 'not_enterprise_advisory_diagnosis')
    }

    if (enterprisePrimary) {
      const council = await recorder.time('council', () => maybeBuildCognitiveCouncilAdvisory({
        prompt: args.prompt,
        reasonerLabel: config.label,
      })).catch(error => {
        console.warn('[cos-council] advisory failed closed', error instanceof Error ? error.message : String(error))
        return null
      })
      if (council?.advisory) {
        if (council.sessionId) {
          await bindCouncilSessionCorrelations(council.sessionId, args.prompt).catch(error => {
            console.warn('[cos-council-correlation] binding failed closed', error instanceof Error ? error.message : String(error))
          })
        }
        const challengeRound = hasBudgetFor(budget, challengeRoundEstimateMs())
          ? await recorder.time('challenge', () => runCouncilChallengeRound({
              council,
              governedPrompt: args.prompt,
              reasonerLabel: config.label,
            })).catch(error => {
              console.warn('[cos-council-challenge] challenge round failed closed', error instanceof Error ? error.message : String(error))
              return null
            })
          : (recorder.skip('challenge', 'no_budget'), console.warn('[cos-turn-budget] challenge round skipped to protect the turn deadline', JSON.stringify({ remainingMs: remainingMs(budget) })), null)
        const advisory = challengeRound?.advisory
          ? `${council.advisory}\n\n${challengeRound.advisory}`
          : council.advisory
        effectiveArgs = {
          ...effectiveArgs,
          prompt: `${effectiveArgs.prompt}\n\n${advisory}`,
        }
        console.info('[cos-council]', JSON.stringify({
          at: new Date().toISOString(),
          sessionId: council.sessionId,
          problemClass: council.problemClass,
          triggerReasons: council.trigger.reasons,
          roles: council.opinions.map(opinion => opinion.role),
          opinions: council.opinions.length,
          challenges: challengeRound?.challenges.length ?? 0,
          rebuttals: challengeRound?.rebuttals.length ?? 0,
        }))
      } else {
        recorder.skip('challenge', 'no_advisory')
      }
    } else {
      recorder.skip('council', 'not_eligible')
      recorder.skip('challenge', 'not_eligible')
    }

    const first = await recorder.time('draft', () => callLocalModel(effectiveArgs, inference), 'model').catch(error => {
      console.error('[cos-reasoner-local-call-failed]', JSON.stringify({
        at: new Date().toISOString(),
        phase: 'draft',
        reasoner: config.label,
        error: error instanceof Error ? error.message : String(error),
        errorName: error instanceof Error ? error.name : null,
      }))
      return null
    })
    if (!first) {
      recorder.skip('quality_repair', 'no_draft')
      recorder.skip('skill_citation_repair', 'no_draft')
      return null
    }

    let text = first
    const firstParsedForPolicy = parseLocalResult(first)
    const firstAdvisoryDefects = advisoryDiagnosis && firstParsedForPolicy
      ? advisoryDiagnosisBriefDefects(effectiveArgs.prompt, firstParsedForPolicy.answer)
      : []
    const qualityRepairNeeded = reasonerDraftNeedsRepair(effectiveArgs.prompt, first) || firstAdvisoryDefects.length > 0
    const qualityRepairAffordable = hasBudgetFor(budget, localCallEstimateMs())
    if (!qualityRepairNeeded) recorder.skip('quality_repair', 'not_needed')
    else if (!qualityRepairAffordable) recorder.skip('quality_repair', 'no_budget')

    if (qualityRepairNeeded && qualityRepairAffordable) {
      const repaired = await recorder.time('quality_repair', () => callLocalModel(
        {
          ...effectiveArgs,
          temperature: 0,
          prompt: [
            buildDiagnosticRepairPrompt(effectiveArgs.prompt, first),
            ...(firstAdvisoryDefects.length ? ['', ADVISORY_DIAGNOSIS_OWNER_POLICY, '', `The rejected draft violated: ${firstAdvisoryDefects.join(', ')}.`] : []),
          ].join('\n'),
        },
        inference,
      ), 'model').catch(error => {
        console.error('[cos-reasoner-local-call-failed]', JSON.stringify({
          at: new Date().toISOString(),
          phase: 'quality_repair',
          reasoner: config.label,
          error: error instanceof Error ? error.message : String(error),
          errorName: error instanceof Error ? error.name : null,
        }))
        return null
      })

      const repairedParsedForPolicy = repaired ? parseLocalResult(repaired) : null
      const repairedAdvisoryDefects = advisoryDiagnosis && repairedParsedForPolicy
        ? advisoryDiagnosisBriefDefects(effectiveArgs.prompt, repairedParsedForPolicy.answer)
        : []
      const advisoryPolicyRepairAccepted = firstAdvisoryDefects.length > 0 && repairedAdvisoryDefects.length === 0
      const generalRepairAccepted = Boolean(repaired && preferRepairedDraft(effectiveArgs.prompt, first, repaired))

      if (repaired && (advisoryPolicyRepairAccepted || (firstAdvisoryDefects.length === 0 && generalRepairAccepted))) {
        console.info('[cos-local-quality-repair]', JSON.stringify({
          at: new Date().toISOString(),
          reasoner: config.label,
          repaired: true,
          advisoryDiagnosisDefectsBefore: firstAdvisoryDefects,
          advisoryDiagnosisDefectsAfter: repairedAdvisoryDefects,
        }))
        void recordQualityRepairDecision({ repairKind:'quality_repair', reasonerLabel:config.label, accepted:true, details:{ firstDraft:assessReasonerDraft(effectiveArgs.prompt,first), repairedDraft:assessReasonerDraft(effectiveArgs.prompt,repaired), advisoryDiagnosisDefectsBefore:firstAdvisoryDefects, advisoryDiagnosisDefectsAfter:repairedAdvisoryDefects } })
        text = repaired
      } else {
        console.warn('[cos-local-quality-repair]', JSON.stringify({
          at: new Date().toISOString(),
          reasoner: config.label,
          repaired: false,
          advisoryDiagnosisDefectsBefore: firstAdvisoryDefects,
          advisoryDiagnosisDefectsAfter: repairedAdvisoryDefects,
        }))
        void recordQualityRepairDecision({ repairKind:'quality_repair', reasonerLabel:config.label, accepted:false, details:{ firstDraft:assessReasonerDraft(effectiveArgs.prompt,first), repairedDraft:repaired?assessReasonerDraft(effectiveArgs.prompt,repaired):null, advisoryDiagnosisDefectsBefore:firstAdvisoryDefects, advisoryDiagnosisDefectsAfter:repairedAdvisoryDefects } })
      }
    }

    const allowedSkillTags = skillCitationTags(effectiveArgs.prompt)
    const parsed = parseLocalResult(text)
    const citationRepairNeeded = Boolean(parsed && skillCitationRepairNeeded(effectiveArgs.prompt, parsed.answer))
    const citationRepairAffordable = hasBudgetFor(budget, localCallEstimateMs())
    if (!citationRepairNeeded) recorder.skip('skill_citation_repair', 'not_needed')
    else if (!citationRepairAffordable) recorder.skip('skill_citation_repair', 'no_budget')

    if (citationRepairNeeded && citationRepairAffordable && parsed) {
      const audited = await recorder.time('skill_citation_repair', () => callLocalModel(
        {
          ...effectiveArgs,
          temperature: 0,
          maxTokens: Math.max(2048, Math.min(Number(effectiveArgs.maxTokens ?? 4096), 6000)),
          prompt: buildSkillCitationRepairPrompt(effectiveArgs.prompt, parsed.answer, allowedSkillTags),
        },
        inference,
      ), 'model').catch(error => {
        console.error('[cos-reasoner-local-call-failed]', JSON.stringify({
          at: new Date().toISOString(),
          phase: 'skill_citation_repair',
          reasoner: config.label,
          error: error instanceof Error ? error.message : String(error),
          errorName: error instanceof Error ? error.name : null,
        }))
        return null
      })
      const auditedParsed = audited ? parseLocalResult(audited) : null
      const accepted = Boolean(auditedParsed && validSkillCitationOnlyRepair(parsed.answer, auditedParsed.answer, allowedSkillTags))
      if (accepted && auditedParsed) {
        text = JSON.stringify({ answer: auditedParsed.answer, confidence: parsed.confidence })
      }
      console.info('[cos-skill-citation-repair]', JSON.stringify({
        at: new Date().toISOString(),
        reasoner: config.label,
        attempted: true,
        accepted,
        allowedTags: allowedSkillTags,
        citedTags: auditedParsed ? skillCitationTags(auditedParsed.answer) : [],
      }))
      void recordQualityRepairDecision({ repairKind:'skill_citation_repair', reasonerLabel:config.label, accepted, details:{ allowedTags:allowedSkillTags, citedTags:auditedParsed?skillCitationTags(auditedParsed.answer):[] } })
    }

    answered = true
    finalConfidence = parseLocalResult(text)?.confidence ?? null
    return { text, reasoner: config, turnId }
  } finally {
    const experience = recorder.snapshot({
      turnId,
      promptHash: hashPrompt(args.prompt),
      problemClass,
      features,
      reasonerLabel: config.label,
      answered,
      confidence: finalConfidence,
      confidenceThreshold: confidenceThreshold(),
    })
    console.info('[cos-reasoner-phases]', JSON.stringify({
      at: new Date().toISOString(),
      turnId,
      problemClass,
      totalMs: experience.totalMs,
      modelCallMs: experience.modelCallMs,
      otherMs: experience.otherMs,
      directModelCalls: experience.modelCalls,
      phases: experience.phases,
      skipped: experience.skipped,
    }))
    recordTurnExperience(experience)
  }
}

/**
 * Backward-compatible production entrypoint.
 *
 * Every existing call site now enters the COS reasoning control plane before any model worker is
 * invoked. The default production plan is primary-only and explicitly forbids closed-model
 * escalation; external escalation remains a separate, labelled orchestration decision.
 */
export async function callCosReasoner(
  args: LocalModelCallArgs,
): Promise<{ text: string; reasoner: CosReasonerConfig; turnId: string } | null> {
  const { reasonThroughCosControlPlane } = await import('./cosReasoningWorkers.ts')
  const execution = await reasonThroughCosControlPlane(args, {
    requestedRole: 'primary',
    allowExternalEscalation: false,
  })
  if (!execution?.result.text?.trim()) return null

  const resolved = resolveCosReasoner()
  if (!resolved.config) return null
  const rawKind = execution.result.metadata?.reasonerKind
  const kind: CosReasonerKind = rawKind === 'independent-local' || rawKind === 'managed-open-model'
    ? rawKind
    : resolved.config.kind

  console.info('[cos-reasoning-control-plane]', JSON.stringify({
    at: new Date().toISOString(),
    policyVersion: execution.plan.policyVersion,
    requestedRole: execution.plan.requestedRole,
    workerId: execution.worker.id,
    workerRole: execution.worker.role,
    workerKind: execution.worker.kind,
    workerLabel: execution.worker.label,
    attemptedWorkerIds: execution.attemptedWorkerIds,
    fallbackUsed: execution.fallbackUsed,
    externalEscalationAllowed: false,
  }))

  return {
    text: execution.result.text,
    reasoner: {
      kind,
      label: execution.worker.label,
    },
    turnId: execution.result.turnId || randomUUID(),
  }
}

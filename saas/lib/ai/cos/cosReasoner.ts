import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { cosExecutionEnvelope, cosAnswerProgress } from './cosExecutionEnvelope.ts'
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
import { requestedAnalyticalTasks, missingAnalyticalTasks, analyticalTaskRepairDirective, releasableAnalyticalAnswer } from './answerTaskContract.ts'
import { recordCosLatencyStage } from '@/lib/ai/cos/cosLatencyStages'
import { ANSWER_COMPLETION_CHECK_SYSTEM_PROMPT, ANSWER_COMPLETION_SYSTEM_PROMPT, parseAnswerCompletionCheck, runAnswerCompletionLoop } from './answerCompletionLoop.ts'
import { callLocalModel, captureServedInference, localInferenceConfigFromEnv, type LocalModelCallArgs, type ServedInference } from '@/lib/ai/local-inference'
import { currentInferenceTransport } from '@/lib/ai/inferenceTransport'
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
import { retrievePublishedDiagnosticReferences, type PublishedDiagnosticLookupResult } from './advisoryDiagnosisPublishedLookup.ts'
import { recordAdvisoryDiagnosisResearchForAnswer } from './advisoryDiagnosisResearchTrace.ts'
import { currentReasoningEvaluationContext } from './reasoningEvaluationContext.ts'

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

export function resolveCosReasoner(): { config: CosReasonerConfig } | { config: null; reason: string } {
  if (localConfigured()) {
    const resolved = configuredReasoner()
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

function primaryReasonerRequest(args: LocalModelCallArgs): boolean {
  return String(args.systemPrompt ?? '').includes("SignalBoost's independent PRIMARY reasoning layer")
}

function primaryCouncilEligible(args: LocalModelCallArgs): boolean {
  if (process.env.COS_COUNCIL_ENABLED === 'false') return false
  if (currentReasoningEvaluationContext()) return false
  return primaryReasonerRequest(args)
}

export async function callRawCosReasoner(
  args: LocalModelCallArgs,
): Promise<{ text: string; reasoner: CosReasonerConfig; turnId: string } | null> {
  if (!localConfigured()) return null

  const config = configuredReasoner()
  const budget = startTurnBudget()
  const baseInference = localInferenceConfigFromEnv()
  const boundedInference = () => ({ ...baseInference, timeoutMs: Math.max(1_000, Math.min(baseInference.timeoutMs, remainingMs(budget))) })
  const recorder = new TurnRecorder()
  const turnId = randomUUID()
  const features = extractQueryFeatures(args.prompt)
  const problemClass = classifyProblemClass(args.prompt)
  let answered = false
  let finalConfidence: number | null = null
  let publishedDiagnosticResearch: PublishedDiagnosticLookupResult | null = null
  // A turn under a controlled provider transport (verification campaign fault injection) is synthetic: it runs the
  // same code but writes nothing durable — no turn experience row, no verification audit row, no pod activity —
  // so production statistics hold only real turns (Codex on #4977). Its evidence is the campaign's own record.
  const syntheticTurn = currentInferenceTransport() !== null

  try {
    if (!syntheticTurn) await touchRunpodActivityLease('qwen_reasoning')

    // Preserve the same user objective, prohibitions and deliverables across
    // prompt compilation, model inference, critic repair, and the completion loop.
    const execution = cosExecutionEnvelope(args.prompt)
    let effectiveArgs = execution.contract.requestsAnalysis ? {
      ...args,
      systemPrompt: [String(args.systemPrompt ?? ''), execution.instructionBlock].filter(Boolean).join('\n\n'),
    } : args
    const scriptDirective = scriptRequestDirective(args.prompt)
    if (scriptDirective) {
      effectiveArgs = {
        ...effectiveArgs,
        systemPrompt: `${String(effectiveArgs.systemPrompt ?? '').trim()}\n\nREQUEST-SPECIFIC SCRIPT INTERPRETATION:\n${scriptDirective}`.trim(),
      }
    }

    const enterprisePrimary = primaryReasonerRequest(args)
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
        publishedDiagnosticResearch = published
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

    const councilAffordable = hasBudgetFor(budget, localCallEstimateMs())
    if (primaryCouncilEligible(args) && councilAffordable) {
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
      const reason = primaryCouncilEligible(args) ? 'no_budget' : 'not_eligible'
      recorder.skip('council', reason)
      recorder.skip('challenge', reason)
      if (reason === 'no_budget') console.warn('[cos-turn-budget] council skipped to protect the turn deadline', JSON.stringify({ remainingMs: remainingMs(budget) }))
    }

    if (remainingMs(budget) < 1_000) return null
    // Keep long-form analytical synthesis inside the shared turn deadline rather
    // than imposing an extra 25-second truncation that forces rescue calls.
    const first = await recorder.time('draft', () => callLocalModel(effectiveArgs, boundedInference()), 'model').catch(error => {
      console.error('[cos-reasoner-local-call-failed]', JSON.stringify({
        at: new Date().toISOString(),
        phase: 'draft',
        reasoner: config.label,
        error: error instanceof Error ? error.message : String(error),
        errorName: error instanceof Error ? error.name : null,
      }))
      return null
    })
    // An empty or timed-out first draft is not evidence that the user's
    // investigation is impossible. Give analytical tasks one bounded fresh
    // synthesis attempt while the turn budget permits; never invent a result.
    const analyticalTasks = requestedAnalyticalTasks(args.prompt)
    // THE ANSWER THE PERSON READS MUST PARSE. For a user-answer turn the provider's text is a draft only when it
    // parses as {answer, confidence}; broken JSON or an object without those keys is no draft, so the recovery call
    // below still runs and nothing unparseable is ever this turn's text. Fault check PAC-10 (2026-10-28): the
    // provider returned `{"answer": "The parser upgrade` and the turn released it verbatim.
    const parseableDraft = (draft: string | null): string | null =>
      draft && (args.writesUserAnswer !== true || parseLocalResult(draft)) ? draft : null
    if (first && !parseableDraft(first)) console.warn('[cos-reasoner-draft-unparseable]', JSON.stringify({ turnId, phase: 'draft', length: first.length }))
    let initialDraft = parseableDraft(first)
    if (!initialDraft && analyticalTasks.length > 0 && remainingMs(budget) >= 8_000) {
      initialDraft = parseableDraft(await recorder.time('analytical_no_draft_recovery', () => callLocalModel({
        ...effectiveArgs,
        temperature: 0,
        prompt: [
          args.prompt,
          '',
          'Complete the ORIGINAL analytical assignment now. Missing telemetry prevents confirmed findings, but permits ranked provisional hypotheses, evidence gaps, causal checks, and experiments.',
          'Address every requested deliverable with distinct scenario-specific reasoning. Separate facts from assumptions and hypotheses. Never claim to have performed unexecuted checks.',
          'Return ONLY strict JSON with keys "answer" and "confidence".',
        ].join('\n'),
      }, boundedInference()), 'model').catch(error => {
        console.warn('[cos-analytical-no-draft-recovery-failed]', error instanceof Error ? error.message : String(error))
        return null
      }))
    }
    if (!initialDraft) {
      recorder.skip('quality_repair', 'no_draft')
      recorder.skip('skill_citation_repair', 'no_draft')
      return null
    }

    let text = initialDraft
    const firstParsedForPolicy = parseLocalResult(initialDraft)
    const firstAdvisoryDefects = advisoryDiagnosis && firstParsedForPolicy
      ? advisoryDiagnosisBriefDefects(effectiveArgs.prompt, firstParsedForPolicy.answer)
      : []
    const firstTaskGaps = firstParsedForPolicy ? cosAnswerProgress(args.prompt, firstParsedForPolicy.answer).missing : []
    const qualityRepairNeeded = reasonerDraftNeedsRepair(effectiveArgs.prompt, initialDraft) || firstAdvisoryDefects.length > 0 || firstTaskGaps.length > 0
    const qualityRepairAffordable = hasBudgetFor(budget, localCallEstimateMs())
      || (firstTaskGaps.length > 0 && remainingMs(budget) >= 8_000)
    if (!qualityRepairNeeded) recorder.skip('quality_repair', 'not_needed')
    else if (!qualityRepairAffordable) recorder.skip('quality_repair', 'no_budget')

    if (qualityRepairNeeded && qualityRepairAffordable) {
      const repaired = await recorder.time('quality_repair', () => callLocalModel(
        {
          ...effectiveArgs,
          temperature: 0,
          prompt: [
            ...(firstTaskGaps.length && firstParsedForPolicy
              ? [
                  effectiveArgs.prompt,
                  '',
                  'ANALYTICAL RECOVERY — the preceding response did not perform the requested investigation.',
                  'Produce a NEW complete analysis, rather than explaining why no definitive root cause has been proven.',
                  'A lack of telemetry prevents confirmation, NOT generation of provisional, ranked hypotheses, missing-evidence requests, causal discriminators, testable experiments, interaction mechanisms, and a working explanation.',
                  'Clearly label observed facts, assumptions, hypotheses, and uncertainties. Never invent measured results or claim any experiment was executed.',
                  'For each requested deliverable, provide distinct substantive reasoning grounded in the supplied scenario. Do not copy generic text under different headings.',
                  analyticalTaskRepairDirective(effectiveArgs.prompt, firstParsedForPolicy.answer),
                  '',
                  'Return ONLY strict JSON with keys "answer" and "confidence". Do not mention these repair instructions or the rejected draft.',
                ].join('\n')
              : buildDiagnosticRepairPrompt(effectiveArgs.prompt, initialDraft)),
            ...(firstAdvisoryDefects.length ? ['', ADVISORY_DIAGNOSIS_OWNER_POLICY, '', `The rejected draft violated: ${firstAdvisoryDefects.join(', ')}.`] : []),
          ].join('\n'),
        },
        boundedInference(),
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

      // Loop controller compares actual deliverable coverage; a non-progressing
      // repair cannot silently become a verified completion.
      const repairedParsedForPolicy = repaired ? parseLocalResult(repaired) : null
      if (repairedParsedForPolicy && firstTaskGaps.length) {
        const progress = cosAnswerProgress(args.prompt, repairedParsedForPolicy.answer, firstTaskGaps.length)
        console.info('[cos-task-loop-progress]', JSON.stringify({
          turnId, previousMissing: firstTaskGaps.length, remainingMissing: progress.missing.length,
          decision: progress.decision, completed: progress.complete,
        }))
      }
      const repairedAdvisoryDefects = advisoryDiagnosis && repairedParsedForPolicy
        ? advisoryDiagnosisBriefDefects(effectiveArgs.prompt, repairedParsedForPolicy.answer)
        : []
      const repairedTaskGaps = repairedParsedForPolicy ? missingAnalyticalTasks(effectiveArgs.prompt, repairedParsedForPolicy.answer) : firstTaskGaps
      const taskContractRepairAccepted = firstTaskGaps.length > 0 && repairedTaskGaps.length === 0
      const advisoryPolicyRepairAccepted = firstAdvisoryDefects.length > 0 && repairedAdvisoryDefects.length === 0
      const generalRepairAccepted = Boolean(repaired && preferRepairedDraft(effectiveArgs.prompt, initialDraft, repaired))

      if (repaired && repairedTaskGaps.length === 0 && (taskContractRepairAccepted || advisoryPolicyRepairAccepted || (firstAdvisoryDefects.length === 0 && generalRepairAccepted))) {
        console.info('[cos-local-quality-repair]', JSON.stringify({
          at: new Date().toISOString(),
          reasoner: config.label,
          repaired: true,
          advisoryDiagnosisDefectsBefore: firstAdvisoryDefects,
          advisoryDiagnosisDefectsAfter: repairedAdvisoryDefects,
        }))
        void recordQualityRepairDecision({ repairKind:'quality_repair', reasonerLabel:config.label, accepted:true, details:{ firstDraft:assessReasonerDraft(effectiveArgs.prompt,initialDraft), repairedDraft:assessReasonerDraft(effectiveArgs.prompt,repaired), advisoryDiagnosisDefectsBefore:firstAdvisoryDefects, advisoryDiagnosisDefectsAfter:repairedAdvisoryDefects } })
        text = repaired
      } else {
        console.warn('[cos-local-quality-repair]', JSON.stringify({
          at: new Date().toISOString(),
          reasoner: config.label,
          repaired: false,
          advisoryDiagnosisDefectsBefore: firstAdvisoryDefects,
          advisoryDiagnosisDefectsAfter: repairedAdvisoryDefects,
        }))
        void recordQualityRepairDecision({ repairKind:'quality_repair', reasonerLabel:config.label, accepted:false, details:{ firstDraft:assessReasonerDraft(effectiveArgs.prompt,initialDraft), repairedDraft:repaired?assessReasonerDraft(effectiveArgs.prompt,repaired):null, advisoryDiagnosisDefectsBefore:firstAdvisoryDefects, advisoryDiagnosisDefectsAfter:repairedAdvisoryDefects } })
        // A repair that closed some task gaps is the better analysis even when it did not close all of them.
        if (repaired && firstTaskGaps.length > 0 && repairedTaskGaps.length < firstTaskGaps.length && repairedAdvisoryDefects.length <= firstAdvisoryDefects.length) text = repaired
      }
    }

    // THE ANSWER LOOP: before the answer the person reads is released, check it against the whole request and write
    // only what is still missing, for up to three rounds while the turn has time (answerCompletionLoop.ts).
    const loopDraft = args.writesUserAnswer === true ? parseLocalResult(text) : null
    if (loopDraft && !loopDraft.truncated) {
      const completion = await recorder.time('answer_completion_loop', () => runAnswerCompletionLoop({
        request: args.prompt,
        answer: loopDraft.answer,
        deterministicMissing: answer => missingAnalyticalTasks(args.prompt, answer),
        ports: {
          remainingMs: () => remainingMs(budget),
          // Deterministic host-side quality gate. A model's self-verdict cannot override these defects.
          verify: async (request, answer) => {
            const failures = [
              ...missingAnalyticalTasks(request, answer),
              ...(advisoryDiagnosis ? advisoryDiagnosisBriefDefects(request, answer) : []),
            ]
            return { passed: failures.length === 0, failures }
          },
          persistVerification: async receipt => {
            if (syntheticTurn) return
            const db = cosServiceDb()
            if (!db) throw new Error('cos_verification_audit_database_unavailable')
            const eventId = randomUUID()
            const persisted = await db.from('supervisor_audit_events').insert({
              event_id: eventId,
              execution_id: turnId,
              incident_id: turnId,
              event_type: 'cos_answer_completion_verification',
              occurred_at: new Date().toISOString(),
              payload: {
                round: receipt.round,
                passed: receipt.passed,
                failureCodes: [...receipt.failures],
                verifier: 'cos_deterministic_answer_contract',
                outputReleased: false,
              },
              schema_version: 'cos-answer-completion-verification-v1',
            })
            if (persisted.error) throw new Error('cos_verification_audit_persist_failed')
          },
          check: async (request, answer) => parseAnswerCompletionCheck(await callLocalModel({
            ...effectiveArgs,
            writesUserAnswer: false,
            temperature: 0,
            maxTokens: 400,
            usageContext: { ...(effectiveArgs.usageContext ?? { feature: 'cos_interactive_answer' }), purpose: 'answer_completion_check' },
            systemPrompt: ANSWER_COMPLETION_CHECK_SYSTEM_PROMPT,
            prompt: `REQUEST:\n${request}\n\nANSWER:\n${answer}`,
          }, { ...boundedInference(), timeoutMs: Math.min(20_000, boundedInference().timeoutMs) })),
          complete: async (request, answer, missing) => {
            const written = await callLocalModel({
              ...effectiveArgs,
              temperature: 0,
              usageContext: { ...(effectiveArgs.usageContext ?? { feature: 'cos_interactive_answer' }), purpose: 'answer_completion' },
              systemPrompt: ANSWER_COMPLETION_SYSTEM_PROMPT,
              prompt: `REQUEST:\n${request}\n\nEXISTING ANSWER:\n${answer}\n\nWRITE ONLY THESE MISSING PARTS:\n${missing.map((item, index) => `${index + 1}. ${item}`).join('\n')}`,
            }, boundedInference())
            const parsed = written ? parseLocalResult(written) : null
            return parsed && !parsed.truncated ? parsed.answer : null
          },
        },
      }), 'model').catch(error => {
        console.warn('[cos-answer-completion-loop-failed]', error instanceof Error ? error.message : String(error))
        return null
      })
      if (!completion || completion.stopped !== 'complete') {
        // THE LOOP IMPROVES THE ANSWER; IT NEVER VETOES IT. Whatever stopped it (no time, checker busy or timed out,
        // no progress, round cap, completion unavailable), the answer COS already wrote goes through the same
        // deterministic release gates below as every answer: the task contract and the quality defects. Production
        // 2026-10-27 16:51 UTC: a finished 281-token answer was discarded because the optional checker found RunPod
        // busy and DeepInfra timed out (stopped: checker_unavailable); #4967 had kept the draft only for 'budget'.
        console.warn('[cos-answer-verification-incomplete]', JSON.stringify({
          turnId, status: completion?.stopped ?? 'unavailable', rounds: completion?.rounds ?? 0, stillMissing: completion?.missing.length ?? null,
        }))
        text = JSON.stringify({ answer: completion?.answer || loopDraft.answer, confidence: loopDraft.confidence })
      } else {
        console.info('[cos-answer-completion-loop]', JSON.stringify({ turnId, rounds: completion.rounds, stopped: completion.stopped, stillMissing: completion.missing.length }))
        if (completion.rounds > 0) text = JSON.stringify({ answer: completion.answer, confidence: loopDraft.confidence })
      }
    }

    const finalParsedForPolicy = parseLocalResult(text)
    const remainingTaskGaps = finalParsedForPolicy ? missingAnalyticalTasks(effectiveArgs.prompt, finalParsedForPolicy.answer) : []
    // Only a non-answer is withheld; a substantive analysis with gaps is the model's real work and is released.
    if (remainingTaskGaps.length && !(finalParsedForPolicy && releasableAnalyticalAnswer(effectiveArgs.prompt, finalParsedForPolicy.answer))) {
      console.warn('[cos-task-contract-release-blocked]', JSON.stringify({ missingCount: remainingTaskGaps.length, requestedCount: firstTaskGaps.length }))
      recorder.skip('skill_citation_repair', 'task_contract_unmet')
      return null
    }
    const remainingAdvisoryDefects = advisoryDiagnosis && finalParsedForPolicy
      ? advisoryDiagnosisBriefDefects(effectiveArgs.prompt, finalParsedForPolicy.answer)
      : []
    if (remainingAdvisoryDefects.length) {
      console.warn('[cos-advisory-diagnosis-release-blocked]', JSON.stringify({
        at: new Date().toISOString(),
        reasoner: config.label,
        defects: remainingAdvisoryDefects,
      }))
      recorder.skip('skill_citation_repair', 'advisory_diagnosis_policy_failed')
      return null
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
        boundedInference(),
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

    const finalParsedForTrace = parseLocalResult(text)
    if (publishedDiagnosticResearch?.attempted && finalParsedForTrace) {
      recordAdvisoryDiagnosisResearchForAnswer(finalParsedForTrace.answer, publishedDiagnosticResearch)
    }

    answered = true
    finalConfidence = finalParsedForTrace?.confidence ?? null
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
    if (!syntheticTurn) recordTurnExperience(experience)
    // TURN TIMING (2026-09-30): the reasoner's own phases (draft, quality repair, council…) join the per-stage
    // timings shown in the provenance reply, so time spent around the model call is visible, not only the call.
    for (const phase of experience.phases) recordCosLatencyStage(`reasoner:${phase.phase}`, phase.ms)
  }
}

/**
 * The base worker is labelled with the CONFIGURED managed reasoner, but chat asks RunPod first and uses the managed
 * host only as backup. Name the provider that actually served the first completion of this reasoning call.
 * Graduate and local workers keep their own labels.
 */
export function servedReasonerLabel(workerLabel: string, served: readonly ServedInference[]): string {
  const first = served[0]
  if (!first || !String(workerLabel || '').toLowerCase().startsWith('managed-open-model:')) return workerLabel
  return `managed-open-model:${first.provider}:${first.model}`
}

export async function callCosReasoner(
  args: LocalModelCallArgs,
): Promise<{ text: string; reasoner: CosReasonerConfig; turnId: string } | null> {
  const { reasonThroughCosControlPlane } = await import('./cosReasoningWorkers.ts')
  const { result: execution, served } = await captureServedInference(() => reasonThroughCosControlPlane(args, {
    requestedRole: 'primary',
    allowExternalEscalation: false,
  }))
  if (!execution?.result.text?.trim()) return null

  const resolved = resolveCosReasoner()
  const rawKind = execution.result.metadata?.reasonerKind
  const kind: CosReasonerKind = rawKind === 'independent-local' || rawKind === 'managed-open-model'
    ? rawKind
    : resolved.config?.kind ?? 'managed-open-model'

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
      label: servedReasonerLabel(execution.worker.label, served),
    },
    turnId: execution.result.turnId || randomUUID(),
  }
}

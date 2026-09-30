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
import { recordCosLatencyStage } from '@/lib/ai/cos/cosLatencyStages'
import { callLocalModel, captureServedInference, localInferenceConfigFromEnv, type LocalModelCallArgs, type ServedInference } from '@/lib/ai/local-inference'
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

// saas/lib/ai/cos/cosReasoner.ts
//
// COS'S OWN REASONER — strict independence boundary.
//
// The COS-first path may use only the LOCAL_AI_* inference seam. That seam can point
// to Ollama, vLLM, TGI, or another OpenAI-compatible open/self-hosted model runtime.
// A remote self-hosted endpoint is allowed only through local-inference.ts's explicit
// host allow-list + API-key controls.
//
// IMPORTANT: Anthropic/OpenAI/Gemini and any generic "dedicated cloud reasoner" are
// intentionally NOT accepted here. Those providers belong only in the external
// escalation layer. This keeps provenance honest: if callCosReasoner() succeeds,
// COS really used its independent model runtime.

import { callLocalModel, localInferenceConfigFromEnv, type LocalModelCallArgs } from '@/lib/ai/local-inference'
import { touchRunpodActivityLease } from '@/lib/ai/cos/runpodActivityLease'
import { buildDiagnosticRepairPrompt, preferRepairedDraft, reasonerDraftNeedsRepair } from '@/lib/ai/cos/reasonerQuality'
import { parseLocalResult } from '@/lib/ai/cos/reasonerOutput'
import { maybeBuildCognitiveCouncilAdvisory } from '@/lib/ai/cos/cognitiveCouncil'
import { runCouncilChallengeRound } from '@/lib/ai/cos/cognitiveCouncilChallenge'
import { startTurnBudget, hasBudgetFor, remainingMs, localCallEstimateMs, challengeRoundEstimateMs } from '@/lib/ai/cos/cosTurnBudget'
import { bindCouncilSessionCorrelations } from '@/lib/ai/cos/councilObjectiveOutcome'

export type CosReasonerKind = 'independent-local'

export interface CosReasonerConfig {
  kind: CosReasonerKind
  /** Provenance label, e.g. independent-local:qwen2.5-coder:32b. */
  label: string
}

function localConfigured(): boolean {
  return Boolean(process.env.LOCAL_AI_BASE_URL?.trim()) && Boolean(process.env.LOCAL_AI_MODEL?.trim())
}

/**
 * Which independent COS reasoner would answer right now.
 * Generic cloud-provider configuration is deliberately ignored here; those providers
 * are external fallbacks and must never masquerade as COS-local inference.
 */
export function resolveCosReasoner(): { config: CosReasonerConfig } | { config: null; reason: string } {
  if (localConfigured()) {
    return {
      config: {
        kind: 'independent-local',
        label: `independent-local:${(process.env.LOCAL_AI_MODEL || '').trim()}`,
      },
    }
  }

  return {
    config: null,
    reason:
      'No independent COS reasoner is configured. Set LOCAL_AI_BASE_URL + LOCAL_AI_MODEL to an Ollama, vLLM, TGI, or other approved self-hosted/open-model endpoint. External cloud models are fallback providers and are not valid COS-local reasoners.',
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
 * Ask COS's independent reasoner. Success means the LOCAL_AI_* path actually answered.
 * If unavailable or unhealthy, callers fail closed and may separately invoke the
 * explicitly-labelled external escalation gateway.
 *
 * The durable RunPod activity lease is touched before the first local model call. That protects
 * the whole bounded reasoning/repair sequence from the idle-stop cron without turning health checks
 * into activity or allowing one scheduled cost-control action to interrupt an in-flight answer.
 */
export async function callCosReasoner(
  args: LocalModelCallArgs,
): Promise<{ text: string; reasoner: CosReasonerConfig } | null> {
  if (!localConfigured()) return null

  const config: CosReasonerConfig = {
    kind: 'independent-local',
    label: `independent-local:${(process.env.LOCAL_AI_MODEL || '').trim()}`,
  }
  const inference = localInferenceConfigFromEnv()
  // One wall-clock budget for the whole turn. Optional phases below consult it so a slow run
  // degrades to a slightly less polished answer instead of being killed at the platform ceiling.
  const budget = startTurnBudget()
  await touchRunpodActivityLease('qwen_reasoning')

  let effectiveArgs = args
  if (primaryCouncilEligible(args)) {
    const council = await maybeBuildCognitiveCouncilAdvisory({
      prompt: args.prompt,
      reasonerLabel: config.label,
    }).catch(error => {
      console.warn('[cos-council] advisory failed closed', error instanceof Error ? error.message : String(error))
      return null
    })
    if (council?.advisory) {
      if (council.sessionId) {
        await bindCouncilSessionCorrelations(council.sessionId, args.prompt).catch(error => {
          console.warn('[cos-council-correlation] binding failed closed', error instanceof Error ? error.message : String(error))
        })
      }
      const challengeRound = hasBudgetFor(budget, challengeRoundEstimateMs()) ? await runCouncilChallengeRound({
        council,
        governedPrompt: args.prompt,
        reasonerLabel: config.label,
      }).catch(error => {
        console.warn('[cos-council-challenge] challenge round failed closed', error instanceof Error ? error.message : String(error))
        return null
      }) : (console.warn('[cos-turn-budget] challenge round skipped to protect the turn deadline', JSON.stringify({ remainingMs: remainingMs(budget) })), null)
      const advisory = challengeRound?.advisory
        ? `${council.advisory}\n\n${challengeRound.advisory}`
        : council.advisory
      effectiveArgs = {
        ...args,
        prompt: `${args.prompt}\n\n${advisory}`,
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
    }
  }

  const first = await callLocalModel(effectiveArgs, inference).catch(() => null)
  if (!first) return null

  let text = first
  // Optional quality-repair pass: worth a full local round-trip only if the turn can still afford
  // one. Out of budget, the first draft stands — a slightly rougher answer beats a killed request.
  if (reasonerDraftNeedsRepair(effectiveArgs.prompt, first) && hasBudgetFor(budget, localCallEstimateMs())) {
    const repaired = await callLocalModel(
      {
        ...effectiveArgs,
        temperature: 0,
        prompt: buildDiagnosticRepairPrompt(effectiveArgs.prompt, first),
      },
      inference,
    ).catch(() => null)

    if (repaired && preferRepairedDraft(effectiveArgs.prompt, first, repaired)) {
      console.info('[cos-local-quality-repair]', JSON.stringify({
        at: new Date().toISOString(),
        reasoner: config.label,
        repaired: true,
      }))
      text = repaired
    } else {
      console.warn('[cos-local-quality-repair]', JSON.stringify({
        at: new Date().toISOString(),
        reasoner: config.label,
        repaired: false,
      }))
    }
  }

  const allowedSkillTags = skillCitationTags(effectiveArgs.prompt)
  const parsed = parseLocalResult(text)
  // Optional skill-citation repair: same budget rule as the quality-repair pass above.
  if (parsed && skillCitationRepairNeeded(effectiveArgs.prompt, parsed.answer) && hasBudgetFor(budget, localCallEstimateMs())) {
    const audited = await callLocalModel(
      {
        ...effectiveArgs,
        temperature: 0,
        maxTokens: Math.max(2048, Math.min(Number(effectiveArgs.maxTokens ?? 4096), 6000)),
        prompt: buildSkillCitationRepairPrompt(effectiveArgs.prompt, parsed.answer, allowedSkillTags),
      },
      inference,
    ).catch(() => null)
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
  }

  return { text, reasoner: config }
}

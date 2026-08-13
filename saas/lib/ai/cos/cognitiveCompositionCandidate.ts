import { createHash } from 'node:crypto'
import { extractBalancedJsonObject } from '@/lib/ai/cos/reasonerOutput'
import type { CognitivePracticeRubric, CognitivePracticeVariant } from '@/lib/ai/cos/cognitiveSkillCandidate'

export type CognitiveCompositionStep = {
  skillKey: string
  purpose: string
  inputs: string[]
  outputs: string[]
  preconditions: string[]
  stopConditions: string[]
}

export type CognitiveCompositionDraft = {
  title: string
  description: string
  problemClass: string
  memberSkillKeys: string[]
  sequence: CognitiveCompositionStep[]
  integrationRules: string[]
  observables: string[]
  falsifiers: string[]
  prohibitedActions: string[]
}

export type CognitiveCompositionEvaluation = {
  candidateApproved: boolean
  candidateScore: number
  reason: string
  transfers: CognitivePracticeVariant[]
}

function clean(value: unknown, max = 4000): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function cleanArray(value: unknown, maxItems = 16, maxItemLength = 700): string[] {
  if (!Array.isArray(value)) return []
  return value.map(item => clean(item, maxItemLength)).filter(Boolean).slice(0, maxItems)
}

function parseObject(raw: string): Record<string, unknown> | null {
  const cleaned = String(raw ?? '').trim().replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()
  const candidates = [cleaned, extractBalancedJsonObject(cleaned)].filter(Boolean) as string[]
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>
    } catch {
      // Try the balanced JSON representation next.
    }
  }
  return null
}

function normalizedRubric(value: unknown): CognitivePracticeRubric {
  const row = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  const groups = Array.isArray(row.requiredConceptGroups)
    ? row.requiredConceptGroups
      .map(group => cleanArray(group, 8, 140))
      .filter(group => group.length > 0)
      .slice(0, 12)
    : []
  const coverage = Number(row.minimumConceptCoverage)
  const chars = Number(row.minimumAnswerCharacters)
  return {
    requiredConceptGroups: groups,
    forbiddenPatterns: cleanArray(row.forbiddenPatterns, 12, 180),
    minimumConceptCoverage: Number.isFinite(coverage) ? Math.max(0.4, Math.min(1, coverage)) : 0.65,
    minimumAnswerCharacters: Number.isFinite(chars) ? Math.max(120, Math.min(6000, Math.floor(chars))) : 300,
  }
}

function normalizedVariant(value: unknown): CognitivePracticeVariant | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  const prompt = clean(row.prompt, 10000)
  if (!prompt) return null
  const rawKey = clean(row.variantKey, 160)
  return {
    variantKey: rawKey || createHash('sha256').update(prompt).digest('hex').slice(0, 16),
    prompt,
    rubric: normalizedRubric(row.rubric),
  }
}

function normalizedStep(value: unknown): CognitiveCompositionStep | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  const skillKey = clean(row.skillKey, 240)
  const purpose = clean(row.purpose, 900)
  if (!skillKey || !purpose) return null
  return {
    skillKey,
    purpose,
    inputs: cleanArray(row.inputs, 10, 400),
    outputs: cleanArray(row.outputs, 10, 400),
    preconditions: cleanArray(row.preconditions, 10, 500),
    stopConditions: cleanArray(row.stopConditions, 10, 500),
  }
}

export function parseCognitiveCompositionDraft(raw: string): CognitiveCompositionDraft | null {
  const parsed = parseObject(raw)
  if (!parsed) return null
  const memberSkillKeys = [...new Set(cleanArray(parsed.memberSkillKeys, 4, 240))]
  const sequence = Array.isArray(parsed.sequence)
    ? parsed.sequence.map(normalizedStep).filter(Boolean).slice(0, 10) as CognitiveCompositionStep[]
    : []
  return {
    title: clean(parsed.title, 180),
    description: clean(parsed.description, 1800),
    problemClass: clean(parsed.problemClass, 420),
    memberSkillKeys,
    sequence,
    integrationRules: cleanArray(parsed.integrationRules, 14, 800),
    observables: cleanArray(parsed.observables, 14, 700),
    falsifiers: cleanArray(parsed.falsifiers, 14, 700),
    prohibitedActions: cleanArray(parsed.prohibitedActions, 14, 700),
  }
}

export function validateCognitiveCompositionDraft(
  draft: CognitiveCompositionDraft,
  availableMemberSkillKeys: string[],
): { ok: boolean; reasons: string[] } {
  const reasons: string[] = []
  const available = new Set(availableMemberSkillKeys)
  const members = [...new Set(draft.memberSkillKeys)]
  const used = new Set(draft.sequence.map(step => step.skillKey))

  if (draft.title.length < 5) reasons.push('title_too_short')
  if (draft.description.length < 50) reasons.push('description_too_short')
  if (draft.problemClass.length < 12) reasons.push('problem_class_too_short')
  if (members.length < 2 || members.length > 4) reasons.push('composition_requires_two_to_four_members')
  if (members.some(key => !available.has(key))) reasons.push('composition_contains_unavailable_member')
  if (draft.sequence.length < 2) reasons.push('composition_sequence_too_short')
  if (draft.sequence.some(step => !members.includes(step.skillKey))) reasons.push('sequence_uses_non_member_skill')
  if (used.size < 2) reasons.push('composition_does_not_actually_combine_multiple_skills')
  if (members.some(key => !used.has(key))) reasons.push('declared_member_not_used_in_sequence')
  if (draft.integrationRules.length < 2) reasons.push('insufficient_integration_rules')
  if (draft.observables.length < 2) reasons.push('insufficient_observables')
  if (draft.falsifiers.length < 2) reasons.push('insufficient_falsifiers')
  if (draft.prohibitedActions.length < 1) reasons.push('missing_prohibited_actions')

  const text = `${draft.title} ${draft.description} ${draft.problemClass}`.toLowerCase()
  if (/always combine everything|ignore prerequisites|skip verification|assume all skills apply/.test(text)) {
    reasons.push('unsafe_or_non_discriminating_composition')
  }
  return { ok: reasons.length === 0, reasons }
}

export function compositionKeyForDraft(draft: CognitiveCompositionDraft): string {
  const members = [...new Set(draft.memberSkillKeys)].sort()
  const problem = clean(draft.problemClass, 1000).toLowerCase()
  const slug = problem.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 52) || 'multi-skill-transfer'
  const suffix = createHash('sha256').update(`${members.join('|')}::${problem}`).digest('hex').slice(0, 12)
  return `compose-${slug}-${suffix}`
}

export function cognitiveCompositionProcedure(draft: CognitiveCompositionDraft): Record<string, unknown> {
  return {
    version: 1,
    composition: true,
    problemClass: draft.problemClass,
    memberSkillKeys: [...new Set(draft.memberSkillKeys)],
    sequence: draft.sequence,
    integrationRules: draft.integrationRules,
    observables: draft.observables,
    falsifiers: draft.falsifiers,
    prohibitedActions: draft.prohibitedActions,
  }
}

export function buildCompositionDraftPrompt(input: {
  problem: string
  skills: Array<{ skillKey: string; line: string; status: string; similarity: number }>
}): string {
  const skills = input.skills.map((skill, index) =>
    `[MEMBER${index + 1}] key=${clean(skill.skillKey, 240)} status=${clean(skill.status, 40)} relevance=${skill.similarity.toFixed(2)}\n${clean(skill.line, 5000)}`,
  ).join('\n\n')
  return `You are COS attempting transfer on a problem for which no single stored procedural skill is assumed sufficient. Build a BOUNDED COMPOSITION PLAN using two to four of the supplied validated skills.\n\nThis is procedural transfer, not factual evidence. Do not invent facts, telemetry, credentials, tools, or capabilities. Do not merge incompatible prerequisites. Every declared member must be used in the sequence. Preserve each member's safety/prohibited-action boundaries. The plan must say what each member consumes, what it produces for the next step, when it applies, and when to stop/falsify the path.\n\nNOVEL PROBLEM / LEARNING GAP:\n${clean(input.problem, 14000)}\n\nVALIDATED PROCEDURAL MEMBERS:\n${skills}\n\nReturn strict JSON only with keys: title, description, problemClass, memberSkillKeys, sequence, integrationRules, observables, falsifiers, prohibitedActions. sequence must be an ordered array of {"skillKey":"exact-member-key","purpose":"...","inputs":[...],"outputs":[...],"preconditions":[...],"stopConditions":[...]}. Use exact supplied skill keys. Do not answer the novel problem itself.`
}

export function buildLocalCompositionPracticePrompt(input: {
  sourceProblem: string
  draft: CognitiveCompositionDraft
}): string {
  return `Generate exactly two PRACTICE cases for this multi-skill composition. These are local training cases and can NEVER count as independent transfer validation. Each case must genuinely require at least two member skills, be materially different from the source problem, and contain enough discriminating information to decide ordering and handoffs. Do not provide answers.\n\nSOURCE PROBLEM:\n${clean(input.sourceProblem, 12000)}\n\nCOMPOSITION:\n${clean(JSON.stringify(cognitiveCompositionProcedure(input.draft)), 16000)}\n\nReturn strict JSON only: {"variants":[{"variantKey":"composition-practice-...","prompt":"...","rubric":{"requiredConceptGroups":[["term","synonym"],...],"forbiddenPatterns":[],"minimumConceptCoverage":0.65,"minimumAnswerCharacters":300}}, ...]}. Rubrics must evaluate the combined reasoning, not exact wording.`
}

export function parseCompositionPracticeVariants(raw: string): CognitivePracticeVariant[] {
  const parsed = parseObject(raw)
  if (!parsed || !Array.isArray(parsed.variants)) return []
  return parsed.variants.map(normalizedVariant).filter(Boolean).slice(0, 4) as CognitivePracticeVariant[]
}

export function buildCompositionEvaluatorPrompt(input: {
  sourceProblem: string
  draft: CognitiveCompositionDraft
  memberProcedures: Array<{ skillKey: string; procedure: unknown }>
}): string {
  return `Act as a skeptical independent evaluator and transfer-exam designer for a cognitive agent. The agent proposes combining already validated procedural skills. Do NOT approve merely because the member skills are individually validated. Determine whether the handoffs are coherent, prerequisites compatible, safety boundaries preserved, and whether composition could add capability beyond the strongest single member.\n\nSOURCE PROBLEM:\n${clean(input.sourceProblem, 12000)}\n\nPROPOSED COMPOSITION:\n${clean(JSON.stringify(cognitiveCompositionProcedure(input.draft)), 18000)}\n\nMEMBER PROCEDURES:\n${clean(JSON.stringify(input.memberProcedures), 18000)}\n\nCreate exactly three INDEPENDENT TRANSFER cases that genuinely need multiple members and are materially different from the source problem and one another. The same deterministic rubric will grade the composite and every single-member baseline, so each rubric must reward concepts that require the combined capability rather than gratuitous length. Do not provide answers.\n\nReturn strict JSON only: {"candidateApproved":true,"candidateScore":0.0,"reason":"...","transfers":[three variants shaped as {"variantKey":"composition-transfer-...","prompt":"...","rubric":{"requiredConceptGroups":[["term","synonym"],...],"forbiddenPatterns":[],"minimumConceptCoverage":0.65,"minimumAnswerCharacters":300}}]}.`
}

export function parseCompositionEvaluation(raw: string): CognitiveCompositionEvaluation | null {
  const parsed = parseObject(raw)
  if (!parsed) return null
  const score = Number(parsed.candidateScore)
  const transfers = Array.isArray(parsed.transfers)
    ? parsed.transfers.map(normalizedVariant).filter(Boolean).slice(0, 3) as CognitivePracticeVariant[]
    : []
  if (!Number.isFinite(score) || transfers.length !== 3) return null
  return {
    candidateApproved: parsed.candidateApproved === true,
    candidateScore: Math.max(0, Math.min(1, score)),
    reason: clean(parsed.reason, 1800),
    transfers,
  }
}

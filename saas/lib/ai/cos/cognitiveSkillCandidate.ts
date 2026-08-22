import { createHash } from 'node:crypto'
import { extractBalancedJsonObject } from './reasonerOutput.ts'

export type CognitiveSkillDraft = {
  title: string
  description: string
  problemClass: string
  prerequisites: string[]
  procedureSteps: string[]
  discriminatingSignals: string[]
  tools: string[]
  observables: string[]
  falsifiers: string[]
  commonFailureModes: string[]
  prohibitedActions: string[]
}

export type CognitivePracticeRubric = {
  requiredConceptGroups: string[][]
  forbiddenPatterns: string[]
  minimumConceptCoverage: number
  minimumAnswerCharacters: number
}

export type CognitivePracticeVariant = {
  variantKey: string
  prompt: string
  rubric: CognitivePracticeRubric
}

export type CognitiveTeacherEvaluation = {
  candidateApproved: boolean
  candidateScore: number
  reason: string
  understanding: CognitivePracticeVariant
  holdouts: CognitivePracticeVariant[]
}

function clean(value: unknown, max = 4000): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function cleanArray(value: unknown, maxItems = 12, maxItemLength = 600): string[] {
  if (!Array.isArray(value)) return []
  return value.map(item => clean(item, maxItemLength)).filter(Boolean).slice(0, maxItems)
}

function cleanConceptGroups(value: unknown): string[][] {
  if (!Array.isArray(value)) return []
  return value
    .map(group => cleanArray(group, 8, 120))
    .filter(group => group.length > 0)
    .slice(0, 12)
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const cleaned = String(raw ?? '').trim().replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()
  const candidates = [cleaned, extractBalancedJsonObject(cleaned)].filter(Boolean) as string[]
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>
    } catch {
      // Try the next representation.
    }
  }
  return null
}

function normalizedRubric(value: unknown): CognitivePracticeRubric {
  const row = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  const minimumCoverage = Number(row.minimumConceptCoverage)
  const minimumChars = Number(row.minimumAnswerCharacters)
  return {
    requiredConceptGroups: cleanConceptGroups(row.requiredConceptGroups),
    forbiddenPatterns: cleanArray(row.forbiddenPatterns, 12, 180),
    minimumConceptCoverage: Number.isFinite(minimumCoverage) ? Math.max(0.4, Math.min(1, minimumCoverage)) : 0.6,
    minimumAnswerCharacters: Number.isFinite(minimumChars) ? Math.max(120, Math.min(6000, Math.floor(minimumChars))) : 300,
  }
}

function normalizedVariant(value: unknown): CognitivePracticeVariant | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  const prompt = clean(row.prompt, 8000)
  if (!prompt) return null
  const rawKey = clean(row.variantKey, 160)
  return {
    variantKey: rawKey || createHash('sha256').update(prompt).digest('hex').slice(0, 16),
    prompt,
    rubric: normalizedRubric(row.rubric),
  }
}

export function parseCognitiveSkillDraft(raw: string): CognitiveSkillDraft | null {
  const parsed = parseJsonObject(raw)
  if (!parsed) return null
  return {
    title: clean(parsed.title, 180),
    description: clean(parsed.description, 1600),
    problemClass: clean(parsed.problemClass, 320),
    prerequisites: cleanArray(parsed.prerequisites),
    procedureSteps: cleanArray(parsed.procedureSteps, 16, 900),
    discriminatingSignals: cleanArray(parsed.discriminatingSignals),
    tools: cleanArray(parsed.tools),
    observables: cleanArray(parsed.observables),
    falsifiers: cleanArray(parsed.falsifiers),
    commonFailureModes: cleanArray(parsed.commonFailureModes),
    prohibitedActions: cleanArray(parsed.prohibitedActions),
  }
}

export function validateCognitiveSkillDraft(draft: CognitiveSkillDraft): { ok: boolean; reasons: string[] } {
  const reasons: string[] = []
  if (draft.title.length < 5) reasons.push('title_too_short')
  if (draft.description.length < 40) reasons.push('description_too_short')
  if (draft.problemClass.length < 12) reasons.push('problem_class_too_short')
  if (draft.procedureSteps.length < 3) reasons.push('insufficient_procedure_steps')
  if (draft.discriminatingSignals.length < 2) reasons.push('insufficient_discriminating_signals')
  if (draft.observables.length < 2) reasons.push('insufficient_observables')
  if (draft.falsifiers.length < 2) reasons.push('insufficient_falsifiers')
  const memorization = `${draft.title} ${draft.description} ${draft.problemClass}`.toLowerCase()
  if (/copy the teacher|repeat the teacher|memorize this answer|always answer exactly/.test(memorization)) reasons.push('memorization_not_generalization')
  return { ok: reasons.length === 0, reasons }
}

export function skillKeyForDraft(draft: CognitiveSkillDraft): string {
  const base = clean(draft.problemClass, 160).toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72) || 'general-procedural-skill'
  const suffix = createHash('sha256').update(clean(draft.problemClass, 1000).toLowerCase()).digest('hex').slice(0, 10)
  return `${base}-${suffix}`
}

export function cognitiveSkillProcedure(draft: CognitiveSkillDraft): Record<string, unknown> {
  return {
    version: 1,
    problemClass: draft.problemClass,
    prerequisites: draft.prerequisites,
    procedureSteps: draft.procedureSteps,
    discriminatingSignals: draft.discriminatingSignals,
    tools: draft.tools,
    observables: draft.observables,
    falsifiers: draft.falsifiers,
    commonFailureModes: draft.commonFailureModes,
    prohibitedActions: draft.prohibitedActions,
  }
}

export function buildSkillExtractionPrompt(input: {
  prompt: string
  localAnswer?: string | null
  escalationReason?: string | null
  teacherAnswer: string
}): string {
  return `You are converting one failed/escalated experience into a reusable procedural skill candidate for COS.\n\nThe external answer is a TEACHER SIGNAL, not verified truth. Do not copy its prose and do not turn specific claims into facts. Compare the original problem, the local attempt, the escalation reason, and the teacher response. Extract only a general problem-solving procedure that could transfer to unseen variants.\n\nORIGINAL PROBLEM:\n${clean(input.prompt, 12000)}\n\nLOCAL ATTEMPT:\n${clean(input.localAnswer, 12000) || '(none)'}\n\nESCALATION REASON:\n${clean(input.escalationReason, 3000) || '(none)'}\n\nTEACHER SIGNAL:\n${clean(input.teacherAnswer, 16000)}\n\nReturn strict JSON only with keys: title, description, problemClass, prerequisites, procedureSteps, discriminatingSignals, tools, observables, falsifiers, commonFailureModes, prohibitedActions. Arrays must contain short reusable instructions, not an answer to this one prompt. Include at least three procedureSteps, two discriminatingSignals, two observables, and two falsifiers.`
}

export function buildLocalPracticeGenerationPrompt(input: {
  sourcePrompt: string
  draft: CognitiveSkillDraft
}): string {
  return `Generate exactly two PRACTICE exercises for a procedural skill. These are training exercises and can never count as held-out validation because the same local reasoner is generating them. Make both materially different from the source prompt while testing the same underlying skill. Do not provide answers.\n\nSOURCE PROBLEM:\n${clean(input.sourcePrompt, 10000)}\n\nSKILL:\n${clean(JSON.stringify(cognitiveSkillProcedure(input.draft)), 12000)}\n\nReturn strict JSON only: {"variants":[{"variantKey":"practice-...","prompt":"...","rubric":{"requiredConceptGroups":[["term","synonym"],...],"forbiddenPatterns":["..."],"minimumConceptCoverage":0.6,"minimumAnswerCharacters":300}}, ...]}. The rubric is for post-answer deterministic grading and must use short concept/synonym groups. Never put the rubric inside the exercise prompt.`
}

export function parsePracticeVariants(raw: string): CognitivePracticeVariant[] {
  const parsed = parseJsonObject(raw)
  if (!parsed || !Array.isArray(parsed.variants)) return []
  return parsed.variants.map(normalizedVariant).filter(Boolean).slice(0, 5) as CognitivePracticeVariant[]
}

export function buildTeacherEvaluationPrompt(input: {
  sourcePrompt: string
  teacherAnswer: string
  teacherProvider?: string | null
  draft: CognitiveSkillDraft
}): string {
  return `Act as an independent evaluator/exam designer for a learning agent. Another model produced the teacher signal below; you must NOT assume it is correct merely because it came from a frontier model. Review the generalized procedural candidate for conceptual defensibility, transferability, falsifiability, and safety. Then create one unseen UNDERSTANDING check and exactly three HOLDOUT cases. Do not provide answers inside the prompts.\n\nORIGINAL PROBLEM:\n${clean(input.sourcePrompt, 10000)}\n\nORIGINAL TEACHER SIGNAL (${clean(input.teacherProvider, 120) || 'unknown provider'}):\n${clean(input.teacherAnswer, 14000)}\n\nGENERALIZED CANDIDATE:\n${clean(JSON.stringify({ title: input.draft.title, description: input.draft.description, ...cognitiveSkillProcedure(input.draft) }), 16000)}\n\nReturn strict JSON only with this shape: {"candidateApproved":true,"candidateScore":0.0,"reason":"...","understanding":{"variantKey":"understanding-1","prompt":"...","rubric":{"requiredConceptGroups":[["term","synonym"],...],"forbiddenPatterns":[],"minimumConceptCoverage":0.7,"minimumAnswerCharacters":250}},"holdouts":[three variants in the same format]}. Holdouts must be materially different from the original problem and from one another. Rubrics should describe required concepts with synonym alternatives, not exact canned sentences.`
}

export function parseTeacherEvaluation(raw: string): CognitiveTeacherEvaluation | null {
  const parsed = parseJsonObject(raw)
  if (!parsed) return null
  const understanding = normalizedVariant(parsed.understanding)
  const holdouts = Array.isArray(parsed.holdouts) ? parsed.holdouts.map(normalizedVariant).filter(Boolean).slice(0, 3) as CognitivePracticeVariant[] : []
  const score = Number(parsed.candidateScore)
  if (!understanding || holdouts.length !== 3 || !Number.isFinite(score)) return null
  return {
    candidateApproved: parsed.candidateApproved === true,
    candidateScore: Math.max(0, Math.min(1, score)),
    reason: clean(parsed.reason, 1600),
    understanding,
    holdouts,
  }
}

export function evaluateAnswerAgainstRubric(answer: string, rubric: CognitivePracticeRubric): {
  pass: boolean
  score: number
  coverage: number
  matchedGroups: number
  totalGroups: number
  forbiddenMatches: string[]
  reason: string
} {
  const normalized = clean(answer, 40000).toLowerCase()
  const groups = rubric.requiredConceptGroups
  const matched = groups.filter(group => group.some(term => normalized.includes(clean(term, 160).toLowerCase()))).length
  const coverage = groups.length ? matched / groups.length : 0
  const forbiddenMatches = rubric.forbiddenPatterns.filter(pattern => {
    const term = clean(pattern, 180).toLowerCase()
    return Boolean(term && normalized.includes(term))
  })
  const lengthScore = normalized.length >= rubric.minimumAnswerCharacters ? 1 : normalized.length / Math.max(1, rubric.minimumAnswerCharacters)
  const conceptScore = groups.length ? coverage : 0
  const score = Math.max(0, Math.min(1, conceptScore * 0.85 + lengthScore * 0.15))
  const pass = normalized.length >= rubric.minimumAnswerCharacters && groups.length >= 2 && coverage >= rubric.minimumConceptCoverage && forbiddenMatches.length === 0
  return {
    pass,
    score,
    coverage,
    matchedGroups: matched,
    totalGroups: groups.length,
    forbiddenMatches,
    reason: pass ? 'deterministic_rubric_pass' : forbiddenMatches.length ? 'forbidden_pattern_matched' : coverage < rubric.minimumConceptCoverage ? 'concept_coverage_below_threshold' : groups.length < 2 ? 'rubric_insufficient' : 'answer_too_short',
  }
}

import { callCosReasoner } from './cosReasoner.ts'
import {
  recordCitedCognitiveSkillReuse,
  retrieveValidatedCognitiveSkills,
  type CognitiveSkillContextResult,
} from './cognitiveSkillContext.ts'
import { executiveCommunicationBlock } from './executiveCommunication.ts'
import { textTransformationMode } from './textTransformationQuality.ts'

export type NeuralCommunicationAlternative = Readonly<{
  label: string
  text: string
}>

export type NeuralCommunicationResult = Readonly<{
  recommended: string
  alternatives: readonly NeuralCommunicationAlternative[]
  alternativesUseful: boolean
  confidence: number
  reasonerLabel: string | null
  skillUsage: Readonly<{
    retrieved: number
    relevant: number
    selected: number
    ids: readonly string[]
    keys: readonly string[]
  }>
}>

type CommunicationEvaluation = Readonly<{
  meaningFidelity: number
  diplomacy: number
  elegance: number
  authenticVoice: number
  unsupportedAdditions: number
  literalness: number
  violations: readonly string[]
  repairInstructions: readonly string[]
}>

type DraftSet = {
  recommended: string
  alternatives: NeuralCommunicationAlternative[]
  alternativesUseful: boolean
  confidence: number
  releaseScore: number
}

const CORRESPONDENCE_OPENING = /^\s*(?:hi|hello|dear|good\s+(?:morning|afternoon|evening))\b/im
const CORRESPONDENCE_SIGNAL = /\b(?:thank\s+you|thanks|regards|sincerely|respectfully|please|appreciate|feedback|follow\s+up|catch(?:ing)?\s+up)\b/i
const BODY_ONLY_CORRESPONDENCE_SIGNAL = /\b(?:email|message|thread|chain|reply|respond|recipient|colleague|colleagues|manager|supervisor|team)\b/i
const EMAIL_HEADER = /^\s*(?:from|sent|to|cc|bcc|subject)\s*:/im

const INSTITUTIONAL_DIPLOMATIC_GUIDANCE = [
  'INSTITUTIONAL / DIPLOMATIC CORRESPONDENCE — APPLY WHEN THE DRAFT TOUCHES COLLEAGUES, CAREERS, PROMOTION, PERFORMANCE, POLICY, LEADERSHIP, GRIEVANCES, OR A CONTESTED INTERNAL QUESTION:',
  '- Preserve the writer\'s substantive point and conviction, but remove ridicule, contempt, needless personal characterization, and language that sounds bitter or accusatory unless the user explicitly asks to retain that tone.',
  '- Distinguish observation from inference. "I have heard colleagues say..." must not become "colleagues claim..." or a statement about their true motives.',
  '- Convert personal frustration into an institutional argument where possible: context -> observed tension -> concrete proposal -> rationale -> limitations/tradeoffs -> concluding principle. Do not force this structure when the source does not support it.',
  '- When proposing a policy or process change, frame it as a serious recommendation for consideration rather than an attack on people who may prefer a different career path.',
  '- Respect legitimate differences in professional goals. Do not imply that technical, operational, non-managerial, or hands-on work is lesser work.',
  '- Preserve useful concessions and limits, such as acknowledging that wanting promotion does not itself make someone a good manager. These qualifications strengthen credibility and are not filler.',
  '- Assume the message could be forwarded to the people it discusses or to senior leadership. Every sentence should remain professional and defensible in that setting.',
  '- Diplomatic does not mean vague. The proposal, rationale, and requested institutional change should remain clear.',
].join('\n')

function clamp(value: unknown, fallback = 0): number {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? Math.max(0, Math.min(1, numeric)) : fallback
}

function cleanText(value: unknown, max = 12_000): string {
  return String(value ?? '').replace(/\r\n?/g, '\n').trim().slice(0, max)
}

function cleanLabel(value: unknown): string {
  return String(value ?? '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const value = String(raw || '').trim()
  const start = value.indexOf('{')
  const end = value.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const parsed = JSON.parse(value.slice(start, end + 1))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null
  } catch {
    return null
  }
}

function parseDraftSet(raw: string): DraftSet | null {
  const parsed = parseJsonObject(raw)
  if (!parsed) return null
  const recommended = cleanText(parsed.recommended, 10_000)
  if (!recommended) return null
  const alternatives = Array.isArray(parsed.alternatives)
    ? parsed.alternatives.flatMap((item): NeuralCommunicationAlternative[] => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return []
        const row = item as Record<string, unknown>
        const label = cleanLabel(row.label)
        const text = cleanText(row.text, 10_000)
        return label && text ? [{ label, text }] : []
      }).slice(0, 2)
    : []
  return {
    recommended,
    alternatives,
    alternativesUseful: parsed.alternatives_useful === true && alternatives.length > 0,
    confidence: clamp(parsed.confidence, 0.6),
    releaseScore: clamp(parsed.release_score, clamp(parsed.confidence, 0.6)),
  }
}

function parseEvaluation(raw: string): CommunicationEvaluation | null {
  const parsed = parseJsonObject(raw)
  if (!parsed || !parsed.scores || typeof parsed.scores !== 'object' || Array.isArray(parsed.scores)) return null
  const scores = parsed.scores as Record<string, unknown>
  const list = (field: string) => Array.isArray(parsed[field])
    ? (parsed[field] as unknown[]).map(item => cleanLabel(item)).filter(Boolean).slice(0, 10)
    : []
  return {
    meaningFidelity: clamp(scores.meaning_fidelity, 0),
    diplomacy: clamp(scores.diplomacy, 0),
    elegance: clamp(scores.elegance, 0),
    authenticVoice: clamp(scores.authentic_voice, 0),
    unsupportedAdditions: clamp(scores.absence_of_unsupported_additions, 0),
    literalness: clamp(scores.non_literal_reconstruction, 0),
    violations: list('violations'),
    repairInstructions: list('repair_instructions'),
  }
}

function evaluationFloor(value: CommunicationEvaluation): number {
  return Math.min(
    value.meaningFidelity,
    value.diplomacy,
    value.elegance,
    value.authenticVoice,
    value.unsupportedAdditions,
    value.literalness,
  )
}

function evaluationPasses(value: CommunicationEvaluation): boolean {
  return evaluationFloor(value) >= 0.82 && value.violations.length === 0
}

async function evaluateDelicateCandidate(input: {
  instruction: string
  source: string
  candidate: string
  editorialGuidance?: string
}): Promise<CommunicationEvaluation | null> {
  const reasoned = await callCosReasoner({
    temperature: 0,
    maxTokens: 1000,
    systemPrompt: [
      'You are an independent senior communication editor evaluating a proposed rewrite against its ORIGINAL source. Do not rewrite it and do not defend it.',
      'Return ONLY strict JSON: {"scores":{"meaning_fidelity":0.0,"diplomacy":0.0,"elegance":0.0,"authentic_voice":0.0,"absence_of_unsupported_additions":0.0,"non_literal_reconstruction":0.0},"violations":["..."],"repair_instructions":["..."]}.',
      'Score each dimension independently. A fluent or grammatical draft can still fail diplomacy, elegance, voice, or factual restraint.',
      'Mark a violation when the candidate: changes "say/express" into accusatory wording such as "claim"; addresses colleagues as "you should" when reflective institutional framing is more appropriate; uses blunt conclusions such as "the bottom line is simple" in a delicate discussion; tracks the rough source sentence by sentence; erases the writer\'s hesitation or late-career perspective; invents organizational benefits, motives, conduct, acceptance of promotion, succession planning, or HR practices; or sounds like a generic memo rather than a seasoned colleague.',
      'Diplomacy requires careful attribution, legitimate alternative perspectives, explicit respect for technical/operational work, and a proposal offered for consideration without erasing its substance.',
      'Elegance requires natural cadence, transitions, qualification, and institutional maturity—not headings, slogans, or bureaucratic filler.',
      input.editorialGuidance,
    ].filter(Boolean).join('\n\n'),
    prompt: [
      `USER INSTRUCTION:\n${cleanText(input.instruction, 1500)}`,
      `ORIGINAL SOURCE:\n<<<SOURCE\n${cleanText(input.source, 12000)}\nSOURCE`,
      `CANDIDATE TO EVALUATE:\n<<<CANDIDATE\n${cleanText(input.candidate, 12000)}\nCANDIDATE`,
    ].join('\n\n'),
  }).catch(() => null)
  return reasoned?.text ? parseEvaluation(reasoned.text) : null
}

async function repairFromIndependentEvaluation(input: {
  instruction: string
  source: string
  candidate: DraftSet
  evaluation: CommunicationEvaluation
  editorialGuidance?: string
  language?: string
}): Promise<{ set: DraftSet; reasonerLabel: string | null } | null> {
  const reasoned = await callCosReasoner({
    temperature: 0.12,
    maxTokens: 3200,
    systemPrompt: [
      'You are the senior writer repairing a delicate communication that failed an independent comparative review.',
      'Return ONLY strict JSON in the draft-set schema.',
      'Rebuild from the ORIGINAL source and the writer\'s objective. Do not merely substitute synonyms in the failed candidate.',
      'Resolve every listed violation. Preserve the writer\'s hesitation, lived experience, substantive proposal, and legitimate qualification while using defensible, elegant institutional language.',
      'Never use "claim" for what colleagues say, never address a broad colleague group as "you should" in this reflective proposal, and never invent what colleagues did, accepted, preferred, or intended.',
      'Do not use "the bottom line is simple" or another blunt ultimatum. Do not invent benefits, succession planning, talent alignment, people practices, headings, recipients, closings, or signatures.',
      executiveCommunicationBlock(input.language),
      input.editorialGuidance,
    ].filter(Boolean).join('\n\n'),
    prompt: [
      `USER INSTRUCTION:\n${cleanText(input.instruction, 1500)}`,
      `ORIGINAL SOURCE:\n<<<SOURCE\n${cleanText(input.source, 12000)}\nSOURCE`,
      `FAILED CANDIDATE:\n${JSON.stringify(input.candidate)}`,
      `INDEPENDENT REVIEW:\n${JSON.stringify(input.evaluation)}`,
      'Return a materially stronger complete draft now.',
    ].join('\n\n'),
  }).catch(() => null)
  if (!reasoned?.text) return null
  const set = parseDraftSet(reasoned.text)
  return set ? { set, reasonerLabel: reasoned.reasoner.label } : null
}

export function isNeuralCommunicationTransformation(instruction: string, source: string): boolean {
  const mode = textTransformationMode(instruction)
  if (!['edit', 'polish', 'rewrite'].includes(mode)) return false
  const text = String(source || '').trim()
  if (text.length < 40) return false
  return CORRESPONDENCE_OPENING.test(text)
    || EMAIL_HEADER.test(text)
    || (text.length >= 120 && CORRESPONDENCE_SIGNAL.test(text))
    || (text.length >= 220 && BODY_ONLY_CORRESPONDENCE_SIGNAL.test(text))
}

function skillUsage(context: CognitiveSkillContextResult) {
  return {
    retrieved: context.retrieved,
    relevant: context.relevant,
    selected: context.selected,
    ids: context.items.map(item => item.id),
    keys: context.items.map(item => item.skillKey),
  }
}

function skillBlock(context: CognitiveSkillContextResult): string {
  if (!context.items.length) {
    return 'VALIDATED PROCEDURAL COMMUNICATION SKILLS: none were sufficiently relevant this turn. Use the neural communication framework below without inventing a skill.'
  }
  return [
    'VALIDATED PROCEDURAL COMMUNICATION SKILLS — APPLY AS GUIDANCE, NEVER EXPOSE OR QUOTE THESE INTERNAL SKILL RECORDS:',
    ...context.items.map(item => item.line),
  ].join('\n')
}

async function retrieveCommunicationSkills(instruction: string, source: string): Promise<CognitiveSkillContextResult> {
  const query = [
    'Professional correspondence communication reasoning: audience relationship, intent, diplomacy, empathy, persuasion, clarity, reply strategy, editing, alternative response approaches.',
    `Instruction: ${cleanText(instruction, 600)}`,
    `Draft: ${cleanText(source, 5_000)}`,
  ].join('\n')
  return retrieveValidatedCognitiveSkills(query).catch(() => ({
    retrieved: 0,
    relevant: 0,
    selected: 0,
    dependencyRejected: 0,
    items: [],
  }))
}

async function generateDraftSet(input: {
  instruction: string
  source: string
  referenceContext: string | null
  semanticAnchors: string
  editorialGuidance?: string
  language?: string
  skills: CognitiveSkillContextResult
}): Promise<{ set: DraftSet; reasonerLabel: string | null } | null> {
  const context = input.referenceContext ? cleanText(input.referenceContext, 10_000) : ''
  const reasoned = await callCosReasoner({
    temperature: 0.18,
    maxTokens: 3600,
    systemPrompt: [
      'You are COS Neural Communication Advisor, the deep-neural reasoning layer behind SignalBoost Concierge correspondence work.',
      'The actual writing and communication judgment MUST come from neural reasoning. Deterministic code outside this call may only classify the task, protect facts, and verify release boundaries; it is not the writer.',
      'Do not reveal private chain-of-thought. Perform the reasoning silently and return ONLY strict JSON with this schema:',
      '{"recommended":"...","alternatives_useful":true,"alternatives":[{"label":"Warmer","text":"..."},{"label":"More concise","text":"..."}],"confidence":0.0,"release_score":0.0}',
      'COMMUNICATION REASONING — APPLY SILENTLY:',
      '1. Infer the sender’s actual objective, the audience relationship, emotional stakes, desired outcome, sensitivity, and what the recipient needs to understand or do.',
      '2. Distinguish facts/terms that must be preserved from weak wording that should be replaced.',
      '3. Generate at least THREE genuinely different candidate approaches internally before choosing the recommended draft. Do not expose those hidden candidates or your reasoning.',
      '4. Select the approach that best serves the sender’s objective while sounding natural, credible, human, and appropriately warm or diplomatic.',
      '5. When two other approaches would genuinely help the sender, return up to two complete alternatives with useful labels. Alternatives may change tone, concision, or emphasis but must not change facts or commitments.',
      '6. Self-review for strategic helpfulness, audience fit, naturalness, factual fidelity, clarity, and whether the result materially improves the original instead of sentence-by-sentence grammar repair.',
      INSTITUTIONAL_DIPLOMATIC_GUIDANCE,
      'QUALITY FLOOR:',
      '- A grammar-checker result is a failure. For rough or non-native source text, rebuild sentences and paragraph flow substantially.',
      '- Preserve names, acronyms, program names, roles, dates, numbers, links, commitments, uncertainty, actor/action/recipient relationships, and all factual constraints.',
      '- Do not invent benefits, motives, history, promises, obligations, or facts not supported by the source/context.',
      '- If a program/action phrase is ambiguous (for example register/assign/apply), do not guess a different factual meaning. Preserve the supported term or phrase it neutrally.',
      '- Preserve the sender’s voice and relationship. Personal correspondence may sound genuinely warm; professional correspondence must not become sterile memo language.',
      '- Normalize presentation-only URL escaping such as www\\.example.com to www.example.com without changing the destination.',
      '- Return complete ready-to-send drafts, not commentary about how to write them.',
      input.semanticAnchors,
      skillBlock(input.skills),
      executiveCommunicationBlock(input.language),
      // Task-specific register/voice guidance must be last. The generic executive module values
      // compression and directness; for delicate correspondence those defaults must not erase
      // qualification, emotional context, or diplomacy.
      input.editorialGuidance,
    ].filter(Boolean).join('\n\n'),
    prompt: [
      `USER INSTRUCTION:\n${cleanText(input.instruction, 1_500)}`,
      `ORIGINAL DRAFT:\n<<<SOURCE\n${cleanText(input.source, 12_000)}\nSOURCE`,
      context ? `REFERENCE CONTEXT — READ ONLY; DO NOT ECHO:\n<<<CONTEXT\n${context}\nCONTEXT` : '',
      'Create the strongest communication now. Do not merely correct grammar.',
    ].filter(Boolean).join('\n\n'),
  }).catch(() => null)

  if (!reasoned?.text) return null
  const set = parseDraftSet(reasoned.text)
  return set ? { set, reasonerLabel: reasoned.reasoner.label } : null
}

async function neuralQualityReview(input: {
  instruction: string
  source: string
  referenceContext: string | null
  semanticAnchors: string
  editorialGuidance?: string
  language?: string
  skills: CognitiveSkillContextResult
  candidate: DraftSet
}): Promise<{ set: DraftSet; reasonerLabel: string | null } | null> {
  const reasoned = await callCosReasoner({
    temperature: 0.1,
    maxTokens: 3600,
    systemPrompt: [
      'You are the final COS Neural Communication Quality Board. Use neural judgment, not a grammar checklist.',
      'Do not reveal private chain-of-thought. Return ONLY strict JSON with the same draft-set schema:',
      '{"recommended":"...","alternatives_useful":true,"alternatives":[{"label":"...","text":"..."}],"confidence":0.0,"release_score":0.0}',
      'Evaluate the proposed communication against the ORIGINAL draft, not just against grammar.',
      'A release-quality result must: preserve facts and actor/action/recipient relationships; understand the relationship and purpose; materially improve awkward/non-native phrasing; organize the message naturally; make the request or next step clear; sound like a capable human; and avoid invented facts or overstatement.',
      'For sensitive institutional correspondence, the result must preserve the writer’s argument while removing unnecessary personal disparagement, mind-reading, contempt, or wording that would make the message needlessly adversarial.',
      'Do not erase the position in the name of diplomacy. The substantive proposal and rationale must remain clear, but they should be framed in language the writer could defend if the message were forwarded broadly.',
      'Judge the actual draft on five independent dimensions: meaning fidelity, diplomatic judgment, elegance/naturalness, authentic voice, and absence of unsupported additions. A polished surface cannot compensate for failure on any one dimension.',
      'Preserve supported emotional conflict, lived experience, and reflective seniority when they strengthen the purpose. Transform risky rhetoric into a dignified equivalent; do not copy the insult and do not erase its underlying point.',
      'Reject generic memo structure, invented headings or numbered benefit lists, and invented salutations, closings, names, titles, or bracketed signature placeholders unless requested or present in the source.',
      'Reject categorical claims about fairness, efficiency, resource savings, morale, or institutional outcomes when the source supports only a possibility or personal observation.',
      'If the proposed result still tracks the original sentence-by-sentence, sounds generic, awkward, sterile, accusatory, or merely corrected, REWRITE IT rather than approving it.',
      'If an alternative is not genuinely useful or materially distinct, replace it or omit it. Never manufacture factual differences between alternatives.',
      'For an ambiguous domain term or program action, preserve the ambiguity rather than guessing a more specific action.',
      'Normalize Markdown-escaped URL dots without changing the URL.',
      'Set release_score below 0.82 unless you would confidently send the recommended draft to the stated recipient without further rewriting.',
      INSTITUTIONAL_DIPLOMATIC_GUIDANCE,
      input.semanticAnchors,
      skillBlock(input.skills),
      executiveCommunicationBlock(input.language),
      input.editorialGuidance,
    ].filter(Boolean).join('\n\n'),
    prompt: [
      `USER INSTRUCTION:\n${cleanText(input.instruction, 1_500)}`,
      `ORIGINAL DRAFT:\n<<<SOURCE\n${cleanText(input.source, 12_000)}\nSOURCE`,
      input.referenceContext ? `REFERENCE CONTEXT — READ ONLY:\n<<<CONTEXT\n${cleanText(input.referenceContext, 10_000)}\nCONTEXT` : '',
      `PROPOSED DRAFT SET:\n${JSON.stringify(input.candidate)}`,
      'Release a repaired, high-quality draft set now.',
    ].filter(Boolean).join('\n\n'),
  }).catch(() => null)

  if (!reasoned?.text) return null
  const set = parseDraftSet(reasoned.text)
  return set ? { set, reasonerLabel: reasoned.reasoner.label } : null
}

async function neuralLastRepair(input: {
  instruction: string
  source: string
  referenceContext: string | null
  semanticAnchors: string
  editorialGuidance?: string
  language?: string
  candidate: DraftSet
}): Promise<{ set: DraftSet; reasonerLabel: string | null } | null> {
  const reasoned = await callCosReasoner({
    temperature: 0.16,
    maxTokens: 3200,
    systemPrompt: [
      'You are COS doing a final neural rewrite because the previous communication did not clear the release-quality threshold.',
      'Do not reveal chain-of-thought. Return ONLY strict JSON in the draft-set schema.',
      'Rewrite from the underlying communication objective, not from the previous wording. Preserve facts, names, acronyms, links, commitments, uncertainty, and actor/action/recipient relationships.',
      'The result must sound natural and purposeful, not like a grammar-corrected copy. Use paragraphs and transitions that fit the relationship and objective.',
      'For sensitive institutional writing, keep the proposal strong while removing needless personal attacks, ridicule, motive attribution, or contempt.',
      'Preserve the emotional and experiential basis of the writer\'s position when it serves the objective. The result should sound like the original writer at their best, not like an anonymous policy template.',
      'Do not add headings, numbered benefit lists, salutations, closings, names, titles, signature placeholders, or categorical benefits that are absent from the source and not requested.',
      'Do not invent facts or resolve ambiguous domain terminology by guessing.',
      'Normalize Markdown-escaped URL dots without changing the destination.',
      INSTITUTIONAL_DIPLOMATIC_GUIDANCE,
      input.semanticAnchors,
      executiveCommunicationBlock(input.language),
      input.editorialGuidance,
    ].filter(Boolean).join('\n\n'),
    prompt: [
      `USER INSTRUCTION:\n${cleanText(input.instruction, 1_500)}`,
      `ORIGINAL DRAFT:\n<<<SOURCE\n${cleanText(input.source, 12_000)}\nSOURCE`,
      input.referenceContext ? `REFERENCE CONTEXT — READ ONLY:\n<<<CONTEXT\n${cleanText(input.referenceContext, 10_000)}\nCONTEXT` : '',
      `FAILED CANDIDATE:\n${JSON.stringify(input.candidate)}`,
      'Produce a materially stronger recommended draft and only useful alternatives.',
    ].filter(Boolean).join('\n\n'),
  }).catch(() => null)
  if (!reasoned?.text) return null
  const set = parseDraftSet(reasoned.text)
  return set ? { set, reasonerLabel: reasoned.reasoner.label } : null
}

export async function tryNeuralCommunicationTransformation(input: {
  instruction: string
  source: string
  referenceContext?: string | null
  semanticAnchors?: string
  editorialGuidance?: string
  sensitivity?: 'routine' | 'careful' | 'delicate'
  language?: string
}): Promise<NeuralCommunicationResult | null> {
  if (!isNeuralCommunicationTransformation(input.instruction, input.source)) return null

  const skills = await retrieveCommunicationSkills(input.instruction, input.source)
  const generated = await generateDraftSet({
    instruction: input.instruction,
    source: input.source,
    referenceContext: input.referenceContext ?? null,
    semanticAnchors: input.semanticAnchors || '',
    editorialGuidance: input.editorialGuidance || '',
    language: input.language,
    skills,
  })
  if (!generated) return null

  let chosen = generated
  const reviewed = await neuralQualityReview({
    instruction: input.instruction,
    source: input.source,
    referenceContext: input.referenceContext ?? null,
    semanticAnchors: input.semanticAnchors || '',
    editorialGuidance: input.editorialGuidance || '',
    language: input.language,
    skills,
    candidate: generated.set,
  })
  if (reviewed) chosen = reviewed

  if (chosen.set.releaseScore < 0.82) {
    const repaired = await neuralLastRepair({
      instruction: input.instruction,
      source: input.source,
      referenceContext: input.referenceContext ?? null,
      semanticAnchors: input.semanticAnchors || '',
      editorialGuidance: input.editorialGuidance || '',
      language: input.language,
      candidate: chosen.set,
    })
    if (repaired) chosen = repaired
  }

  // Self-review scores from the writer are not acceptance evidence. Delicate/careful work receives
  // a separate comparison against the original, followed by one bounded repair and re-evaluation.
  if (input.sensitivity && input.sensitivity !== 'routine') {
    const evaluation = await evaluateDelicateCandidate({
      instruction: input.instruction,
      source: input.source,
      candidate: chosen.set.recommended,
      editorialGuidance: input.editorialGuidance,
    })
    if (evaluation && !evaluationPasses(evaluation)) {
      const repaired = await repairFromIndependentEvaluation({
        instruction: input.instruction,
        source: input.source,
        candidate: chosen.set,
        evaluation,
        editorialGuidance: input.editorialGuidance,
        language: input.language,
      })
      if (repaired) {
        const recheck = await evaluateDelicateCandidate({
          instruction: input.instruction,
          source: input.source,
          candidate: repaired.set.recommended,
          editorialGuidance: input.editorialGuidance,
        })
        if (recheck && (evaluationPasses(recheck) || evaluationFloor(recheck) > evaluationFloor(evaluation))) {
          chosen = repaired
        }
      }
    }
  }

  if (skills.items.length) {
    await recordCitedCognitiveSkillReuse(skills.items.map(item => item.id)).catch(() => undefined)
  }

  return {
    recommended: chosen.set.recommended,
    alternatives: chosen.set.alternatives,
    alternativesUseful: chosen.set.alternativesUseful,
    confidence: chosen.set.confidence,
    reasonerLabel: chosen.reasonerLabel,
    skillUsage: skillUsage(skills),
  }
}

export function formatNeuralCommunicationResult(input: {
  recommended: string
  alternatives?: readonly NeuralCommunicationAlternative[]
  alternativesUseful?: boolean
}): string {
  const recommended = cleanText(input.recommended, 12_000)
  const alternatives = (input.alternatives || []).filter(item => cleanText(item.text, 12_000)).slice(0, 2)
  if (!input.alternativesUseful || !alternatives.length) return recommended

  return [
    'Recommended reply',
    recommended,
    ...alternatives.flatMap(item => ['', `Alternative — ${cleanLabel(item.label) || 'different approach'}`, cleanText(item.text, 12_000)]),
  ].join('\n\n').trim()
}

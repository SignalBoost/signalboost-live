// REPO PATH: saas/lib/ai/cos/communicationNeuralReasoning.ts
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

const COMMUNICATION_REASONING_PROCEDURE = [
  'COMMUNICATION REASONING — APPLY SILENTLY, THEN WRITE. THIS IS A METHOD, NOT A TEMPLATE:',
  '1. Parse the actual writing job. What did the sender ask the draft to do? Who is the audience? What must the reader understand or decide?',
  '2. Separate invariants from wording. Invariants: facts, names, titles, acronyms, dates, numbers, links, actor/action/recipient relations, commitments, uncertainty, and the sender\'s stance. Wording: grammar, fluency, order, and emphasis.',
  '3. Infer the register from the source, not from a house style. If the source is a first-person thread reply with no greeting, keep it that way. If it is warm personal mail, keep warmth. If it is blunt institutional argument, keep bluntness after cleaning grammar.',
  '4. Reason about structure from the argument the source already makes. Do not pour the draft into a fixed memo shape (greeting, recap, observation, proposal, concession, close).',
  '5. Generate at least THREE genuinely different candidate approaches internally before choosing the recommended draft. Do not expose those hidden candidates or your reasoning. Choose the approach that best preserves meaning and voice while making the argument easier to follow.',
  '6. Self-review against the source: every material claim still present; no invented greeting, motive, fact, or commitment; distinctive images and idioms kept when they carry the point; result does not read like HR copy, a school essay, or a grammar-checker pass.',
].join('\n')

const ADULT_PROSE_STANDARD = [
  'ADULT PROSE — EDUCATED HUMAN, NOT SCHOOL ESSAY:',
  '- Write as a well-educated adult in the sender\'s profession would write to peers. Fluent, specific, economical. Not a five-paragraph essay and not a student recap.',
  '- Fail the draft if it uses school scaffolding: announce that you thought about writing, state a general observation, explain why a proposal is good, then restate the thesis as "the bottom line is simple."',
  '- Fail stock machinery: "I have observed a recurring pattern", "this would allow us to distinguish", "this ensures that", "conversely, it is inefficient", "those who can benefit from the opportunity."',
  '- Prefer concrete nouns and verbs from the source over category language (do not replace pouches, desks, computers, "check where your mouth is" with "operational contributions" or "leadership roles" unless the source used those abstractions).',
  '- Vary sentence length. Do not march every paragraph from topic sentence to restatement. Cut filler. Stop when the point is made.',
  '- Transitions should be invisible. If a sentence exists only to sound organized, delete it.',
].join('\n')

const INSTITUTIONAL_DIPLOMATIC_GUIDANCE = [
  'INSTITUTIONAL / DIPLOMATIC CORRESPONDENCE — APPLY WHEN THE DRAFT TOUCHES COLLEAGUES, CAREERS, PROMOTION, PERFORMANCE, POLICY, LEADERSHIP, GRIEVANCES, OR A CONTESTED INTERNAL QUESTION:',
  '- Neural reasoning writes the draft. Do not apply a memo template, stock greeting, or fixed paragraph order.',
  '- Never invent a salutation the source did not use (including "Dear Colleagues") and never open with stock hedges such as "I have debated whether to re-engage", "I have observed a recurring pattern", or "we risk missing an opportunity".',
  '- Preserve the writer\'s voice: first-person stance, cadence, idioms, concrete occupational images, and plain-speech closings. Correct spelling and grammar; do not launder the speaker into HR or front-office copy.',
  '- Distinctive source phrases that carry the argument must survive when they are not slurs or threats.',
  '- Preserve the writer\'s substantive point and conviction. Soften only ridicule, contempt, needless personal characterization, or wording that is bitter or accusatory unless the user explicitly asks to retain that tone.',
  '- Distinguish observation from inference. "I have heard colleagues say..." must not become "colleagues claim..." or a statement about their true motives.',
  '- When proposing a policy or process change, keep it as the writer\'s own recommendation. Do not recast it as a committee brief or an attack on people who prefer a different career path.',
  '- Respect legitimate differences in professional goals. Do not imply that technical, operational, non-managerial, or hands-on work is lesser work.',
  '- Preserve useful concessions and limits, such as acknowledging that wanting promotion does not itself make someone a good manager. These qualifications strengthen credibility and are not filler.',
  '- Assume the message could be forwarded. Keep it defensible without flattening it into generic institutional language.',
  '- Diplomatic does not mean vague or templated. The proposal, rationale, and requested change should remain clear in the writer\'s register.',
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
      COMMUNICATION_REASONING_PROCEDURE,
      ADULT_PROSE_STANDARD,
      'When two other approaches would genuinely help the sender, return up to two complete alternatives with useful labels. Alternatives may change tone, concision, or emphasis but must not change facts or commitments.',
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
      input.editorialGuidance,
      skillBlock(input.skills),
      executiveCommunicationBlock(input.language),
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
      COMMUNICATION_REASONING_PROCEDURE,
      ADULT_PROSE_STANDARD,
      'Evaluate the proposed communication against the ORIGINAL draft, not just against grammar.',
      'A release-quality result must: preserve facts and actor/action/recipient relationships; understand the relationship and purpose; materially improve awkward/non-native phrasing; organize the message from the source\'s own argument; make the request or next step clear; sound like the same well-educated adult; and avoid invented facts, greetings, school-essay scaffolding, or overstatement.',
      'Set release_score below 0.82 if the draft reads like a high-school essay, HR memo, or topic-sentence march.',
      'For sensitive institutional correspondence, the result must preserve the writer’s argument while removing unnecessary personal disparagement, mind-reading, contempt, or wording that would make the message needlessly adversarial.',
      'Do not erase the position in the name of diplomacy. The substantive proposal and rationale must remain clear, but they should be framed in language the writer could defend if the message were forwarded broadly.',
      'If the proposed result still tracks the original sentence-by-sentence, sounds generic, awkward, sterile, accusatory, or merely corrected, REWRITE IT rather than approving it.',
      'If an alternative is not genuinely useful or materially distinct, replace it or omit it. Never manufacture factual differences between alternatives.',
      'For an ambiguous domain term or program action, preserve the ambiguity rather than guessing a more specific action.',
      'Normalize Markdown-escaped URL dots without changing the URL.',
      'Set release_score below 0.82 unless you would confidently send the recommended draft to the stated recipient without further rewriting.',
      INSTITUTIONAL_DIPLOMATIC_GUIDANCE,
      input.semanticAnchors,
      input.editorialGuidance,
      skillBlock(input.skills),
      executiveCommunicationBlock(input.language),
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
      COMMUNICATION_REASONING_PROCEDURE,
      ADULT_PROSE_STANDARD,
      'Rewrite from the underlying communication objective, not from the previous wording. Preserve facts, names, acronyms, links, commitments, uncertainty, voice, and actor/action/recipient relationships.',
      'The result must sound natural and purposeful, not like a grammar-corrected copy or a stock memo. Use paragraphs and transitions that follow from the source\'s argument.',
      'For sensitive institutional writing, keep the proposal strong while removing needless personal attacks, ridicule, motive attribution, or contempt.',
      'Do not invent facts or resolve ambiguous domain terminology by guessing.',
      'Normalize Markdown-escaped URL dots without changing the destination.',
      INSTITUTIONAL_DIPLOMATIC_GUIDANCE,
      input.semanticAnchors,
      input.editorialGuidance,
      executiveCommunicationBlock(input.language),
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

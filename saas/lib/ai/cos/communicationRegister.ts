// saas/lib/ai/cos/communicationRegister.ts
//
// REGISTER IS SELECTED, NOT ASSUMED (2026-09-04)
// ---------------------------------------------
// executiveCommunicationBlock() is applied to every edit and fixes one register: leadership
// presence, confident, outcome-oriented, economical wording, remove filler, purpose-led opening,
// structure around the decision. For a status update to a manager that is right. For a careful
// message to peers about a contested institutional question it is actively wrong, because in that
// setting the hedging, the concessions and the acknowledgement of opposing views ARE the content.
// "Remove filler" deletes them, and compression turns a writer's tentative observation into a
// blunt assertion about named colleagues that they never made and would not want attributed.
//
// The register is therefore inferred from the draft by the reasoner, not matched against a list of
// sensitive words. A vocabulary list cannot see that a sentence disparages a colleague, that a
// claim is contested rather than settled, or that the audience is a peer distribution list rather
// than one manager. Those are semantic judgements and they are made semantically, in the language
// the draft is written in, so the classification works identically for the non-English locales.
//
// Fail-open by design: an unavailable or unparseable classification yields no guidance and the
// edit proceeds exactly as it did before. A register pass must never cost the user their edit.
//
// cosReasoner is imported DYNAMICALLY, inside the one async function that needs it. It reaches the
// Supabase client through '@/lib' path aliases that the repo's bare `node --experimental-strip-types
// --test` runner cannot resolve, so a top-level import makes this module and every test touching it
// unrunnable outside a Next build. That is exactly what took cosTextTransformationQuality.node.test.ts
// red on main when communicationNeuralReasoning.ts imported it at the top level.

export type CommunicationSensitivity = 'routine' | 'careful' | 'delicate'

export type RegisterProfile = Readonly<{
  sensitivity: CommunicationSensitivity
  audience: string
  objective?: string
  relationship?: string
  voiceCues?: readonly string[]
  emotionalStakes?: readonly string[]
  seniorityCues?: readonly string[]
  rhetoricalElements?: readonly string[]
  requiredTransformations?: readonly string[]
  risks: readonly string[]
}>

export const ROUTINE_REGISTER: RegisterProfile = Object.freeze({
  sensitivity: 'routine',
  audience: '',
  objective: '',
  relationship: '',
  voiceCues: Object.freeze([]),
  emotionalStakes: Object.freeze([]),
  seniorityCues: Object.freeze([]),
  rhetoricalElements: Object.freeze([]),
  requiredTransformations: Object.freeze([]),
  risks: Object.freeze([]),
})

const SENSITIVITIES: readonly CommunicationSensitivity[] = ['routine', 'careful', 'delicate']

function budgetMs(): number {
  const raw = Number(process.env.REGISTER_CLASSIFICATION_BUDGET_MS || 6000)
  return Number.isFinite(raw) ? Math.max(1500, Math.min(20000, raw)) : 6000
}

const CLASSIFIER_SYSTEM = [
  'You create one integrated communication profile for a draft message. You do not edit it.',
  'Return ONLY strict JSON: {"sensitivity":"routine|careful|delicate","audience":"<short phrase>","objective":"<short phrase>","relationship":"<short phrase>","voice_cues":["<short phrase>"],"emotional_stakes":["<short phrase>"],"seniority_cues":["<short phrase>"],"rhetorical_elements":["<short phrase>"],"required_transformations":["<short phrase>"],"risks":["<short phrase>"]}.',
  'sensitivity is delicate when the draft touches a contested question inside an organization, evaluates or characterizes colleagues, concerns careers, promotion, performance, conduct, grievances, or reputations, or would be read by people whose behaviour it describes.',
  'sensitivity is careful when the draft is professionally consequential but not contested — a request to someone senior, a refusal, an apology, a correction, bad news.',
  'sensitivity is routine for ordinary correspondence with no interpersonal or institutional exposure.',
  'audience names who will read it, in a few words, as the draft implies.',
  'objective states what the writer wants the communication to accomplish, without inventing an outcome.',
  'relationship states the implied relationship between writer and audience.',
  'voice_cues identifies authentic qualities worth preserving, such as candor, reflection, warmth, urgency, conviction, or humility. Report only cues supported by the draft.',
  'emotional_stakes identifies emotional meaning that contributes to the objective. Emotion is evidence about the voice, not an instruction to preserve every emotional phrase literally.',
  'seniority_cues identifies supported perspective such as long service, leadership experience, institutional memory, or late-career reflection. Never infer rank or title.',
  'rhetorical_elements identifies metaphors, humor, idioms, contrasts, or narrative framing. Identify whether each should be preserved, transformed, or removed to serve the objective safely.',
  'required_transformations describes the smallest high-value changes needed to preserve the writer while improving the result. Prefer transforming risky rhetoric over either copying it literally or erasing its underlying point.',
  'risks names, in short phrases, what in THIS draft could damage the writer or a third party if published as written: dismissive characterizations of a group, criticism attributed to named people, a contested opinion stated as established fact, self-deprecation that undercuts the writer, wording that could be read as bitterness.',
  'Report only risks actually present. Return an empty array when there are none. Judge the draft in the language it is written in.',
].join('\n')

function parseProfile(raw: string): RegisterProfile | null {
  const text = String(raw || '').trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(text.slice(start, end + 1))
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const value = parsed as Record<string, unknown>
  const sensitivity = String(value.sensitivity || '').toLowerCase() as CommunicationSensitivity
  if (!SENSITIVITIES.includes(sensitivity)) return null
  const list = (field: string, max = 8) => Array.isArray(value[field])
    ? (value[field] as unknown[]).map(item => String(item || '').trim()).filter(Boolean).slice(0, max)
    : []
  return Object.freeze({
    sensitivity,
    audience: String(value.audience || '').trim().slice(0, 120),
    objective: String(value.objective || '').trim().slice(0, 180),
    relationship: String(value.relationship || '').trim().slice(0, 120),
    voiceCues: Object.freeze(list('voice_cues')),
    emotionalStakes: Object.freeze(list('emotional_stakes')),
    seniorityCues: Object.freeze(list('seniority_cues')),
    rhetoricalElements: Object.freeze(list('rhetorical_elements')),
    requiredTransformations: Object.freeze(list('required_transformations')),
    risks: Object.freeze(list('risks')),
  })
}

/** Infer the communicative situation of a draft. Never throws; returns routine on any failure. */
export async function classifyCommunicationRegister(editableSource: string): Promise<RegisterProfile> {
  const draft = String(editableSource || '').trim()
  if (!draft) return ROUTINE_REGISTER
  try {
    const { callCosReasoner } = await import('./cosReasoner.ts')
    const result = await Promise.race([
      callCosReasoner({
        temperature: 0,
        maxTokens: 400,
        systemPrompt: CLASSIFIER_SYSTEM,
        prompt: `DRAFT:\n<<<DRAFT\n${draft.slice(0, 6000)}\nDRAFT\n\nClassify it now.`,
      }),
      new Promise<null>(resolve => setTimeout(() => resolve(null), budgetMs())),
    ])
    if (!result?.text) return ROUTINE_REGISTER
    return parseProfile(result.text) ?? ROUTINE_REGISTER
  } catch (error) {
    console.warn('[cos-register] classification unavailable; editing at routine register', error)
    return ROUTINE_REGISTER
  }
}

/**
 * Guidance for the edit prompt. Emitted AFTER executiveCommunicationBlock so that where the two
 * genuinely conflict — concision against necessary qualification — this wins, and says so.
 */
export function registerGuidance(profile: RegisterProfile): string {
  if (profile.sensitivity === 'routine') return ''

  const lines: string[] = [
    `COMMUNICATIVE SITUATION — ${profile.sensitivity.toUpperCase()}${profile.audience ? `, addressed to ${profile.audience}` : ''}.`,
    profile.objective ? `WRITER'S OBJECTIVE: ${profile.objective}` : '',
    profile.relationship ? `AUDIENCE RELATIONSHIP: ${profile.relationship}` : '',
    'WHERE THIS CONFLICTS WITH THE EXECUTIVE WRITING GUIDANCE ABOVE, THIS SECTION GOVERNS.',
    '- Concision is not the goal here. Qualification, acknowledgement of other views, and careful framing are the substance of a message like this, not filler to be removed. The finished text may be longer than the source.',
    '- Never sharpen the writer. If the source states something tentatively, as an impression, or as one person\'s view, it must stay that way. Do not convert an observation into an assertion, a wondering into a proposal, or a concern into a criticism.',
    '- Never let the finished text attribute criticism, motive, or fault to any person or group more strongly than the source does. Attribute less rather than more where the source is ambiguous.',
    '- Where the source dismisses, mocks, or belittles a group of people, render the underlying point in neutral, respectful terms and drop the disparagement. Do not preserve it and do not replace it with a politer form of the same put-down.',
    '- Where the draft advances a contested position, present it as the writer\'s suggestion offered for consideration, acknowledge that reasonable colleagues hold the other view, and affirm the legitimacy of the people the position could be read as diminishing.',
    '- Preserve the writer\'s standing and good faith: keep hedges, courtesy, and any statement of their own limits. Do not make them sound aggrieved, superior, or certain beyond what they wrote.',
    '- Preserve the writer\'s recognizable voice and emotional meaning when they advance the objective; do not preserve rough syntax or risky wording merely in the name of authenticity.',
    '- Transform a risky metaphor, idiom, joke, or sharp contrast into a defensible equivalent that retains its underlying point. Preserve it literally only when it remains appropriate for the audience; remove it only when no safe equivalent serves the objective.',
    '- Let supported experience and institutional perspective shape cadence and authority, but never invent rank, title, leadership status, or credentials.',
    '- Do not impose memo headings, numbered policy-benefit lists, a salutation, a closing, or signature placeholders unless the source or instruction calls for them.',
    '- Do not add claims that the proposal will improve fairness, efficiency, morale, resource use, or outcomes unless the source states or supports that rationale. Present plausible but unstated effects as possibilities, not facts.',
  ]

  if (profile.sensitivity === 'delicate') {
    lines.push('- Assume this will be read by the people it describes, and forwarded beyond its original recipients. Every sentence must remain defensible in that setting.')
  }

  if (profile.risks.length) {
    lines.push('RISKS IDENTIFIED IN THIS DRAFT — each must be resolved in the finished text, without dropping the writer\'s point:')
    for (const risk of profile.risks) lines.push(`- ${risk}`)
  }

  const addProfileItems = (heading: string, items: readonly string[]) => {
    if (!items.length) return
    lines.push(heading)
    for (const item of items) lines.push(`- ${item}`)
  }
  addProfileItems('VOICE CUES TO PRESERVE IN SUBSTANCE:', profile.voiceCues || [])
  addProfileItems('EMOTIONAL MEANING TO PRESERVE WHEN IT SERVES THE OBJECTIVE:', profile.emotionalStakes || [])
  addProfileItems('SUPPORTED SENIORITY / EXPERIENCE CUES:', profile.seniorityCues || [])
  addProfileItems('RHETORICAL ELEMENTS AND THEIR SAFE TREATMENT:', profile.rhetoricalElements || [])
  addProfileItems('REQUIRED TRANSFORMATIONS:', profile.requiredTransformations || [])

  return lines.filter(Boolean).join('\n')
}

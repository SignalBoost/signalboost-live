// saas/lib/outreach/campaignIntent.ts
//
// WHICH PIPELINE DID THE OPERATOR ACTUALLY ASK FOR — AND WHICH DID THEY FORBID?
//
// PORTABLE KERNEL. Pure, no imports, no host coupling. It reads a brief and decides which
// campaign pipeline it belongs to, or refuses to decide. It never starts anything.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS EXISTS, STATED PLAINLY BECAUSE THE FAILURE WAS SERIOUS
//
// A press brief was executed as a sales prospecting campaign. Thirty PUBLICATIONS were
// queued as if they were sales prospects, one step away from cold sales email landing on
// magazine editorial desks. The brief said, three separate times, that it was NOT a sales
// prospecting campaign and NOT a customer email outreach campaign.
//
// Those prohibitions are what caused it. The old matcher searched the whole message for
// the strings "outreach campaign" and "email outreach campaign" — which appeared in the
// brief ONLY inside the sentences forbidding them. The count pattern accepted any number
// after "identify" and never checked the noun, so "identify 30 publications" read as
// thirty companies. The one negation guard recognised "do not run a campaign" and not
// "this is not a campaign".
//
// ─────────────────────────────────────────────────────────────────────────────
// THE RULE THAT FOLLOWS, AND IT IS NOT A REGEX RULE
//
// PROHIBITIONS ARE READ FIRST AND THEY WIN — BUT ONLY WHEN THE NEGATION ACTUALLY TARGETS
// THE PIPELINE. A modifier such as "write a video without assuming the update details"
// constrains the writing task; it does not forbid video production merely because the two
// phrases share a clause. An instruction not to do X can never be the reason X happened,
// and an instruction to do X without Y can never be rewritten as "do not do X".
//
// AMBIGUITY REFUSES RATHER THAN GUESSES. If a brief carries live signals for two
// pipelines, nothing starts. A sales email to a journalist cannot be unsent, and an
// operation that cannot be checkpointed is refused before it begins rather than
// discovered afterwards.
//
// COUNTS ARE TYPED. "30 publications" and "30 companies" are different instructions. A
// bare number decides nothing.
//
// A brief with no campaign signal at all is NOT a refusal — it is an ordinary message and
// must be answered as one.

export type CampaignPipeline = 'prospect' | 'press' | 'ads' | 'social' | 'video'

export type CountSubject = 'companies' | 'publications' | 'unspecified'

export interface CampaignCount {
  value: number
  subject: CountSubject
  /** The noun actually written, so a refusal can quote the operator rather than paraphrase. */
  noun: string
}

export type CampaignIntentCode =
  | 'INTENT_CLEAR'
  | 'INTENT_PROHIBITED'
  | 'INTENT_AMBIGUOUS'
  | 'INTENT_NOT_A_BRIEF'

export interface CampaignIntentResult {
  /** The single pipeline that may proceed, or null when nothing may. */
  pipeline: CampaignPipeline | null
  /** Pipelines the operator explicitly forbade in this message. */
  prohibited: CampaignPipeline[]
  /** Pipelines with live (non-forbidden) signal. More than one means refuse. */
  signalled: CampaignPipeline[]
  count: CampaignCount | null
  decision: 'proceed' | 'refuse' | 'not-a-brief'
  code: CampaignIntentCode
  /** Operator-facing sentence. Empty only when the message was not a brief at all. */
  reason: string
}

// ─── Vocabulary ──────────────────────────────────────────────────────────────
// Kept deliberately narrow. A term earns its place only if its presence, outside a
// prohibition, is real evidence that this pipeline was requested.

const PIPELINE_TERMS: Record<CampaignPipeline, RegExp> = {
  prospect:
    /\b(?:prospect\w*|prospec\w*|cold ?email\w*|lead ?gen\w*|sales campaign|sales outreach|(?<!press )(?<!media )(?<!publicity )outreach campaign|email outreach|outreach email\w*|potential (?:buyers?|customers?|clients?)|prospective customers?|campanha de prospec[çc][aã]o|campa[ñn]a de prospecci[oó]n|kampani\w* prospect\w*|sprzeda\w*|аутрич|продаж|потенциальн\w+ клиент\w*)\b/i,
  press:
    /\b(?:press|publicity|publication|publications|publisher|publishers|magazine|magazines|newspaper|newspapers|journal|journals|journalist|journalists|editor|editors|editorial|newsroom|media outreach|trade press|trade journal|press release|newsletter|imprensa|jornal|revista|reda[çc][aã]o|prensa|peri[oó]dico|redacci[oó]n|prasa|gazeta|redakcja|пресса|газета|журнал|редакция)\b/i,
  ads: /\b(?:advertis\w*|sponsored (?:article|content|post)|paid media|paid placement|insertion order|ad campaign|ppc|publicidade|publicidad|reklam\w*|реклам\w*)\b/i,
  social:
    /\b(?:social media|linkedin|instagram|facebook|tiktok|youtube|twitter|social post\w*|redes sociais|redes sociales|media spo[łl]eczno\w*|соцсет\w*)\b/i,
  // VIDEO IS A PRODUCTION PIPELINE, NOT A CHANNEL. It renders, voices, brands and only
  // then publishes — which is why it could not be folded into `social`: the work, the
  // failure modes and the approval gate are entirely different from posting text.
  //
  // Bare words such as "video" are intentionally NOT enough. "Write a video", "review a
  // video", and "where is Video Studio?" are content/support requests, not authority to
  // start a production pipeline. Production requires either an explicit production noun
  // or a production verb bound to the video object.
  video:
    /\b(?:video campaign|video ad\w*|promo(?:tional)? video|explainer video|short video|(?:make|create|produce|generate|render)s? (?:a |an |the )?(?:new )?videos?|videos? (?:campaign|production|series)|(?:criar|fazer|produzir|gerar|renderizar) (?:um |uma |o |a )?v[íi]deo|(?:crear|hacer|producir|generar|renderizar) (?:un |una |el |la )?v[íi]deo|(?:stw[oó]rz|utw[oó]rz|wygeneruj|wyprodukuj|renderuj) (?:film|wideo)|(?:создай|сгенерируй|произведи|отрендери) видео|cosa)\b/i,
}

/**
 * Content authoring is not execution. These forms must fall through to ordinary COS writing
 * unless the same clause also explicitly asks to render/produce/publish the asset.
 */
const VIDEO_WRITING_REQUEST =
  /\b(?:write|draft|script|outline|storyboard|redact|escribe|redacta|escreva|redija|napisz|rozpisz|напиши|составь)\b[^.!?;\n\r]{0,140}\b(?:video|v[íi]deo|wideo|видео)\b/i
const VIDEO_SCRIPT_TARGET =
  /\b(?:video script|script for (?:a |an |the )?video|storyboard|voiceover script|guion(?: de)? v[íi]deo|roteiro(?: de)? v[íi]deo|scenariusz(?: do)? wideo|сценарий(?: для)? видео)\b/i
const VIDEO_HARD_EXECUTION =
  /\b(?:render|produce|generate|publish|post|launch|start|run|make|renderizar|produzir|gerar|publicar|lanzar|producir|generar|publicar|renderuj|wyprodukuj|opublikuj|запусти|сгенерируй|опубликуй|отрендери)\b/i

function isWritingOnlyVideoClause(clause: string): boolean {
  if (!VIDEO_WRITING_REQUEST.test(clause) && !VIDEO_SCRIPT_TARGET.test(clause)) return false
  return !VIDEO_HARD_EXECUTION.test(clause)
}

/**
 * A prohibition marker does not automatically negate every noun in the same sentence. We only
 * bind it to a pipeline when the words between the marker and pipeline are ordinary execution /
 * article fillers. This preserves "do not run a video campaign" while rejecting the false parse
 * in "write a video without assuming what the update contains".
 */
const PROHIBITION = new RegExp(
  [
    String.raw`\b(?:do not|don't|do não|n[aã]o |never|avoid|exclude|excluding|without|nie |не )\b`,
    String.raw`\b(?:is not|isn't|are not|aren't|это не|no es|n[aã]o [ée]|to nie)\b`,
    String.raw`^\s*not\b`,
  ].join('|'),
  'i',
)

const PROHIBITION_FILLER = /^(?:\s+(?:run|start|create|launch|build|prepare|generate|draft|execute|set|up|use|include|make|produce|render|send|publish|post|a|an|the|this|that|any|all|another|customer|sales|email|press|media|paid|social|campaign|production|criar|iniciar|gerar|produzir|crear|generar|producir|uruchom|stw[oó]rz|wygeneruj|создай|запусти|сгенерируй)){0,8}\s*$/i
const PROHIBITION_SUFFIX = /^\s*(?:(?:is|are|was|were)\s+(?:not|never)|isn't|aren't|wasn't|weren't)\b/i

function pipelineTermMatch(clause: string, pipeline: CampaignPipeline): RegExpMatchArray | null {
  if (pipeline === 'video' && isWritingOnlyVideoClause(clause)) return null
  return clause.match(PIPELINE_TERMS[pipeline])
}

function pipelineIsProhibited(clause: string, term: RegExpMatchArray): boolean {
  const termIndex = term.index ?? -1
  if (termIndex < 0) return false

  const before = clause.slice(0, termIndex)
  const marker = before.match(PROHIBITION)
  if (marker && marker.index !== undefined) {
    const markerEnd = marker.index + marker[0].length
    const between = before.slice(markerEnd)
    if (PROHIBITION_FILLER.test(between)) return true
  }

  const after = clause.slice(termIndex + term[0].length)
  return PROHIBITION_SUFFIX.test(after)
}

/** Splits a brief into clauses so a prohibition can be scoped to the sentence that carries it. */
function clausesOf(text: string): string[] {
  return text
    .split(/(?:[.!?;\n\r]|\u2022|^\s*[-*]\s)+/m)
    .map(part => part.trim())
    .filter(Boolean)
}

// The number, then the words that follow it. The noun is not always the next word —
// "identify 30 REAL publications" put an adjective in the way, and reading only the next
// word typed that count as 'unspecified', which is how a publication count could still
// have reached the sales worker. So the following few words are scanned and the first one
// that IS a known subject wins.
const COUNT_LEAD =
  /\b(?:find|get|build|list|source|research|identify|locate|encontr\w*|busca\w*|lista\w*|pesquis\w*|identific\w*|znajd\w*|wyszuk\w*|найд\w*|исслед\w*)\b[^\d]{0,28}(\d{1,3})\b|\b(\d{1,3})\b/i
const NOUN_WINDOW = 4

const COMPANY_NOUNS =
  /^(?:compan(?:y|ies)|businesses|business|firms?|prospects?|leads?|targets?|accounts?|buyers?|customers?|clients?|organizations?|organisations?|empresas?|firmas?|firmy|компани\w*|лид\w*)$/i

const PUBLICATION_NOUNS =
  /^(?:publications?|publishers?|magazines?|newspapers?|journals?|outlets?|media|blogs?|newsletters?|podcasts?|directories|listings?|opportunit(?:y|ies)|revistas?|jornais?|peri[oó]dicos?|gazet\w*|журнал\w*|издани\w*)$/i

function countIn(text: string): CampaignCount | null {
  const match = text.match(COUNT_LEAD)
  if (!match || match.index === undefined) return null
  const value = Number(match[1] ?? match[2] ?? 0)
  if (!Number.isFinite(value) || value <= 0) return null

  const after = text.slice(match.index + match[0].length)
  const words = (after.match(/[a-z\u00c0-\u024f\u0400-\u04ff]+/gi) || [])
    .slice(0, NOUN_WINDOW)
    .map(word => word.toLowerCase())

  for (const word of words) {
    if (COMPANY_NOUNS.test(word)) return { value, subject: 'companies', noun: word }
    if (PUBLICATION_NOUNS.test(word)) return { value, subject: 'publications', noun: word }
  }

  return { value, subject: 'unspecified', noun: words[0] || '' }
}

const PIPELINE_LABEL: Record<CampaignPipeline, string> = {
  prospect: 'sales prospecting',
  press: 'press and media',
  ads: 'paid advertising',
  social: 'social media',
  video: 'video production',
}

/**
 * Classify a brief.
 *
 * Reads prohibitions first, removes the prohibited pipeline from positive evidence, then reads what
 * remains. Returns `not-a-brief` when the message never asked for a campaign at all — the caller
 * must answer it normally rather than reporting a failure at it.
 */
export function classifyCampaignIntent(text: string): CampaignIntentResult {
  const input = String(text || '').slice(0, 12_000)
  const base: CampaignIntentResult = {
    pipeline: null,
    prohibited: [],
    signalled: [],
    count: null,
    decision: 'not-a-brief',
    code: 'INTENT_NOT_A_BRIEF',
    reason: '',
  }
  if (!input.trim()) return base

  const prohibited = new Set<CampaignPipeline>()
  const signalled = new Set<CampaignPipeline>()
  const allowedClauses: string[] = []

  for (const clause of clausesOf(input)) {
    let clauseHasLiveSignal = false
    let clauseHasPipelineProhibition = false

    for (const pipeline of Object.keys(PIPELINE_TERMS) as CampaignPipeline[]) {
      const term = pipelineTermMatch(clause, pipeline)
      if (!term) continue
      if (pipelineIsProhibited(clause, term)) {
        prohibited.add(pipeline)
        clauseHasPipelineProhibition = true
      } else {
        signalled.add(pipeline)
        clauseHasLiveSignal = true
      }
    }

    // Modifier constraints such as "without assuming details" remain ordinary positive text.
    // Clauses that contain both a positive pipeline and a different prohibition also remain usable
    // for typed-count extraction; only the prohibited pipeline itself is removed below.
    if (clauseHasLiveSignal || !clauseHasPipelineProhibition) allowedClauses.push(clause)
  }

  // A pipeline forbidden anywhere is forbidden everywhere in this message. Saying "not a
  // sales campaign" once and using the word "sales" later does not re-authorise it.
  for (const pipeline of prohibited) signalled.delete(pipeline)

  // A VIDEO CAMPAIGN NAMES ITS DESTINATION AND THAT IS NOT A SECOND CAMPAIGN.
  // `social` matches youtube/tiktok/instagram, which are exactly where finished video is
  // published — so "make a video campaign and post it to YouTube" signalled both and would
  // have been refused as asking for two things at once. Video subsumes the channel; the
  // reverse is not true, so a plain social brief still classifies as social.
  if (signalled.has('video')) signalled.delete('social')

  const count = countIn(allowedClauses.join('. ')) || countIn(input)
  const live = [...signalled]
  const forbidden = [...prohibited]

  if (!live.length && !forbidden.length) return { ...base, count }

  if (!live.length) {
    // Everything this brief named, it named in order to forbid it.
    return {
      ...base,
      prohibited: forbidden,
      count,
      decision: 'refuse',
      code: 'INTENT_PROHIBITED',
      reason: `Nothing was started. This message forbids ${forbidden
        .map(item => PIPELINE_LABEL[item])
        .join(' and ')} and does not clearly ask for anything else, so no campaign of any kind was created.`,
    }
  }

  if (live.length > 1) {
    return {
      ...base,
      prohibited: forbidden,
      signalled: live,
      count,
      decision: 'refuse',
      code: 'INTENT_AMBIGUOUS',
      reason: `Nothing was started. This message asks for ${live
        .map(item => PIPELINE_LABEL[item])
        .join(' and ')} at the same time, and these run through different pipelines that contact different people. Send one at a time, or say which to run first.`,
    }
  }

  const pipeline = live[0]

  // A typed count that contradicts the pipeline is a stop, not a detail. "30 publications"
  // reaching the sales worker is precisely the failure this module was written for.
  if (pipeline === 'prospect' && count?.subject === 'publications') {
    return {
      ...base,
      prohibited: forbidden,
      signalled: live,
      count,
      decision: 'refuse',
      code: 'INTENT_AMBIGUOUS',
      reason: `Nothing was started. This reads as sales prospecting but asks for ${count.value} ${count.noun}, which are not companies. Publications are pitched through the press pipeline, never emailed as sales prospects.`,
    }
  }
  if (pipeline === 'video' && count?.subject === 'publications') {
    return {
      ...base,
      prohibited: forbidden,
      signalled: live,
      count,
      decision: 'refuse',
      code: 'INTENT_AMBIGUOUS',
      reason: `Nothing was started. This reads as a video request but asks for ${count.value} ${count.noun}. Video campaigns produce videos; publications are pitched through the press pipeline.`,
    }
  }
  if (pipeline === 'press' && count?.subject === 'companies') {
    return {
      ...base,
      prohibited: forbidden,
      signalled: live,
      count,
      decision: 'refuse',
      code: 'INTENT_AMBIGUOUS',
      reason: `Nothing was started. This reads as a press request but asks for ${count.value} ${count.noun}. Say whether you want publications to pitch or companies to sell to.`,
    }
  }

  return {
    pipeline,
    prohibited: forbidden,
    signalled: live,
    count,
    decision: 'proceed',
    code: 'INTENT_CLEAR',
    reason: `Read as a ${PIPELINE_LABEL[pipeline]} request${
      forbidden.length ? `, with ${forbidden.map(item => PIPELINE_LABEL[item]).join(' and ')} explicitly excluded` : ''
    }.`,
  }
}

/** True only when this exact pipeline is the one the brief asked for. */
export function campaignIntentAllows(
  result: CampaignIntentResult,
  pipeline: CampaignPipeline,
): boolean {
  return result.decision === 'proceed' && result.pipeline === pipeline
}

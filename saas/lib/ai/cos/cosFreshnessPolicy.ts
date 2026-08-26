// saas/lib/ai/cos/cosFreshnessPolicy.ts
// Policy for deciding when pretrained/local knowledge is not sufficient because
// the answer can change without a code or model update.
//
// This classifier is intentionally about EXTERNAL world state. Internal project,
// campaign, calendar, CRM, inventory, workflow, and SignalBoost self-knowledge belong
// to their owning system of record rather than being blindly sent to public web search.

import { classifyTemporalSensitivity } from './temporalClaimGuard.ts'
import { isContentGenerationRequest } from './contentGenerationIntent.ts'
import { isProvenanceIntrospection } from './provenanceIntrospection.ts'
import { englishNormalizedForClassification } from './crossLanguageFreshness.ts'

const DYNAMIC_ROLE_SOURCE = '(?:president|vice president|prime minister|premier|chancellor|governor|mayor|monarch|king|queen|pope|chief executive officer|ceo|chief financial officer|cfo|chief information officer|cio|chief technology officer|cto|chair(?:man|woman)?|secretary of state|attorney general|speaker|minister)'

const TEMPORAL_LIVE_MARKER = /\b(?:current|currently|today|today's|tonight|now|still|latest|live|breaking|recent|recently|newest|updated|right now|at present|as of today|as of now|this morning|this afternoon|this evening|this week|this month|this year)\b/i
const LOOKUP_INTENT = /^\s*(?:who|what|when|where|which|is|are|has|have|did|does|do|can|could|show|give|check|find|tell\s+me|how\s+much|how\s+many)\b/i
const HISTORICAL_ANCHOR = /\b(?:yesterday|last\s+(?:week|month|year)|historical(?:ly)?|formerly|previously|in\s+(?:19|20)\d{2}|as\s+of\s+(?:19|20)\d{2})\b/i
const CONCEPTUAL_OR_CREATIVE = /^\s*(?:explain|describe|define|teach|write|draft|create|design|build|plan|recommend|suggest|how\s+(?:do|does|did|is|are|can|could|would|should)|why\s+(?:do|does|did|is|are|can|could|would|should))\b/i

// A request to validate, endorse, or fact-check a public-world claim is evidence-seeking even when
// the topic is otherwise timeless/conceptual. Model familiarity is not independent verification.
const FACT_CHECK_INTENT = /\b(?:fact[- ]?check|verify|validate|is\s+(?:this|that|it)\s+(?:true|correct|accurate)|is\s+the\s+(?:claim|statement)\s+(?:true|correct|accurate)|are\s+these\s+(?:claims|statements)\s+(?:true|correct|accurate)|do\s+you\s+agree\s+that|can\s+you\s+confirm\s+that|check\s+(?:this|that)\s+(?:claim|statement))\b/i

// Short standalone generalizations about how external actors, products, industries, or systems
// behave are empirical claims, not mere reasoning prompts. Production failure 2026-08-25: COS
// endorsed "Commercial models almost always attempt to answer..." from pretrained knowledge even
// though no independent evidence had been retrieved. Such claims must now be verified live before
// COS agrees/disagrees with them. Personal/internal premises and explicit hypotheticals stay local.
const GENERALIZATION_QUANTIFIER = /\b(?:all|almost\s+all|almost\s+always|most|many|generally|typically|usually|commonly|often|rarely|tend(?:s)?\s+to|by\s+default)\b/i
const EXTERNAL_ACTOR_OR_SYSTEM = /\b(?:commercial|public|industry|industries|company|companies|vendor|vendors|provider|providers|model|models|llm|llms|ai\s+systems?|platform|platforms|product|products|service|services|enterprise|enterprises|organization|organizations|business|businesses|market|markets|software|applications?|systems?)\b/i
const EMPIRICAL_BEHAVIOR = /\b(?:attempt(?:s|ed|ing)?|answer(?:s|ed|ing)?|behav(?:e|es|ed|ing)|prioriti[sz](?:e|es|ed|ing)|reject(?:s|ed|ing)?|allow(?:s|ed|ing)?|use(?:s|d|ing)?|require(?:s|d|ing)?|prefer(?:s|red|ring)?|optimi[sz](?:e|es|ed|ing)|fail(?:s|ed|ing)?|rely|relies|operate(?:s|d|ing)?|respond(?:s|ed|ing)?|produce(?:s|d|ing)?|generate(?:s|d|ing)?|enforce(?:s|d|ing)?|support(?:s|ed|ing)?)\b/i
const FIRST_PERSON_OR_PRIVATE_PREMISE = /\b(?:i|i'm|i\s+am|my|mine|we|we're|we\s+are|our|ours)\b/i
const EXPLICIT_HYPOTHETICAL = /\b(?:hypothetical|hypothetically|scenario|suppose|supposing|assume|assuming|imagine|case\s+study|for\s+example|for\s+instance)\b/i

function looksLikeBareExternalEmpiricalAssertion(text: string): boolean {
  if (!text || text.length > 700) return false
  if (text.includes('?')) return false
  if (FIRST_PERSON_OR_PRIVATE_PREMISE.test(text)) return false
  if (EXPLICIT_HYPOTHETICAL.test(text)) return false
  if (isContentGenerationRequest(text)) return false
  return GENERALIZATION_QUANTIFIER.test(text) && EXTERNAL_ACTOR_OR_SYSTEM.test(text) && EMPIRICAL_BEHAVIOR.test(text)
}

const PRESENT_TENSE_OFFICE_HOLDER = new RegExp(`\\bwho\\s+(?:is|['’]s)\\s+(?:(?:the\\s+)?current(?:ly)?\\s+(?:the\\s+)?|(?:the\\s+)?)${DYNAMIC_ROLE_SOURCE}\\b`, 'i')
const TERSE_CURRENT_OFFICE_HOLDER = new RegExp(`^\\s*(?:current|currently)\\s+${DYNAMIC_ROLE_SOURCE}\\b`, 'i')
const CURRENT_LEADER = /\bwho\s+(?:currently\s+)?(?:leads|heads|runs)\b/i
const ROLE_STATUS_CHECK = new RegExp(`^\\s*(?:is|are)\\s+[^?.!]{1,100}\\b(?:still\\s+)?(?:the\\s+)?${DYNAMIC_ROLE_SOURCE}\\b`, 'i')

// A simple "who is First Last?" request is an entity/reference lookup, not a reasoning task.
// Route it through fresh public evidence so biographies do not silently inherit stale or fabricated
// details from model weights. The determiner/pronoun exclusions keep conceptual and private queries
// ("who is the...", "who is my...") out of this path.
const SIMPLE_NAMED_ENTITY_LOOKUP = /^\s*who\s+(?:is|['’]s)\s+(?!the\b|a\b|an\b|my\b|our\b|your\b|his\b|her\b|their\b|this\b|that\b)(?:[\p{L}\p{M}'’.-]{2,50}\s+){1,4}[\p{L}\p{M}'’.-]{2,50}\s*[?.!]*\s*$/iu

const NEWS_STATE = /\b(?:news|headlines?|breaking news|news updates?)\b/i
const LIVE_NEWS = /\b(?:latest|today(?:'s)?|live|breaking|recent|updated)\s+(?:news|headlines?|updates?)\b/i

// High-frequency public data that should use a structured real-time provider when available.
const WEATHER_STATE = /\b(?:weather|weather forecast|forecast(?:s)?|temperature|rainfall|snowfall|storm warning|hurricane warning)\b/i
const FINANCIAL_STATE = /\b(?:exchange rate|exchange rates|forex rate|forex rates|stock price|stock prices|share price|share prices|crypto price|crypto prices|cryptocurrency price|cryptocurrency prices|market data|market quote|market quotes|stock market|financial market|index value|index values)\b/i
const TICKER_PRICE = /\b[A-Z]{1,6}(?:['’]s)?\s+(?:stock\s+)?price\b/
const CRYPTO_PRICE = /\b(?:bitcoin|btc|ethereum|eth|solana|sol|cryptocurrency|crypto)\b.{0,35}\b(?:price|quote|rate)\b|\b(?:price|quote|rate)\b.{0,35}\b(?:bitcoin|btc|ethereum|eth|solana|sol|cryptocurrency|crypto)\b/i
const SPORTS_STATE = /\b(?:nba|wnba|nfl|mlb|nhl|epl|premier league|ipl|ncaa|sports?|game|match)\b.{0,45}\b(?:score|scores|standings|schedule)\b|\b(?:score|scores|standings)\b.{0,45}\b(?:nba|wnba|nfl|mlb|nhl|epl|premier league|ipl|ncaa|sports?|game|match)\b/i
const TERSE_SPORTS_STATE = /^\s*(?:nba|wnba|nfl|mlb|nhl|epl|premier league|ipl|ncaa)\b.{0,60}\b(?:score|scores|standings|schedule)\b/i

const OUTAGE_STATE = /\b(?:service|network|internet|cloud|website|site|api|platform)\s+(?:status|outage)|\b(?:outage|outages)\b/i
const TRAVEL_STATE = /\b(?:flight status|departure status|arrival status|live traffic|traffic conditions|road conditions)\b/i
const ELECTION_STATE = /\b(?:election result|election results|election returns|vote count|vote counts|polling results?)\b/i
const PUBLIC_RULE_STATE = /\b(?:law|laws|regulation|regulations|government rule|government rules|visa requirement|visa requirements|entry requirement|entry requirements)\b/i
const SOFTWARE_SECURITY_STATE = /\b(?:security advisory|security advisories|cve|vulnerability|vulnerabilities|software release|package release|library release)\b/i
const HIGH_STAKES_SECURITY_RELEASE = /\b(?:zero[- ]day|high[- ]severity\s+vulnerabilit|unauthorized\s+(?:read|access)|tenant\s+(?:metadata|data)|infosec|security\s+lead)\b/i
// A supplied incident scenario asks COS to assess stated facts, not discover a real-world incident.
// Live research is appropriate only when the user asks COS to establish an external fact or supplies
// a concrete identifier (for example a CVE or dependency) that needs verification.
const SECURITY_DECISION_SCENARIO = /\b(?:risk\s+triage|go\s*\/\s*no-?go|go\s+or\s+no-?go|launch\s+(?:decision|recommendation)|t-minus|launch\s+on\s+time)\b/i
const LIFE_STATUS_STATE = /\b(?:die|died|dead|death|alive|passed away|passed on|deceased)\b/i

// Advice about regulated or high-consequence public processes must be verified even when it is
// phrased conversationally, in a language other than English, or does not begin with a lookup word.
// This is a routing boundary only: the live-evidence authority policy still decides whether COS may answer.
const GOVERNED_GUIDANCE_TOPIC = /(?:legal|law|regulation|visa|immigration|tax|taxes|passport|identity card|driver(?:'s)? license|government (?:office|agency)|name change|change(?:d|ing)? (?:my|your|their)? ?(?:name|surname)|surname|benefits|insurance|medical|health|medication|diagnos(?:is|e)|treatment|invest(?:ment|ing)|loan|mortgage|bank(?:ing)?|z[\u0142l]o[\u017cż]y[\u0107c]|urz[\u0105a]d|dokument(?:y|u)?|nazwisk(?:o|a)|dow[oó]d osobisty|paszport|zus|nfz|podat(?:ek|ki)|prawo jazdy|wiza|ubezpieczen(?:ie|ia)|zdrow(?:ie|otny)|lekarz|leczenie|medicament(?:o|os)|impuesto|visado|seguro|salud|m[eé]dico|tratamiento|documentos?|passaporte|imigra[çc][ãa]o|impost(?:o|os)|seguro|sa[uú]de|tratamento|document(?:o|os)|паспор(?:т|та)|документ(?:ы|ов)?|налог(?:и|ов)?|страхов(?:ка|ки)|здоров(?:ье|я)|лечени(?:е|я)|виза)/iu
const GUIDANCE_REQUEST = /(?:[?]|\b(?:what|which|when|where|who|how|should|need|must|can|could|do|does|czy|co|jak|gdzie|kiedy|kt[oó]r|powinn|trzeba|musz|mog[ęe]|debo|puedo|qu[eé]|c[oó]mo|d[oó]nde|cu[aá]ndo|devo|posso|o que|como|onde|quando|долж|нужно|как|что|где|когда|какие|могу)\b)/iu

// Public-web freshness must not hijack private/system-of-record questions just because they contain
// words such as current/latest/still. Temporal adjectives are allowed between the possessive and
// object because real users ask "our current pricing" and "my latest invoice".
const INTERNAL_TEMPORAL_MODIFIER = '(?:(?:current|latest|newest|recent|active|pending|next|last)\\s+)?'
const INTERNAL_OBJECT = '(?:business|company|campaign|inventory|pricing|prices?|plan|subscription|account|invoice|order|team|crm|pipeline|leads?|customers?|metrics?|revenue|mrr|arr|credits?|usage|calendar|website|deployment|project|repository|database|sales|outreach|drafts?)'
const INTERNAL_OPERATIONAL_STATE = new RegExp(
  `\\b(?:my|our)\\s+${INTERNAL_TEMPORAL_MODIFIER}${INTERNAL_OBJECT}\\b|\\b(?:status|results?|availability|schedule)\\s+(?:of|for)\\s+(?:my|our)\\s+${INTERNAL_TEMPORAL_MODIFIER}(?:sales\\s+)?${INTERNAL_OBJECT}\\b`,
  'i',
)


// COS may improve its application code, prompts, retrieval, tools, workflows, and validated
// procedures through governed tests and approved changes. It cannot autonomously retrain or alter
// its provider/base-model weights.
const COS_SELF_IMPROVEMENT = /\b(?:can|could|how\s+(?:can|could|would|should)|what)\b.{0,80}\b(?:cos|yourself|you|your)\b.{0,140}\b(?:improve|learn|reason(?:ing)?|code|train(?:ing)?|model|retrieval|context|skill|procedure|capabilit(?:y|ies))\b|\b(?:improve|learn|reason(?:ing)?|code|train(?:ing)?|model|retrieval|context|skill|procedure|capabilit(?:y|ies))\b.{0,140}\b(?:cos|yourself)\b/i

// SignalBoost/COS self-description and runtime state come from repository/configuration/system-of-record
// evidence, not the public web. This prevents the general external-fact default from breaking
// authoritative internal self-knowledge such as "what model does COS use now?".
const SELF_KNOWLEDGE_TOPIC = '(?:architecture|memory|cache|reasoner|model|provider|routing|retrieval|learning|benchmark|provenance|runpod|supabase|vercel|deployment|capability|knowledge|policy|enterprise memory|semantic cache)'
const INTERNAL_PLATFORM_SELF_KNOWLEDGE = new RegExp(
  `\\b(?:signalboost|cos)\\b.{0,120}\\b${SELF_KNOWLEDGE_TOPIC}\\b|\\b${SELF_KNOWLEDGE_TOPIC}\\b.{0,120}\\b(?:signalboost|cos)\\b`,
  'i',
)

// Company-identity questions ("what is SignalBoost", "who owns SignalBoost") are self-knowledge
// too, but they don't mention any SELF_KNOWLEDGE_TOPIC word above. The first fix (2026-08-24)
// used an anchored whole-message regex; production broke it the very next day with "what OR WHO
// is signalboost and who owns it?" — one extra word and the anchor missed, sending the platform's
// own identity to public web search, which fail-closed. Anchored exact phrasings cannot win this
// game. Scope by MEANING instead: the message names SignalBoost AND asks an identity/ownership/
// leadership/product question about it. The platform is the sole authority on itself — the owner
// channel answers from canonical internal identity (cosMemoryLayerDefinitions.ts), the public
// channel from the public catalog with its not-public-information rule — so no phrasing of this
// question is ever a public-web lookup. Ordinary tasks that merely mention the company are not
// questions and are excluded earlier by the content-generation classifier.
const MENTIONS_SIGNALBOOST = /\bsignalboost\b/i
const IDENTITY_INTERROGATIVE = /(?<![\p{L}\p{N}_])(?:who|what|whom|whose|qui[eé]n(?:es)?|qu[eé]|quem|o\s+que|kto|co|czyj[ae]?|кто|что|чей|чья)(?![\p{L}\p{N}_])/iu
const IDENTITY_SUBJECT = /(?<![\p{L}\p{N}_])(?:is|are|owns?|owned|owner(?:s)?|founder(?:s)?|founded|created|built|runs?|behind|about|company|startup|business|platform|product(?:s)?|does|ceo|leadership|es|son|due[nñ]o|fundador(?:a|es)?|empresa|[eé]|s[aã]o|dono|jest|w[lł]a[sś]ciciel(?:em)?|firma|это|владелец|владельц[аеу]|компани[яию]|основа[лт]|созда[лт])(?![\p{L}\p{N}_])/iu

function isSignalboostIdentityQuestion(text: string): boolean {
  if (!MENTIONS_SIGNALBOOST.test(text)) return false
  return IDENTITY_INTERROGATIVE.test(text) && IDENTITY_SUBJECT.test(text)
}

/**
 * Platform self-knowledge prompts — SignalBoost identity/ownership questions and questions about
 * COS's own architecture, model, or configuration. Exported for the cache safety policy: these
 * answers depend on live configuration (which model, which host, current policy) and on the
 * caller's privilege, so a cached replay can serve yesterday's stack or the wrong disclosure
 * tier. They must be reasoned afresh every turn (owner-verified 2026-08-25: the privileged
 * technical self-description shipped, but repeated identity questions kept replaying the
 * pre-change cached answer, so the owner never saw it).
 */
export function isPlatformSelfKnowledgePrompt(input: string): boolean {
  const text = normalizedText(input)
  if (!text) return false
  return isSignalboostIdentityQuestion(text) || INTERNAL_PLATFORM_SELF_KNOWLEDGE.test(text)
}

// Pure arithmetic and local clock/date questions have deterministic utilities. They should never
// consume a public search merely because they begin with "what".
const LOCAL_ARITHMETIC = /^\s*(?:what\s+is\s+)?[\d\s()+\-*/%.^=]+[?!.]*\s*$/i
const LOCAL_CLOCK_OR_DATE = /^\s*(?:what(?:'s|\s+is)?\s+)?(?:the\s+)?(?:current\s+)?(?:date|time|day)(?:\s+(?:today|now|is\s+it))?\s*[?!.]*\s*$/i

function normalizedText(input: string): string {
  return englishNormalizedForClassification(String(input || '')).replace(/\s+/g, ' ').trim()
}

function isDirectOrTerseLookup(text: string, state: RegExp): boolean {
  if (!state.test(text)) return false
  if (LOOKUP_INTENT.test(text)) return true
  return !/[.!]\s+\w/.test(text) && text.split(/\s+/).length <= 12
}

function looksLikeInternalOperationalState(text: string): boolean {
  return INTERNAL_OPERATIONAL_STATE.test(text) || COS_SELF_IMPROVEMENT.test(text) || INTERNAL_PLATFORM_SELF_KNOWLEDGE.test(text) || isSignalboostIdentityQuestion(text)
}

function isLocalDeterministicUtility(text: string): boolean {
  return LOCAL_ARITHMETIC.test(text) || LOCAL_CLOCK_OR_DATE.test(text)
}


function isGovernedPublicGuidance(text: string): boolean {
  return GOVERNED_GUIDANCE_TOPIC.test(text) && GUIDANCE_REQUEST.test(text)
}

export type StructuredLiveDataKind = 'weather' | 'financial' | 'sports'

/**
 * Identifies external high-frequency values for which ordinary web snippets are not an adequate
 * source of truth. Callers should use a structured real-time provider and fail closed if that
 * provider cannot return current data; they must not silently fall back to model memory.
 */
export function structuredLiveDataKind(input: string): StructuredLiveDataKind | null {
  const text = normalizedText(input)
  if (!text || HISTORICAL_ANCHOR.test(text) || CONCEPTUAL_OR_CREATIVE.test(text) || looksLikeInternalOperationalState(text) || isLocalDeterministicUtility(text)) return null

  if (isDirectOrTerseLookup(text, WEATHER_STATE)) return 'weather'
  if (isDirectOrTerseLookup(text, FINANCIAL_STATE) || TICKER_PRICE.test(text) || isDirectOrTerseLookup(text, CRYPTO_PRICE)) return 'financial'
  if (TERSE_SPORTS_STATE.test(text) || (LOOKUP_INTENT.test(text) && SPORTS_STATE.test(text))) return 'sports'
  return null
}

/**
 * Returns true when the request depends on EXTERNAL world facts that should be verified against
 * current evidence rather than assumed from frozen model weights or durable memory.
 *
 * GENERAL DEFAULT: a direct factual lookup about the external world is live-verify-by-default even
 * when the user does not say "current", "latest", or "today". That is the key stale-world guard:
 * "What is Poland's population?", "Where is Company X headquartered?", "Who owns Brand Y?", and
 * "Tell me about Person Z" all get current evidence before COS answers.
 *
 * A short standalone empirical generalization is also live-verify-by-default when COS would
 * otherwise be implicitly asked to endorse it. This prevents pretrained familiarity from being
 * presented as independent confirmation of statements about how external models, companies,
 * industries, platforms, or systems generally behave.
 *
 * Explicit exclusions remain for historical questions, conceptual/creative reasoning, local
 * deterministic utilities, private/internal system-of-record state, and supplied hypotheticals.
 *
 * Hard rule: a positive result means model pretraining, local reasoning, durable memory,
 * semantic/exact cache, and prior conversation facts are NOT permitted to establish the answer.
 * COS must retrieve fresh external evidence on this turn, or fail closed if it cannot verify it.
 */
export function requiresFreshExternalEvidence(input: string): boolean {
  const text = normalizedText(input)
  if (!text) return false
  if (HISTORICAL_ANCHOR.test(text)) return false
  if (looksLikeInternalOperationalState(text)) return false
  if (isLocalDeterministicUtility(text)) return false
  if (HIGH_STAKES_SECURITY_RELEASE.test(text) && !SECURITY_DECISION_SCENARIO.test(text)) return true
  if (isContentGenerationRequest(text)) return false

  // A question about COS's OWN previous answer is never a public-web lookup. This is a structural
  // safeguard, not a duplicate of the introspection routing: when the introspection classifier
  // misses (a typo like "the answert from", a phrasing nobody anticipated), the question used to
  // fall through to live search — and on 2026-08-23 COS answered "where did you get the answer
  // from?" using retrieved pages about E-Verify and FAFSA verification, because it searched the
  // web for the word "verification". Failing to recognize introspection should degrade to a plain
  // answer, never to confidently citing unrelated sources as the origin of its own reasoning.
  if (isProvenanceIntrospection(text)) return false

  // Explicit fact-checking and bare generalized empirical claims require independent evidence even
  // when they are not volatile. This is about truth-status, not freshness alone: COS may reason
  // from model knowledge, but it may not present that knowledge as verification.
  if (FACT_CHECK_INTENT.test(text)) return true
  if (looksLikeBareExternalEmpiricalAssertion(text)) return true

  // High-stakes guidance is never answered from model memory. This occurs before the
  // conceptual/creative exclusion because questions such as "what should I do after changing my name?"
  // are actionable public-administration guidance, not timeless advice.
  if (isGovernedPublicGuidance(text)) return true

  if (SIMPLE_NAMED_ENTITY_LOOKUP.test(text)) return true

  // Shared temporal classifier: life/death, current holders, "still" status, latest/current mutable
  // state, current rules/security state, and recent events. Domain-specific checks below remain as
  // additional safeguards for terse lookups without explicit temporal wording.
  if (classifyTemporalSensitivity(text).sensitive) return true

  if (PRESENT_TENSE_OFFICE_HOLDER.test(text)) return true
  if (TERSE_CURRENT_OFFICE_HOLDER.test(text)) return true
  if (CURRENT_LEADER.test(text)) return true
  if (ROLE_STATUS_CHECK.test(text)) return true

  if (LIVE_NEWS.test(text)) return true
  if (LOOKUP_INTENT.test(text) && NEWS_STATE.test(text) && TEMPORAL_LIVE_MARKER.test(text)) return true

  if (CONCEPTUAL_OR_CREATIVE.test(text)) return false

  if (structuredLiveDataKind(text)) return true
  if (LOOKUP_INTENT.test(text) && OUTAGE_STATE.test(text)) return true
  if (isDirectOrTerseLookup(text, TRAVEL_STATE)) return true
  if (isDirectOrTerseLookup(text, ELECTION_STATE)) return true

  if (LOOKUP_INTENT.test(text) && PUBLIC_RULE_STATE.test(text)) return true
  if (LOOKUP_INTENT.test(text) && SOFTWARE_SECURITY_STATE.test(text) && TEMPORAL_LIVE_MARKER.test(text)) return true
  if (LOOKUP_INTENT.test(text) && LIFE_STATUS_STATE.test(text)) return true

  // General stale-world protection: any remaining direct external factual lookup is verified live by
  // default. It is intentionally last so internal, historical, conceptual, and deterministic
  // requests keep their correct specialized routes.
  if (LOOKUP_INTENT.test(text)) return true

  return false
}

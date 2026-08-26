// saas/lib/ai/cos/publicDisclosureGate.ts
//
// COS MUST NOT HAND COMPANY INTERNALS TO THE PUBLIC CHANNEL.
//
// Owner-directed architecture (2026-08-26): COS is the only reasoner, the Concierge is a passive
// renderer, and the boundary is enforced AT COS. A renderer that filters is one filter miss away
// from a leak; a reasoner whose output was never allowed to contain internals has nothing to
// leak. This module is that enforcement — the last check before a public-scope answer is
// released.
//
// It is deliberately SEPARATE from publicScenarioScope.ts, which solves a different problem and
// has a disqualifying property for this one: it returns no violations at all when the request is
// SignalBoost-specific. That is correct for its job (stopping catalog context bleeding into
// unrelated third-party scenarios) and exactly wrong here, because "what model powers COS?" IS a
// SignalBoost-specific request and is the highest-risk question a visitor can ask. This gate
// applies to every public answer regardless of subject.
//
// FALSE POSITIVES ARE THE REAL DESIGN PROBLEM. A public visitor may legitimately ask about
// mixture-of-experts models, knowledge graphs, or semantic caching as general technical topics,
// and answering those is not a leak. So the rule is not "this word appeared" — it is:
//
//   TIER A  unambiguous internal identifiers. No legitimate general answer contains these, so
//           they are violations wherever they appear: infrastructure vendor names we run on,
//           environment variable names, table names, project identifiers, internal evidence
//           citation labels, and the provenance funnel notation.
//
//   TIER B  terms that are only a leak when SELF-ATTRIBUTED. A model family name, an internal
//           component name, or a confidence value is a violation when it appears near a
//           self-reference ("COS runs on...", "my underlying model is...", "powered by..."),
//           and is ordinary technical content otherwise.
//
// Zero imports, pure functions, so the rule is unit-testable without the reasoner.

export type PublicDisclosureViolation =
  | 'infrastructure_identifier'
  | 'internal_identifier'
  | 'evidence_label'
  | 'provenance_funnel'
  | 'model_self_attribution'
  | 'internal_component_self_attribution'
  | 'internal_metric_self_attribution'

/** How far from a self-reference a Tier B term still counts as self-attributed. */
const SELF_ATTRIBUTION_WINDOW = 220

// ---------------------------------------------------------------------------------------------
// TIER A — always a violation
// ---------------------------------------------------------------------------------------------

/** Hosts and platforms this deployment actually runs on. Naming them is naming our stack. */
const INFRASTRUCTURE_IDENTIFIER =
  /(?<![\p{L}\p{N}_])(?:deepinfra|runpod|together\.ai|fireworks\.ai|groq\b|supabase|vercel)(?![\p{L}\p{N}_])/iu

/** Environment variables, table names, internal routes, project refs. */
const INTERNAL_IDENTIFIER =
  /(?<![\p{L}\p{N}_])(?:COS_[A-Z_]+|LOCAL_AI_[A-Z_]+|cos_[a-z_]+_queue|cos-primary|cos_campaign|agent-gateway|portable-license|\/api\/(?:cos-primary|concierge|support)|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?![\p{L}\p{N}_])/iu

/** Internal evidence citation labels. These only exist inside our prompts. */
const EVIDENCE_LABEL = /\[(?:CL|KG|OEM|EM|SK)\s*#?\s*\d*\]/i

/** The provenance funnel notation, e.g. "40 retrieved -> 0 relevant -> 0 selected". */
const PROVENANCE_FUNNEL =
  /\d+\s*(?:retrieved|selected|injected|cited)\s*(?:→|->|>)\s*\d+|(?<![\p{L}\p{N}_])(?:retrieved\s*→|relevant\s*→|selected\s*→|injected\s*→)/iu

// ---------------------------------------------------------------------------------------------
// TIER B — a violation only when self-attributed
// ---------------------------------------------------------------------------------------------

/**
 * Phrases in which the answer is describing ITSELF or the product, rather than the world.
 * A Tier B term inside the window around one of these is a disclosure.
 */
const SELF_REFERENCE =
  /(?<![\p{L}\p{N}_])(?:powered\s+by|runs?\s+on|running\s+on|built\s+on|based\s+on\s+the\s+model|my\s+(?:model|reasoner|underlying|architecture|training|confidence)|I\s+(?:am|use|run|was\s+trained|rely)|(?:the\s+)?underlying\s+(?:model|engine|reasoner)|this\s+(?:assistant|system|concierge|service)\s+(?:uses|is|runs)|COS\s+(?:uses|runs|is\s+powered|relies)|concierge\s+(?:uses|runs|is\s+powered))(?![\p{L}\p{N}_])/iu

/** Model families and weight-class descriptors. Ordinary topics until self-attributed. */
const MODEL_TERM =
  /(?<![\p{L}\p{N}_])(?:qwen|llama|mistral|mixtral|deepseek|gemma|phi-\d|gpt-[\d.]+|chatgpt|claude|anthropic|openai|google|gemini|bard|deepmind|meta\s+ai|microsoft|cohere|xai|grok|open-weight|large\s+language\s+model|trained\s+by|\d+\s*b\s*[-–]?\s*a\d+\s*b|\d{2,3}b\s+parameter|mixture[-\s]of[-\s]experts|moe)(?![\p{L}\p{N}_])/iu

/** Internal subsystem names. "Knowledge graph" is a real general term — hence Tier B. */
const INTERNAL_COMPONENT =
  /(?<![\p{L}\p{N}_])(?:enterprise\s+memory|knowledge\s+graph|learned\s+corpus|semantic\s+cache|cognitive\s+skills|user\s+memory|provenance\s+record|release\s+gate|escalation\s+threshold|external\s+(?:ai\s+)?fallback|failed\s+closed|fail\s+closed)(?![\p{L}\p{N}_])/iu

/** Internal scoring. A bare number is fine; "my confidence is 0.78" is not. */
const INTERNAL_METRIC =
  /(?<![\p{L}\p{N}_])(?:confidence\s+(?:score\s+)?(?:of\s+)?0?\.\d+|threshold\s+(?:of\s+)?0?\.\d+|confidence\s+threshold|token\s+ceiling|max[_\s]?tokens)(?![\p{L}\p{N}_])/iu

function selfAttributedWindows(answer: string): string[] {
  const windows: string[] = []
  const finder = new RegExp(SELF_REFERENCE.source, 'giu')
  let match: RegExpExecArray | null
  while ((match = finder.exec(answer)) !== null) {
    const start = Math.max(0, match.index - SELF_ATTRIBUTION_WINDOW)
    const end = Math.min(answer.length, match.index + match[0].length + SELF_ATTRIBUTION_WINDOW)
    windows.push(answer.slice(start, end))
    if (finder.lastIndex === match.index) finder.lastIndex += 1
  }
  return windows
}

/**
 * Internal disclosures present in a public-scope answer. Empty array means the answer is safe to
 * render publicly. Applies to every public answer, on every subject.
 */
export function publicDisclosureViolations(answer: string): PublicDisclosureViolation[] {
  const value = String(answer ?? '')
  if (!value.trim()) return []
  const violations: PublicDisclosureViolation[] = []

  if (INFRASTRUCTURE_IDENTIFIER.test(value)) violations.push('infrastructure_identifier')
  if (INTERNAL_IDENTIFIER.test(value)) violations.push('internal_identifier')
  if (EVIDENCE_LABEL.test(value)) violations.push('evidence_label')
  if (PROVENANCE_FUNNEL.test(value)) violations.push('provenance_funnel')

  const windows = selfAttributedWindows(value)
  if (windows.length) {
    if (windows.some(window => MODEL_TERM.test(window))) {
      violations.push('model_self_attribution')
    }
    if (windows.some(window => INTERNAL_COMPONENT.test(window))) {
      violations.push('internal_component_self_attribution')
    }
    if (windows.some(window => INTERNAL_METRIC.test(window))) {
      violations.push('internal_metric_self_attribution')
    }
  }

  return violations
}

/** True when the answer may be released on a public surface as written. */
export function isPublicReleasable(answer: string): boolean {
  return publicDisclosureViolations(answer).length === 0
}

// ---------------------------------------------------------------------------------------------
// The reply for "what powers you?"
// ---------------------------------------------------------------------------------------------
//
// When a visitor asks what model, provider or stack runs this service, the honest public answer
// is a short statement that implementation details are not published — NOT an outage message.
// Before this existed, the redaction pass could not clear such a draft, the turn failed closed
// with no reply, and the route surfaced its generic "COS is temporarily unavailable" string
// (verified in production 2026-08-26). A visitor read "broken" when the truth was "not public",
// which is both misleading and a worse impression than the honest boundary.

/** Asks what model, provider, or technology runs this service. */
const ASKS_WHAT_POWERS_IT =
  /(?<![\p{L}\p{N}_])(?:(?:what|which|who)\s+(?:\w+\s+){0,2}(?:model|llm|ai|engine|reasoner|provider|technology|stack|company)\b[^?.!]{0,40}(?:powers?|runs?|drives?|backs?|behind|built\s+on|based\s+on|do\s+you\s+use|are\s+you\s+(?:using|built))|what\s+are\s+you\s+(?:built|running|based)\s+on|what(?:'s| is)\s+under\s+the\s+hood|how\s+are\s+you\s+built|are\s+you\s+(?:chatgpt|gpt|claude|gemini|llama)|qu[eé]\s+modelo|qu[eé]\s+tecnolog[ií]a\s+(?:usa|impulsa)|que\s+modelo|qual\s+(?:modelo|tecnologia)|jaki\s+model|na\s+czym\s+(?:jesteś|dzia[łl]asz)|как(?:ая|ой)\s+(?:модель|технолог)|на\s+чём\s+(?:ты\s+)?(?:работаешь|построен))(?![\p{L}\p{N}_])/iu

/** True when the request itself is asking what runs this service. */
export function asksWhatPowersTheService(prompt: string): boolean {
  return ASKS_WHAT_POWERS_IT.test(String(prompt ?? ''))
}

const IMPLEMENTATION_REPLY: Record<string, string> = {
  en: 'COS is SignalBoost\'s own reasoning layer, and it is what answers you here. I do not publish the underlying model, provider, or infrastructure details on this channel. Ask me anything else and I will answer it directly.',
  es: 'COS es la capa de razonamiento propia de SignalBoost, y es la que te responde aquí. No publico detalles del modelo, del proveedor ni de la infraestructura en este canal. Pregúntame cualquier otra cosa y te respondo directamente.',
  pt: 'O COS é a camada de raciocínio própria da SignalBoost e é ela que responde aqui. Não divulgo detalhes do modelo, do fornecedor ou da infraestrutura neste canal. Pergunte-me qualquer outra coisa e respondo diretamente.',
  pl: 'COS to własna warstwa rozumowania SignalBoost i to ona tutaj odpowiada. Nie ujawniam na tym kanale szczegółów modelu, dostawcy ani infrastruktury. Zapytaj o cokolwiek innego, a odpowiem wprost.',
  ru: 'COS — собственный слой рассуждений SignalBoost, и именно он отвечает вам здесь. Я не раскрываю на этом канале сведения о модели, поставщике или инфраструктуре. Спросите о чём угодно другом, и я отвечу прямо.',
}

/**
 * The public answer to "what powers you?". Names nothing, states the boundary plainly, and
 * invites the reader onward. Passes publicDisclosureViolations() by construction — a test pins
 * that, because a reply that itself tripped the gate would loop.
 */
export function publicImplementationDisclosureReply(language?: string | null): string {
  const code = String(language ?? 'en').trim().slice(0, 2).toLowerCase()
  return IMPLEMENTATION_REPLY[code] ?? IMPLEMENTATION_REPLY.en
}

// ---------------------------------------------------------------------------------------------
// Self-identity questions are answered deterministically, never by the model
// ---------------------------------------------------------------------------------------------
//
// Production failure, 2026-08-26: asked "What model powers COS?" the public channel replied
// "I am a large language model, trained by Google." That is not a leak — it is a FALSE statement
// about the product, recited from the base model's memorized identity text. It is wrong twice
// (the model is not Google's, and COS is SignalBoost's own layer), and a visitor reading it
// concludes SignalBoost is a wrapper around someone else's assistant.
//
// The post-hoc disclosure gate could not have saved this: catching it depends on a term list
// being complete, and a list of every AI vendor a base model might name itself after never is.
// The term list is widened below anyway, as a backstop.
//
// The real fix is that this question must not reach the model at all. It has exactly ONE correct
// answer, known at build time, so the public path answers it deterministically before inference.
// That also covers the whole family — who made you, who trained you, are you ChatGPT — which the
// base model would otherwise answer from whatever it remembers about itself.

/** Asks who or what built, trained, owns, or runs this service. */
const ASKS_SERVICE_IDENTITY =
  /(?<![\p{L}\p{N}_])(?:who\s+(?:made|built|created|trained|owns|develop(?:ed|s))\s+(?:you|cos|this)|are\s+you\s+(?:chatgpt|gpt|claude|gemini|bard|llama|an?\s+(?:openai|google|anthropic|meta)\b)|what\s+(?:kind\s+of\s+)?(?:ai|assistant|bot|llm|model)\s+are\s+you|which\s+company\s+(?:made|owns|built|runs)\s+(?:you|this|cos|the\s+(?:service|assistant|system))|qui[eé]n\s+(?:te\s+)?(?:cre[oó]|hizo|entren[oó])|quem\s+(?:te\s+)?(?:criou|treinou)|kto\s+(?:ci[ęe]\s+)?(?:stworzy|zbudowa|napisa)\p{L}*|кто\s+(?:тебя\s+)?(?:созда|обучи|сдела|разработа)\p{L}*)(?![\p{L}\p{N}_])/iu

/**
 * True for any question about what this service is, who built it, or what runs it.
 * The public path must answer these from publicImplementationDisclosureReply() BEFORE calling
 * the reasoner — never by inspecting what the reasoner produced.
 */
export function asksAboutServiceIdentity(prompt: string): boolean {
  const value = String(prompt ?? '')
  return asksWhatPowersTheService(value) || ASKS_SERVICE_IDENTITY.test(value)
}

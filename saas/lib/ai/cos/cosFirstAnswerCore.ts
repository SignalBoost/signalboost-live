// saas/lib/ai/cos/cosFirstAnswerCore.ts
// Compatibility entrypoint. Ordinary COS reasoning remains in cosFirstAnswerEnterprise.
// Volatile/current facts are intercepted here and MUST be re-verified live on every request before
// any model is allowed to answer. No answer cache, Knowledge Graph, learned corpus, Enterprise
// Memory, user memory, or pretrained/model memory is authoritative for this path.

import { callCosReasoner, resolveCosReasoner } from './cosReasoner.ts'
import { requiresFreshExternalEvidence } from './cosFreshnessPolicy.ts'
import { classifyCosSemanticTaskIntent, semanticIntentRequiresFreshness, semanticIntentSuppressesFreshness } from './cosSemanticTaskIntent.ts'
import { mayBeNonEnglish } from './crossLanguageFreshness.ts'
import { turnDeadlineRemainingMs } from './cosTurnBudget.ts'
import { classifyKnowledgeAccess } from './knowledgeAccessPolicy.ts'
import { extractSambaSchoolNames, isNamedCatalogListRequest, isPublicPageExtractionCatalogRequest } from './listCatalogIntent.ts'
import { buildHonestRefusalReply } from './honestRefusalReply.ts'
import { isPlatformSelfKnowledgePrompt } from './cosFreshnessPolicy.ts'
import { currentPlatformModelTopology } from './platformIdentityContext.ts'
import { tryDirectTextTransformation } from './directTextTransformation.ts'
import {
  FRESH_SEARCH_RESULT_BUDGET,
  FRESH_SELECTED_EVIDENCE_BUDGET,
  freshEvidenceGroundingBlock,
  freshEvidenceMeetsAuthority,
  freshEvidenceSearchQuery,
  freshEvidenceSearchQueries,
  constructEconomicFactsReply,
  prepareFreshEvidenceAcrossQueries,
  resolveDeterministicFreshOfficeHolder,
  type FreshEvidenceSource,
} from './cosFreshGrounding.ts'
import { parseLocalResult } from './reasonerOutput.ts'
import { generateLocalEmbedding } from './localEmbeddings.ts'
import { classifyRunpodFailure, runpodCapacityUnavailableReason } from './runpodCapacityError.ts'
import { configuredRunpodPodId } from './runpodConfig.ts'
import {
  answerFreshnessSignals,
  answerNeedsFreshnessReflection,
  stripUnsupportedCurrentClaimSentences,
} from './answerFreshnessSelfReflection.ts'
import { recordCosTurnExperience } from '@/lib/ai/cos/cognitiveTurnExperience'
import { beginEvidenceSourceUseTurn, peekEvidenceSourceUseTurnId } from '@/lib/ai/cos/evidenceSourceUseTurnContext'
import { getExternalInfo, formatExternalInfoForAI } from '@/lib/ai/tools/getExternalInfo'
import { readPublicPages } from '@/lib/ai/tools/publicWebAgent'
import { deepenClaimResearch } from './cosClaimResearch.ts'
import { ensureLocalInferenceRuntimeReady } from '@/lib/ai/local-inference'
import { isPublicDeliveryScope } from '@/lib/auth/publicDeliveryScope'
import { QUANTITATIVE_ANSWER_POLICY } from './cosAnswerPolicyCore.ts'
import { resolveCalcMarkers } from './calcExpressions.ts'

/**
 * Substitute every [[calc: ...]] marker with its server-computed value, immediately after parsing
 * and before any gate, cache write or release inspects the text. Downstream logic must never see
 * marker syntax, and the reader must never see the model's own arithmetic.
 */
function withComputedArithmetic<T extends { answer: string } | null>(parsed: T): T {
  if (!parsed) return parsed
  const resolved = resolveCalcMarkers(parsed.answer)
  if (resolved.failed.length) {
    console.warn('cosFirstAnswer: calc marker could not be evaluated', { failed: resolved.failed })
  }
  if (resolved.evaluated === 0 && resolved.failed.length === 0) return parsed
  return { ...parsed, answer: resolved.text }
}

import { publicDisclosureViolations, asksAboutServiceIdentity, publicImplementationDisclosureReply } from './publicDisclosureGate.ts'
import { publicScenarioScopeViolations, publicUserRequestText } from './publicScenarioScope.ts'
import {
  tryCOSFirstAnswer as tryEnterpriseCOSFirstAnswer,
  type COSFirstAnswerResult,
} from './cosFirstAnswerEnterprise.ts'

export * from './cosFirstAnswerEnterprise.ts'


const PLATFORM_STACK_ASK = /(?:model|modelo|llm|reasoner|engine|provedor|provider).{0,50}(?:platform|plataforma|this service|este servi[cç]o|cos|signalboost|you use|voc[eê] usa)|(?:platform|plataforma|this service|este servi[cç]o|cos).{0,50}(?:model|modelo|llm|reasoner)/i

function isPlatformStackQuestion(prompt: unknown): boolean {
  const text = String(prompt ?? '')
  return isPlatformSelfKnowledgePrompt(text) || PLATFORM_STACK_ASK.test(text)
}

function ownerPlatformStackReply(language?: string | null): string {
  const topology = currentPlatformModelTopology()
  const value = (configured: string | null, variable: string) => configured || `NOT CONFIGURED (${variable})`
  const primaryProvider = value(topology.primaryComputeProvider, 'RUNPOD_API_KEY + RUNPOD_PRIMARY_POD_ID/RUNPOD_POD_ID')
  const primaryModel = value(topology.preferredPrimaryReasonerModel, 'RUNPOD_PRIMARY_MODEL')
  const fallbackProvider = value(topology.managedProvider, 'LOCAL_AI_MANAGED_PROVIDER')
  const fallbackModel = value(topology.fallbackReasonerModel, 'LOCAL_AI_MODEL')
  const builderPrimary = value(topology.builderPrimaryModel, 'RUNPOD_PRIMARY_BUILDER_MODEL or RUNPOD_PRIMARY_MODEL')
  const builderFallback = value(topology.builderCodingModel, 'DEEPINFRA_BUILDER_MODEL')
  const embedding = value(topology.embeddingModel, 'LOCAL_AI_EMBEDDING_MODEL')
  const code = String(language ?? 'en').slice(0, 2).toLowerCase()

  const facts = [
    `Primary COS compute: ${primaryProvider}`,
    `Primary reasoning model: ${primaryModel}`,
    `Managed fallback: ${fallbackProvider} / ${fallbackModel}`,
    `Builder primary model: ${builderPrimary}`,
    `Builder fallback model: ${builderFallback}`,
    `Embedding model: ${embedding}`,
  ]
  const note = 'These values come directly from the current runtime configuration. Hardware and context-window details are not asserted unless separately configured.'

  if (code === 'pt') return ['Canal do proprietário — configuração atual:', ...facts, note].join('\n')
  if (code === 'es') return ['Canal del propietario — configuración actual:', ...facts, note].join('\n')
  if (code === 'pl') return ['Kanał właściciela — bieżąca konfiguracja:', ...facts, note].join('\n')
  if (code === 'ru') return ['Канал владельца — текущая конфигурация:', ...facts, note].join('\n')
  if (code === 'de') return ['Eigentümerkanal — aktuelle Laufzeitkonfiguration:', ...facts, note].join('\n')
  if (code === 'fr') return ['Canal du propriétaire — configuration d’exécution actuelle :', ...facts, note].join('\n')
  if (code === 'it') return ['Canale del proprietario — configurazione di runtime attuale:', ...facts, note].join('\n')
  if (code === 'ja') return ['オーナーチャネル — 現在のランタイム構成：', ...facts, note].join('\n')
  if (code === 'ko') return ['소유자 채널 — 현재 런타임 구성:', ...facts, note].join('\n')
  if (code === 'ar') return ['قناة المالك — إعدادات التشغيل الحالية:', ...facts, note].join('\n')
  return ['Owner channel — current runtime configuration:', ...facts, note].join('\n')
}

function confidenceThreshold(): number {
  const value = Number(process.env.COS_LOCAL_CONFIDENCE_THRESHOLD || '0.72')
  return Number.isFinite(value) ? Math.max(0.5, Math.min(0.98, value)) : 0.72
}

function emptyStage() {
  return { retrieved: 0, relevant: 0, selected: 0, injected: 0, cited: 0 }
}

function freshVerificationUnavailable(language = 'en'): string {
  if (language === 'es') return 'No pude verificar este dato actual con suficientes fuentes independientes y autorizadas. No voy a adivinar ni usar un modelo externo para sustituir evidencia que falta.'
  if (language === 'pt') return 'Não consegui verificar este fato atual com fontes independentes e autorizadas suficientes. Não vou adivinhar nem usar um modelo externo para substituir evidência ausente.'
  if (language === 'pl') return 'Nie udało mi się zweryfikować tego aktualnego faktu w wystarczającej liczbie niezależnych i autorytatywnych źródeł. Nie będę zgadywać ani używać zewnętrznego modelu zamiast brakujących dowodów.'
  if (language === 'ru') return 'Мне не удалось подтвердить этот текущий факт достаточным числом независимых авторитетных источников. Я не буду угадывать или использовать внешнюю модель вместо отсутствующих доказательств.'
  if (language === 'de') return 'Ich konnte diesen aktuellen Sachverhalt nicht anhand ausreichend vieler unabhängiger, maßgeblicher Live-Quellen überprüfen. Ich werde nicht raten und kein externes Modell als Ersatz für fehlende Belege verwenden.'
  if (language === 'fr') return 'Je n’ai pas pu vérifier ce fait actuel à partir de suffisamment de sources indépendantes et faisant autorité. Je ne vais pas deviner ni utiliser un modèle externe pour remplacer des preuves manquantes.'
  if (language === 'it') return 'Non sono riuscito a verificare questo fatto attuale con un numero sufficiente di fonti indipendenti e autorevoli. Non tirerò a indovinare né userò un modello esterno al posto delle prove mancanti.'
  if (language === 'ja') return 'この最新の事実を、十分な数の独立した信頼できるリアルタイムの情報源で検証できませんでした。推測したり、不足している根拠の代わりに外部モデルを使用したりすることはしません。'
  if (language === 'ko') return '이 최신 사실을 충분한 수의 독립적이고 신뢰할 수 있는 실시간 출처로 검증할 수 없었습니다. 추측하거나 부족한 근거를 대신해 외부 모델을 사용하지 않겠습니다.'
  if (language === 'ar') return 'لم أتمكن من التحقق من هذه الحقيقة الحالية من خلال عدد كافٍ من المصادر المباشرة المستقلة والموثوقة. لن أخمّن ولن أستخدم نموذجًا خارجيًا بديلًا عن الأدلة المفقودة.'
  return 'I could not verify this current fact from enough independent authoritative live sources. I will not guess or use an external model as a substitute for missing evidence.'
}

function freshProvenance(args: {
  reasonerLabel: string | null
  localModelInvoked: boolean
  retrievedAt: string
  sources: FreshEvidenceSource[]
  documentsAcquired?: number
  responseSource?: string
  deterministicResolverUsed?: boolean
  externalAiNecessary?: boolean
  escalationReasonCode?: string | null
  escalationReason?: string | null
  evidenceBudget?: Record<string, unknown>
}) {
  return {
    responseSource: args.responseSource ?? (args.localModelInvoked ? 'local_cos_reasoning' : 'external_fallback_required'),
    externalAiInvoked: false as const,
    externalAiNecessary: args.externalAiNecessary === true,
    escalationReasonCode: args.escalationReasonCode ?? null,
    escalationReason: args.escalationReason ?? null,
    deterministicFreshFactUsed: args.deterministicResolverUsed === true,
    evidenceBudget: args.evidenceBudget ?? null,
    localModelInvoked: args.localModelInvoked,
    reasonerLabel: args.reasonerLabel,
    internalSystemsConsulted: ['Freshness Policy', 'Live Web Search', ...(args.deterministicResolverUsed ? ['Deterministic Authoritative Resolver'] : []), ...(args.localModelInvoked ? ['Independent Local Reasoner'] : [])],
    knowledgeFactsUsed: 0,
    learnedItemsUsed: 0,
    enterpriseMemoriesUsed: 0,
    userMemoriesUsed: 0,
    cognitiveSkillsUsed: 0,
    enterpriseMemoryStatus: 'not_consulted_live_current_fact',
    enterpriseMemoryOrganizationId: null,
    evidenceFunnel: {
      knowledgeGraph: emptyStage(),
      learnedCorpus: emptyStage(),
      enterpriseMemory: emptyStage(),
      userMemory: emptyStage(),
    },
    cognitiveSkillFunnel: emptyStage(),
    knowledgeFactsCited: 0,
    learnedItemsCited: 0,
    enterpriseMemoriesCited: 0,
    userMemoriesCited: 0,
    cognitiveSkillsCited: 0,
    autonomousResearchAttempted: true,
    researchDocumentsAcquired: args.documentsAcquired ?? args.sources.length,
    knowledgeNewlyRetained: 0,
    liveExternalEvidence: {
      retrievedAt: args.retrievedAt,
      sources: args.sources.map(source => ({ id: source.id, title: source.title, url: source.url })),
    },
  }
}

/**
 * THE PUBLIC RELEASE STEP (one COS pipeline, 2026-09-26). COS reasons once, in the public audience; this
 * is the only public-specific stage after reasoning, and it runs on EVERY public answer. It carries the
 * owner-approved public protections that previously existed only in the separate public-only pipeline:
 *  1. scope isolation — a generic or third-party question must not be answered with company material;
 *  2. disclosure gate — no model, provider, infrastructure, internal component, metric or evidence label.
 * Each has one bounded repair; if the repair does not clear it, the turn fails closed with NO draft.
 */
async function releaseToPublic(
  input: { prompt: string; language?: string },
  result: COSFirstAnswerResult,
): Promise<COSFirstAnswerResult> {
  const userRequest = publicUserRequestText(input.prompt)
  const languageRule = input.language ? `Reply in ${input.language}.` : 'Reply in the language of the user.'
  if (!result.handled) {
    // A low-confidence draft is only ever shown if it would itself pass the disclosure gate.
    const draft = 'bestEffortReply' in result ? String(result.bestEffortReply || '') : ''
    if (draft && publicDisclosureViolations(draft, userRequest).length) {
      return { handled: false, confidence: result.confidence, reason: 'reason' in result ? result.reason : 'Public draft withheld.', provenance: { ...(result.provenance as Record<string, unknown>), publicDraftWithheld: true } as any }
    }
    return result
  }

  let answer = String(result.reply || '').trim()

  const scopeViolations = publicScenarioScopeViolations(input.prompt, answer)
  if (scopeViolations.length) {
    // Labeled interactive call with thinking off (2026-09-27): unlabeled, it ran on the background RunPod
    // reasoner with hidden thinking (36s for one repair on public Concierge).
    const repair = await callCosReasoner({
      usageContext: { feature: 'cos_interactive_answer', purpose: 'public_scope_repair' },
      disableThinking: true,
      temperature: 0,
      maxTokens: 2600,
      systemPrompt: [
        'You are COS repairing a public generic-business answer. Return ONLY strict JSON: {"answer":"...","confidence":0.0}.',
        'The actual user request does not identify iTMounts. Remove every company-specific product, catalog, roadmap, financial, customer, or internal-company reference from the draft.',
        'Do not say you cannot access, disclose, or analyze facts that are already written in the user request. Treat those facts as user-supplied premises and analyze them directly.',
        'Answer the requested business decision or analysis directly using ordinary general reasoning. Do not mention this repair.',
        languageRule,
      ].join(' '),
      prompt: [`USER REQUEST:\n${userRequest}`, `REJECTED DRAFT:\n${answer}`, `SCOPE VIOLATIONS:\n${scopeViolations.join(', ')}`, 'Return the corrected answer now.'].join('\n\n'),
    }).catch(() => null)
    const repaired = withComputedArithmetic(repair?.text ? parseLocalResult(repair.text) : null)
    if (!repaired || repaired.truncated || !repaired.answer.trim() || publicScenarioScopeViolations(input.prompt, repaired.answer).length) {
      return {
        handled: false,
        confidence: 0,
        reason: `Public answer violated scope isolation (${scopeViolations.join(', ')}) and the bounded repair did not clear it.`,
        provenance: result.provenance,
      }
    }
    answer = repaired.answer.trim()
  }

  const disclosures = publicDisclosureViolations(answer, userRequest)
  if (disclosures.length && asksAboutServiceIdentity(userRequest)) {
    return { ...result, reply: publicImplementationDisclosureReply(input.language), confidence: 1 }
  }
  if (disclosures.length) {
    // Labeled interactive call with thinking off (2026-09-27): production 19:56 ET this redaction ran unlabeled on
    // the background RunPod reasoner with hidden thinking — 36.1s and 1,311 tokens for one public answer.
    const redact = await callCosReasoner({
      usageContext: { feature: 'cos_interactive_answer', purpose: 'public_disclosure_redaction' },
      disableThinking: true,
      temperature: 0,
      maxTokens: 2600,
      systemPrompt: [
        'You are COS repairing a public answer that disclosed internal information. Return ONLY strict JSON: {"answer":"...","confidence":0.0}.',
        'Remove every reference to the underlying model, model family, provider, hosting platform, infrastructure vendor, internal component name, internal metric, confidence value, threshold, evidence label, and retrieval or release machinery.',
        'If the reader asked what powers this service, say only that COS is iTMounts\' own reasoning layer and that implementation details are not public. Do not name anything.',
        'Keep the substantive answer to the reader\'s actual question intact. Do not mention this repair.',
        languageRule,
      ].join(' '),
      prompt: [`USER REQUEST:\n${userRequest}`, `REJECTED DRAFT:\n${answer}`, `DISCLOSURES:\n${disclosures.join(', ')}`, 'Return the corrected answer now.'].join('\n\n'),
    }).catch(() => null)
    const redacted = withComputedArithmetic(redact?.text ? parseLocalResult(redact.text) : null)
    if (!redacted || redacted.truncated || !redacted.answer.trim() || publicDisclosureViolations(redacted.answer, userRequest).length) {
      // Fails closed with no draft: an answer containing internals must never reach the reader.
      return {
        handled: false,
        confidence: 0,
        reason: `Public answer disclosed internal information (${disclosures.join(', ')}) and the bounded redaction did not clear it.`,
        provenance: result.provenance,
      }
    }
    answer = redacted.answer.trim()
  }

  return {
    ...result,
    reply: answer,
    provenance: { ...(result.provenance as Record<string, unknown>), publicReleaseApplied: true } as any,
  }
}

function harvestCatalogNames(results: Array<{ title?: string; snippet?: string }>): string[] {
  // Join every field with the bullet so a source TITLE never glues onto the next snippet's name.
  const text = results.flatMap(r => [r.title, r.snippet]).filter(Boolean).join(' • ')
  const stop = /^(esses|grande s[aã]o paulo|s[aã]o paulo|futebol|futebol amador|varzeap[eé]dia|v[aá]rzeap[eé]dia|netshoes|appito|facebook|vindo|conhecido|prepare-se|come[cç]a|enquanto|divulga[cç][aã]o|organizado|e-mail|telefone|museu|arquivos sp|copa pioneer|super copa pioneer|copa le[oõ]es|copa rebote|campeonato municipal|esp[ií]rito santo|zona leste|santo amaro|mooca|guaianases|graja[uú]|boi mirim|alberto luiz|diego vi|thomaz mazzoni|liga paulistana de futebol amador outros)$/i
  const teamHint = /(?:clube|futebol clube|\bfc\b|\bec\b|gr[eê]mio|associa[cç][aã]o|atl[eé]tico|recreativo|katatumba|piraporinha|ver[oô]nia|cidade tiradentes|dan[uú]bio|liberidade|[aá]guia negra|jardim )/i
  // Page-chrome / media / ads / structural noise that never belongs in a team name.
  const junkToken = /\b(uol|ads|newsletters?|v[ií]deos?|mail|confere|confira|wikipedia|wiki|facebook|instagram|netshoes|appito|home|equipes|conte[uú]do|acompanhe|not[ií]cias?|enciclop[eé]dia|p[aá]gina|snapshot|terr[aã]o|enrola|cdc|slogan|programa|jogos de paris|sexo|[uú]ltimas|danon[aá]ticos|maca[eé])\b/i
  // Label words that get glued to the end of a captured name.
  const trailingLabel = /\s+(fundaç[aã]o|fundaão|hist[oó]ria|conte[uú]do|equipes|home|slogan|uniforme|sede|campo|presidente|apelido|mascote|fundad[oa])\b[\s\S]*$/i
  // Bare administrative neighborhoods (not várzea teams).
  const bareNeighborhood = /^(jardim (?:[aâ]ngela|am[eé]rica|europa|paulista|paulistano|ju|monte(?:\s+se)?|cl[ií]max)|[aá]gua rasa|cidade tiradentes|santo amaro|casa verde|sa[uú]de|ipiranga|mooca|penha|guaianases|graja[uú])$/i
  const slugArtifact = /sp-sao-paulo|https?:|\.com|\.br|www\./i
  // Out-of-scope / professional clubs leaking from generic search.
  const outOfScope = /\b(mogi mirim|mirim esporte clube|atl[eé]tico-?mg|corinthians paulista|palmeiras|s[aã]o paulo futebol clube|cruzeiro|flamengo|santos futebol clube de s)\b/i
  const found: string[] = []
  const seen = new Set<string>()
  const matches = text.match(/[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÁÉÍÓÚÂÊÔÃÕÇáéíóúâêôãõç'.-]{2,}(?:\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÁÉÍÓÚÂÊÔÃÕÇáéíóúâêôãõç'.-]{1,}){0,6}/g) || []
  for (const raw0 of matches) {
    // A captured run can straddle a sentence/bullet boundary and glue the tail of one
    // name onto the head of the next. Evaluate EVERY segment as its own candidate.
    for (const seg of raw0.split(/\s+•\s+|\.\s+/)) {
      const name = seg
        .replace(trailingLabel, '')
        .replace(/\s+(?:da|de|do|e)\s*$/i, '') // trim a trailing connector left by truncation
        .replace(/\s+/g, ' ')
        .replace(/[.,;:]+$/, '')
        .trim()
      const key = name.toLowerCase()
      if (name.length < 6 || name.length > 70) continue
      if (stop.test(name) || seen.has(key)) continue
      if (junkToken.test(name)) continue
      if (slugArtifact.test(name)) continue
      if (bareNeighborhood.test(name)) continue
      if (outOfScope.test(name)) continue
      // reject neighborhood enumerations like "Jardim América Jardim Europa Jardim Paulista"
      if ((name.match(/\bjardim\b/gi) || []).length >= 2) continue
      if (!teamHint.test(name) && !/\b(?:da|do|de)\b/i.test(name)) continue
      // reject a dangling 1-2 letter tail fragment (e.g. "Jardim Ju", "Monte Se")
      if (/\s\p{L}{1,2}$/u.test(name) && !/\b(fc|ec|aa|ae)$/i.test(name)) continue
      if (/https?:|página|enciclopédia|snapshot|query|e-mail|telefone/i.test(name)) continue
      seen.add(key)
      found.push(name)
    }
  }
  return found
}

function parseRequestedListCount(prompt: string, fallback = 20): number {
  // Honour an explicit count in the request ("50 times", "top 30", "lista com 15 ...").
  const match = String(prompt || '').match(/\b(\d{1,3})\b/)
  if (!match) return fallback
  const n = Number(match[1])
  if (!Number.isFinite(n) || n < 2) return fallback
  return Math.min(n, 100)
}

function buildCatalogQueryPlan(prompt: string): string[] {
  const asked = String(prompt || '').trim()
  if (isPublicPageExtractionCatalogRequest(asked)) {
    return [
      'site:ligasp.com.br "Grupo Especial" "Escolas de Samba" "São Paulo"',
      'site:ligasp.com.br "Escolas de Samba" "Grupo Especial"',
      'Liga SP Grupo Especial escolas de samba São Paulo lista oficial',
    ]
  }
  // Várzea / amateur football in São Paulo needs facet coverage to reach a large
  // count — a single snapshot only surfaces a handful of names.
  if (/v[aá]rzea|varzea|amador/i.test(asked)) {
    return [
      'lista times futebol varzea amador Sao Paulo tradicionais',
      'times varzea zona sul Sao Paulo futebol amador bairro',
      'times varzea zona leste Sao Paulo futebol amador Guaianases Itaquera',
      'times varzea zona norte Sao Paulo futebol amador Casa Verde',
      'times futebol amador Sao Paulo Capao Redondo Grajau M Boi Mirim',
      'clube futebol amador varzea Sao Paulo Cidade Tiradentes Sapopemba Mooca',
      'times futebol amador Grande Sao Paulo Osasco Taboao Cotia',
    ]
  }
  // Generic named-catalog request: widen coverage with a few rephrasings.
  return [asked, `lista completa ${asked}`, `${asked} nomes`]
}

async function tryLiveNamedCatalog(input: {
  prompt: string
  language?: string
  privileged?: boolean
}): Promise<COSFirstAnswerResult> {
  const asked = String(input.prompt || '').trim()
  const targetCount = parseRequestedListCount(asked)
  const queryPlan = buildCatalogQueryPlan(asked)

  const seen = new Set<string>()
  const names: string[] = []
  const usedSources: string[] = []
  let anySearchOk = false
  let lastError = 'no results'

  // Iterate the query plan, reading pages and harvesting unique names, until we
  // reach the requested count or exhaust the plan. Never stop at the first
  // snapshot, and never pad with invented names.
  for (const query of queryPlan) {
    if (names.length >= targetCount) break
    const live = await getExternalInfo(query, 10, { bypassCache: true })
    if (!live.ok || !live.results.length) {
      lastError = live.error || lastError
      continue
    }
    anySearchOk = true
    const sambaCatalog = isPublicPageExtractionCatalogRequest(asked)
    if (!sambaCatalog) {
      for (const url of live.results.map(r => r.url).filter(Boolean)) {
        if (!usedSources.includes(url)) usedSources.push(url)
      }
    }
    // Research each returned public page and admit only pages whose extracted structure
    // proves they contain the complete requested group. No source URL is hard-coded.
    const pages = await readPublicPages(live.results.map(r => r.url)).catch(() => [])
    let harvested: string[]
    if (sambaCatalog) {
      const sourcePage = pages.find(page => extractSambaSchoolNames([page]).length > 0)
      harvested = sourcePage ? extractSambaSchoolNames([sourcePage]) : []
      // Provenance names the exact page that supplied the answer, not every page
      // inspected during research.
      if (sourcePage?.url) usedSources.push(sourcePage.url)
    } else {
      harvested = harvestCatalogNames([
        ...live.results,
        ...pages.map(page => ({ title: page.title, snippet: page.snippet })),
      ])
    }
    for (const name of harvested) {
      const key = name.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      names.push(name)
      if (names.length >= targetCount) break
    }
    // One self-declared roster page is one answer. Never combine separate sources
    // merely because the user requested more entries than that roster contains.
    if (sambaCatalog && harvested.length) break
  }

  if (!anySearchOk) {
    return {
      handled: true,
      reply: `Live web search ran and returned nothing usable. Error: ${lastError}. COS will not invent club names.`,
      confidence: 0.55,
      provenance: { responseSource: 'cos_local_primary', catalogLiveSearchFailed: true, catalogLiveSearchError: lastError } as any,
    }
  }

  if (!names.length) {
    return {
      handled: true,
      reply: 'Live web search ran but no verifiable names could be extracted from the results. COS will not invent names.',
      confidence: 0.55,
      provenance: {
        responseSource: 'cos_local_primary',
        catalogLiveSearch: true,
        harvestedNameCount: 0,
        liveSources: usedSources.slice(0, 10),
      } as any,
    }
  }

  const finalNames = names.slice(0, targetCount)
  const list = finalNames.map((name, i) => `${i + 1}. ${name}`).join('\n')
  // Clean answer: just the extracted list. No raw source-URL dump in the body,
  // and no defensive "not padded" note. If we genuinely came up short, say it
  // once, plainly — sources stay in provenance, not in the user-facing reply.
  const shortfallNote =
    finalNames.length < targetCount
      ? `\n\nThat is ${finalNames.length} distinct names verified from live sources — fewer than the ${targetCount} requested; the live results did not yield more.`
      : ''
  const reply = `${list}${shortfallNote}`

  return {
    handled: true,
    reply,
    confidence: finalNames.length >= targetCount ? 0.72 : 0.66,
    provenance: {
      responseSource: 'catalog_public_page_extraction',
      catalogLiveSearch: true,
      autonomousResearchAttempted: true,
      localModelInvoked: false,
      researchDocumentsAcquired: usedSources.length,
      liveExternalEvidence: {
        retrievedAt: new Date().toISOString(),
        sources: usedSources.slice(0, 10).map((url, index) => ({ id: `LIVE${index + 1}`, title: url, url })),
      },
      liveSources: usedSources.slice(0, 10),
      harvestedNameCount: finalNames.length,
      requestedCount: targetCount,
      queriesRun: queryPlan.length,
    } as any,
  }
}

// LIVE-FACT PATH WITHIN THE TURN BUDGET (2026-10-10). Production Concierge: the background turn for a live-fact
// question ran past the page's 180 s wait. Searches are now capped in getExternalInfo; page reading is optional
// deepening and runs only while it fits, bounded; answer synthesis starts only with enough time left. When time
// runs out COS returns the honest refusal before the page gives up, and the owner diagnostic shows stage timings.
const PAGE_READ_MIN_REMAINING_MS = 45_000
const PAGE_READ_TIMEOUT_MS = 25_000
const PAGE_READ_DEADLINE_MARGIN_MS = 20_000
const SYNTHESIS_MIN_REMAINING_MS = 15_000

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`
}

async function tryFreshCurrentFact(input: {
  prompt: string
  previousAssistant?: string | null
  userId?: string | null
  language?: string
  privileged?: boolean
}): Promise<COSFirstAnswerResult> {
  const retrievedAt = new Date().toISOString()
  const freshStartedAt = Date.now()
  const queries = freshEvidenceSearchQueries(input.prompt, new Date(retrievedAt))
  const liveResponses = await Promise.all(
    queries.map(query => getExternalInfo(query, FRESH_SEARCH_RESULT_BUDGET, { bypassCache: true })),
  )
  const searchMs = Date.now() - freshStartedAt
  const successfulResponses = liveResponses.filter(response => response.ok)
  const documentsAcquired = liveResponses.reduce((count, response) => count + (response.ok ? response.results.length : 0), 0)
  // Preserve evidence coverage for every part of a compound request.
  let sources = prepareFreshEvidenceAcrossQueries(
    liveResponses.flatMap(response => response.ok ? [response.results] : []),
    FRESH_SELECTED_EVIDENCE_BUDGET,
    input.prompt,
  )
  const pagesStartedAt = Date.now()
  const remainingBeforePages = turnDeadlineRemainingMs()
  let pagesNote = ''
  let claimResearch: Awaited<ReturnType<typeof deepenClaimResearch>> = { sources, claims: [], pagesRead: 0 }
  if (remainingBeforePages !== null && remainingBeforePages < PAGE_READ_MIN_REMAINING_MS) {
    pagesNote = ' (skipped: turn budget)'
  } else {
    const pageBudgetMs = remainingBeforePages === null
      ? PAGE_READ_TIMEOUT_MS
      : Math.min(PAGE_READ_TIMEOUT_MS, remainingBeforePages - PAGE_READ_DEADLINE_MARGIN_MS)
    let pageTimer: ReturnType<typeof setTimeout> | undefined
    const unread = claimResearch
    claimResearch = await Promise.race([
      deepenClaimResearch(input.prompt, sources, readPublicPages).catch(() => unread),
      new Promise<typeof unread>(resolve => { pageTimer = setTimeout(() => { pagesNote = ' (stopped: time cap)'; resolve(unread) }, pageBudgetMs) }),
    ]).finally(() => { if (pageTimer) clearTimeout(pageTimer) })
  }
  const pagesMs = Date.now() - pagesStartedAt
  const freshTiming = (extra = '') => `timing: search ${seconds(searchMs)} · pages ${seconds(pagesMs)}${pagesNote}${extra}`
  sources = claimResearch.sources
  const baseBudget = {
    search_result_limit: FRESH_SEARCH_RESULT_BUDGET,
    queries_run: queries.length,
    results_received: documentsAcquired,
    evidence_selected: sources.length, pages_read: claimResearch.pagesRead, claims: claimResearch.claims,
  }

  // Future election outcomes cannot be verified as current office-holder facts.
  // When retrieval is unavailable, answer the temporal part honestly rather than
  // issuing the generic current-fact failure. Never invent candidates or polls.
  const asksUndecidedElectionOutcome = /(?:who\s+will\s+be\s+(?:the\s+)?next\s+(?:president|prime\s+minister|governor|mayor)|quem\s+(?:ser[aá]|vai\s+ser)\s+(?:o\s+)?pr[oó]xim[oa]\s+(?:president[ea]|governador[ao]?|prefeit[oa]))/iu.test(input.prompt)
  if (asksUndecidedElectionOutcome && (!successfulResponses.length || !sources.length)) {
    const language = String(input.language || 'en').slice(0, 2).toLowerCase()
    const reply = language === 'pt'
      ? 'O resultado da próxima eleição ainda não pode ser tratado como fato confirmado. Não consegui consultar informações eleitorais atuais nesta tentativa; por isso, não posso afirmar quem vencerá nem apresentar pesquisas ou candidatos como verificados.'
      : 'The next election winner is not an established fact. I could not retrieve current election information on this attempt, so I cannot reliably report the candidates or polling, and I will not present a predicted winner as a confirmed result.'
    return {
      handled: true,
      reply,
      confidence: 0.4,
      provenance: freshProvenance({
        reasonerLabel: null,
        localModelInvoked: false,
        retrievedAt,
        sources,
        documentsAcquired,
        responseSource: 'future_election_evidence_unavailable',
        externalAiNecessary: false,
        escalationReasonCode: 'election_current_evidence_unavailable',
        evidenceBudget: { ...baseBudget, stopping_reason: 'future_election_no_live_sources' },
      }) as any,
    }
  }

  if (!successfulResponses.length || !sources.length) {
    const errors = liveResponses.filter(response => !response.ok).map(response => response.error).filter(Boolean)
    const reason = errors.length
      ? `Live current-fact verification failed: ${errors.join('; ')}`
      : 'Live current-fact verification did not produce enough authoritative evidence.'
    // OWNER DIAGNOSTIC (2026-10-09). On the production Concierge refusal of 2026-10-09 no persisted record of this
    // reason could be found afterwards. The owner now sees it in the reply itself, in the same format the chat
    // route uses; visitors never do.
    const ownerDiagnostic = input.privileged
      ? `\n\n— Owner diagnostic (not shown to visitors) —\nbuild: ${String(process.env.VERCEL_GIT_COMMIT_SHA || 'unknown').slice(0, 7)}\nlive search: ${queries.length} quer${queries.length === 1 ? 'y' : 'ies'} · ${successfulResponses.length} succeeded · ${documentsAcquired} results · ${sources.length} kept\n${freshTiming()}\nreason: ${reason}`.slice(0, 900)
      : ''
    return {
      handled: true,
      reply: freshVerificationUnavailable(input.language) + ownerDiagnostic,
      confidence: 0,
      provenance: freshProvenance({
        reasonerLabel: null,
        localModelInvoked: false,
        retrievedAt,
        sources,
        documentsAcquired,
        responseSource: 'live_verification_refusal',
        externalAiNecessary: false,
        escalationReasonCode: 'insufficient_live_authority',
        escalationReason: reason,
        evidenceBudget: { ...baseBudget, stopping_reason: 'insufficient_authoritative_evidence_no_cloud_escalation' },
      }) as any,
    }
  }

  const economicFacts = constructEconomicFactsReply(input.prompt, sources)
  if (economicFacts) {
    return {
      handled: true,
      reply: economicFacts.reply,
      confidence: 0.99,
      provenance: freshProvenance({
        reasonerLabel: null,
        localModelInvoked: false,
        retrievedAt,
        sources: economicFacts.sources,
        documentsAcquired,
        responseSource: 'live_economic_facts',
        externalAiNecessary: false,
        evidenceBudget: { ...baseBudget, stopping_reason: 'economic_facts_constructed_no_model' },
      }) as any,
    }
  }

  const deterministic = resolveDeterministicFreshOfficeHolder(input.prompt, sources)
  if (deterministic) {
    return {
      handled: true,
      reply: deterministic.reply,
      confidence: deterministic.confidence,
      provenance: freshProvenance({
        reasonerLabel: null,
        localModelInvoked: false,
        retrievedAt,
        sources: deterministic.sources,
        documentsAcquired,
        responseSource: 'deterministic_authoritative_fact',
        deterministicResolverUsed: true,
        externalAiNecessary: false,
        escalationReasonCode: null,
        escalationReason: null,
        evidenceBudget: {
          ...baseBudget,
          evidence_selected: deterministic.sources.length,
          stopping_reason: 'authoritative_cross_source_consensus',
        },
      }) as any,
    }
  }

  const resolved = resolveCosReasoner()
  if (!resolved.config) {
    const reason = 'Live evidence was retrieved, but the independent local reasoner is not configured for grounded synthesis.'
    return {
      handled: false,
      confidence: 0,
      reason,
      provenance: freshProvenance({
        reasonerLabel: null,
        localModelInvoked: false,
        retrievedAt,
        sources,
        documentsAcquired,
        externalAiNecessary: true,
        escalationReasonCode: 'local_reasoner_not_configured',
        escalationReason: reason,
        evidenceBudget: { ...baseBudget, stopping_reason: 'authoritative_evidence_ready_local_reasoner_unavailable' },
      }) as any,
    }
  }

  // Synthesis starts only with enough turn left; otherwise return the honest refusal before the page gives up.
  const remainingBeforeSynthesis = turnDeadlineRemainingMs()
  if (remainingBeforeSynthesis !== null && remainingBeforeSynthesis < SYNTHESIS_MIN_REMAINING_MS) {
    const reason = `Live evidence was retrieved, but the turn budget ran out before answer synthesis (${seconds(Math.max(0, remainingBeforeSynthesis))} left).`
    const ownerDiagnostic = input.privileged
      ? `\n\n— Owner diagnostic (not shown to visitors) —\nbuild: ${String(process.env.VERCEL_GIT_COMMIT_SHA || 'unknown').slice(0, 7)}\nlive search: ${queries.length} quer${queries.length === 1 ? 'y' : 'ies'} · ${successfulResponses.length} succeeded · ${documentsAcquired} results · ${sources.length} kept\n${freshTiming(' · synthesis not started')}\nreason: ${reason}`.slice(0, 900)
      : ''
    return {
      handled: true,
      reply: freshVerificationUnavailable(input.language) + ownerDiagnostic,
      confidence: 0,
      provenance: freshProvenance({
        reasonerLabel: null,
        localModelInvoked: false,
        retrievedAt,
        sources,
        documentsAcquired,
        responseSource: 'live_verification_refusal',
        externalAiNecessary: false,
        escalationReasonCode: 'turn_budget_exhausted_before_synthesis',
        escalationReason: reason,
        evidenceBudget: { ...baseBudget, stopping_reason: 'turn_budget_exhausted_before_synthesis' },
      }) as any,
    }
  }

  const authorityComplete = freshEvidenceMeetsAuthority(input.prompt, sources)
  const evidenceBlock = freshEvidenceGroundingBlock(input.prompt, sources, retrievedAt)
  // Labeled (2026-09-27): the live-fact answer uses the fresh-grounded lane's bounded policy instead of running
  // unlabeled on the background reasoner.
  const synthesisRequest = {
    usageContext: { feature: 'cos_fresh_grounded_task', purpose: 'live_fact_synthesis' },
    temperature: 0,
    maxTokens: 1800,
    systemPrompt: [
      'You are SignalBoost COS live-fact verifier.',
      'Return ONLY strict JSON: {"answer":"...","confidence":0.0}.',
      'For any present/current claim, use only the server-retrieved LIVE evidence in the prompt for dates, quantities, URLs, and quoted findings.',
      'Never use pretrained memory, previous conversation facts, caches, or durable COS memory to invent a missing figure.',
      'LIVE snippets own measured figures. They do not own the question categories. Split overloaded terms before answering (raw group average vs equal-work comparison, legal rule vs outcome gap, sex vs identity, slogan vs measured residual). Write: constraint or definition first; what the cited number actually counted; what that count does not prove; then advocacy or institutional framing labelled as such. Do not let the first source headline become sentence one.',
      'If independent sources disagree, explain the disagreement and what each source actually supports rather than replacing the whole reply with a generic refusal. Never state an unsupported conclusion.',
      'If only partial evidence is available, answer the supported portion with clear uncertainty and a confidence <= 0.65. If even that is unsupported, state what remains unknown and use confidence <= 0.30.',
      authorityComplete ? 'Evidence authority gate passed.' : 'Evidence is partial or missing independent corroboration: explicitly disclose that limitation, and do not assert unsupported facts.',
      'Answer from the supplied evidence, but do not show source labels or URLs unless the user asks. Recorded provenance retains the exact sources.',
      ...QUANTITATIVE_ANSWER_POLICY,
    ].join(' '),
    prompt: `${evidenceBlock}\n\nAnswer the original question now.`,
  }
  // Evidence acquisition succeeded. A transient local transport failure must get one bounded
  // retry before this request can fail closed; it may never fall back to another model.
  let reasoned: Awaited<ReturnType<typeof callCosReasoner>> | null = null
  for (let attempt = 0; attempt < 2 && !reasoned?.text; attempt += 1) {
    reasoned = await callCosReasoner(synthesisRequest).catch(() => null)
  }

  const provenance = freshProvenance({
    reasonerLabel: reasoned?.reasoner.label ?? resolved.config.label,
    localModelInvoked: true,
    retrievedAt,
    sources,
    documentsAcquired,
    evidenceBudget: { ...baseBudget, stopping_reason: 'bounded_evidence_sent_to_local_reasoner' },
  })

  if (!reasoned?.text) {
    const reason = 'Live evidence was retrieved, but independent local synthesis returned no answer.'
    return { handled: false, confidence: 0, reason, provenance: { ...provenance, externalAiNecessary: true, escalationReasonCode: 'local_synthesis_failed', escalationReason: reason } as any }
  }

  const parsed = withComputedArithmetic(parseLocalResult(reasoned.text))
  if (!parsed || parsed.truncated) {
    const reason = 'Live evidence was retrieved, but independent local synthesis was incomplete or unparseable.'
    return { handled: false, confidence: 0, reason, provenance: { ...provenance, externalAiNecessary: true, escalationReasonCode: 'local_synthesis_unparseable', escalationReason: reason } as any }
  }

  const citesIndependentEvidence = authorityComplete
  const confidence = Math.max(0, Math.min(1, parsed.confidence))
  if (confidence < confidenceThreshold() && citesIndependentEvidence) {
    const reason = `Current-fact synthesis confidence ${confidence.toFixed(2)} is below threshold ${confidenceThreshold().toFixed(2)}.`
    return {
      handled: false,
      confidence,
      reason,
      bestEffortReply: parsed.answer,
      provenance: {
        ...provenance,
        externalAiNecessary: true,
        escalationReasonCode: 'local_synthesis_below_threshold',
        escalationReason: reason,
      } as any,
    }
  }

  if (!citesIndependentEvidence && confidence > 0.65) {
    return { handled: false, confidence: 0, reason: 'Partial evidence was overclaimed by synthesis', provenance: { ...provenance, escalationReasonCode: 'partial_evidence_overclaimed' } as any }
  }
  return { handled: true, reply: parsed.answer, confidence, provenance: { ...provenance, externalAiNecessary: false, escalationReasonCode: null, escalationReason: null } as any }
}

async function reflectOrdinaryAnswerFreshness(
  input: { prompt: string; language?: string },
  result: COSFirstAnswerResult,
): Promise<COSFirstAnswerResult> {
  if (!result.handled) return result
  const signals = answerFreshnessSignals(result.reply)
  if (!signals.length) return result

  // Labeled interactive call with thinking off (2026-09-27): unlabeled chat calls ran on the slow background reasoner.
  const repair = await callCosReasoner({
    usageContext: { feature: 'cos_interactive_answer', purpose: 'answer_freshness_reflection' },
    disableThinking: true,
    temperature: 0,
    maxTokens: 1400,
    systemPrompt: [
      'You are COS answer-side freshness self-reflection.',
      'Return ONLY strict JSON: {"answer":"...","confidence":0.0}.',
      'The original question was not a live current-fact lookup, but the draft introduced mutable present-world claims that were not live-verified.',
      'Rewrite the draft so it answers the timeless, conceptual, normative, or hypothetical question without asserting current industry practice, current law, current regulation, current leadership, current market behavior, or other mutable present-world facts.',
      'Do not add new factual claims. Do not claim what most companies, regulators, courts, governments, or industries currently do.',
      'Preserve useful ethical/logical reasoning and clearly separate competing principles when relevant.',
    ].join(' '),
    prompt: [
      `ORIGINAL QUESTION:\n${input.prompt}`,
      `UNVERIFIED CURRENT-WORLD SIGNALS:\n${signals.map(signal => `${signal.code}: ${signal.excerpt}`).join('\n')}`,
      `DRAFT ANSWER:\n${result.reply}`,
      'Rewrite the answer now.',
    ].join('\n\n'),
  }).catch(() => null)

  const parsed = withComputedArithmetic(repair?.text ? parseLocalResult(repair.text) : null)
  const locallyRepaired = parsed && !parsed.truncated && parsed.answer.trim() && !answerNeedsFreshnessReflection(parsed.answer)
    ? parsed.answer.trim()
    : null
  const deterministicRepair = locallyRepaired ? null : stripUnsupportedCurrentClaimSentences(result.reply)
  const reply = locallyRepaired || deterministicRepair

  if (!reply || answerNeedsFreshnessReflection(reply)) {
    const reason = 'COS draft introduced unverified mutable current-world claims and the local self-reflection pass could not remove them safely.'
    return {
      handled: false,
      confidence: 0,
      reason,
      bestEffortReply: stripUnsupportedCurrentClaimSentences(result.reply) || undefined,
      provenance: {
        ...(result.provenance as Record<string, unknown>),
        answerFreshnessReflection: {
          triggered: true,
          repaired: false,
          signals: signals.map(signal => signal.code),
        },
      } as any,
    }
  }

  const repairedConfidence = locallyRepaired && parsed
    ? Math.max(0, Math.min(result.confidence, parsed.confidence))
    : Math.min(result.confidence, 0.8)
  return {
    handled: true,
    reply,
    confidence: repairedConfidence,
    provenance: {
      ...(result.provenance as Record<string, unknown>),
      answerFreshnessReflection: {
        triggered: true,
        repaired: true,
        method: locallyRepaired ? 'local_reasoner_rewrite' : 'deterministic_sentence_strip',
        signals: signals.map(signal => signal.code),
      },
    } as any,
  }
}

async function learnFromTurn(input: { prompt: string }, result: COSFirstAnswerResult): Promise<COSFirstAnswerResult> {
  const turnId = peekEvidenceSourceUseTurnId()
  const enriched = turnId
    ? ({ ...result, provenance: { ...(result.provenance as Record<string, unknown>), turnId } } as unknown as COSFirstAnswerResult)
    : result
  const failureReason = 'reason' in enriched ? enriched.reason : null
  await recordCosTurnExperience({
    prompt: input.prompt,
    handled: enriched.handled,
    confidence: enriched.confidence,
    provenance: enriched.provenance,
    failureReason,
  })
  return enriched
}

export async function tryCOSFirstAnswer(input: {
  prompt: string
  userId?: string | null
  language?: string
  privileged?: boolean
  disableCache?: boolean
  previousAssistant?: string | null
}): Promise<COSFirstAnswerResult> {
  beginEvidenceSourceUseTurn()

  if (isNamedCatalogListRequest(input.prompt) || isPublicPageExtractionCatalogRequest(input.prompt)) {
    return learnFromTurn(input, await tryLiveNamedCatalog(input))
  }

  // Any identity/model/provider question is answered deterministically and scope-aware, BEFORE the
  // enterprise reasoner runs — otherwise the owner's phrasing can slip past the narrow platform-stack
  // detector, reach the model, and get the public non-disclosure deflection on the owner's own
  // channel. Public scope still gets the non-disclosure boundary; the owner gets the real stack.
  if (isPlatformStackQuestion(input.prompt) || asksAboutServiceIdentity(input.prompt)) {
    const reply = isPublicDeliveryScope()
      ? publicImplementationDisclosureReply(input.language)
      : ownerPlatformStackReply(input.language)
    return learnFromTurn(input, {
      handled: true,
      reply,
      confidence: 1,
      provenance: { responseSource: 'cos_local_primary', selfKnowledgeDeterministic: true } as any,
    })
  }

  const directTextTransformation = await tryDirectTextTransformation(input)
  if (directTextTransformation) {
    return learnFromTurn(input, directTextTransformation)
  }

  // The outer /api/cos-primary route already performs a neural semantic task-intent check before
  // freshness. The core must independently honor the same semantic distinction, because it is a
  // shared entrypoint used by other callers too. A second deterministic freshness classifier must
  // never override a high-confidence neural finding that the task is interpretation of supplied
  // language/context rather than verification of the outside world.
  const heuristicRequiresFreshEvidence = requiresFreshExternalEvidence(input.prompt)
  // CROSS-LANGUAGE LIVE FACTS (2026-10-09): a non-English question the word rules did not flag is adjudicated by
  // the semantic judge, so a live-fact question is not answered from memory merely because of its language.
  const nonEnglishUnflagged = !heuristicRequiresFreshEvidence && mayBeNonEnglish(input.prompt, input.language)
  const semanticTaskIntent = heuristicRequiresFreshEvidence || nonEnglishUnflagged
    ? await classifyCosSemanticTaskIntent({
        input: input.prompt,
        language: input.language,
        previousAssistant: input.previousAssistant,
      })
    : null
  const baselineRequiresFreshEvidence = heuristicRequiresFreshEvidence || semanticIntentRequiresFreshness(semanticTaskIntent)
  const suppressFreshnessForInterpretation = semanticIntentSuppressesFreshness(semanticTaskIntent)
  if (suppressFreshnessForInterpretation) {
    console.info('[cos-core-contextual-freshness-suppressed]', JSON.stringify({
      at: new Date().toISOString(),
      mode: semanticTaskIntent?.mode ?? null,
      confidence: semanticTaskIntent?.confidence ?? null,
      suppliedContextPrimary: semanticTaskIntent?.suppliedContextPrimary ?? null,
      externalFactsRequired: semanticTaskIntent?.externalFactsRequired ?? null,
    }))
  }

  if (baselineRequiresFreshEvidence && !suppressFreshnessForInterpretation) {
    return learnFromTurn(input, await tryFreshCurrentFact(input))
  }

  if (!suppressFreshnessForInterpretation && classifyKnowledgeAccess(input.prompt).mode === 'search_if_thin') {
    const looked = await tryFreshCurrentFact(input)
    const reply = 'reply' in looked ? String(looked.reply || '') : ''
    const refused = /could not stand behind|did not release an answer|verification unavailable|live verification/i.test(reply)
    if (looked.handled && reply && !refused) {
      return learnFromTurn(input, looked)
    }
  }

  if (isPublicDeliveryScope()) {
    // ONE COS PIPELINE (owner decision 2026-09-26). Concierge is the mouth; COS is the brain. Public
    // questions — including questions about iTMounts itself — run the SAME pipeline as the owner's,
    // in the public audience: public-safe retrieval, the public boundary, and this release gate. The
    // separate public-only pipeline that used to answer company questions has been removed.
    //
    // SELF-IDENTITY IS A RELEASE RULE, ANSWERED BEFORE INFERENCE (2026-08-26): "what model powers
    // this?" has exactly one correct public answer, so the model is never asked.
    const userRequest = publicUserRequestText(input.prompt)
    if (asksAboutServiceIdentity(userRequest)) {
      return learnFromTurn(input, {
        handled: true,
        reply: publicImplementationDisclosureReply(input.language),
        confidence: 1,
        provenance: { responseSource: 'cos_local_primary', selfKnowledgeDeterministic: true } as any,
      })
    }
    const brain = await tryEnterpriseCOSFirstAnswer(input)
    return learnFromTurn(input, await releaseToPublic(input, brain))
  }

  if (process.env.COS_LOCAL_FIRST_ENABLED !== 'false') {    try {
      await ensureLocalInferenceRuntimeReady()
      await generateLocalEmbedding(input.prompt)
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      console.info('[cos-runtime-preflight-unavailable]', JSON.stringify({ at: new Date().toISOString(), reason }))
      const result = await tryEnterpriseCOSFirstAnswer(input)

      const capacity = classifyRunpodFailure(reason)
      if (capacity.capacityUnavailable && result.handled === false) {
        const capacityReason = runpodCapacityUnavailableReason({ podId: configuredRunpodPodId(), originalMessage: reason })
        const failedResult: COSFirstAnswerResult = {
          handled: false,
          confidence: result.confidence,
          reason: capacityReason,
          ...('bestEffortReply' in result && result.bestEffortReply ? { bestEffortReply: result.bestEffortReply } : {}),
          provenance: result.provenance,
        }
        return learnFromTurn(input, failedResult)
      }
      return learnFromTurn(input, await reflectOrdinaryAnswerFreshness(input, result))
    }
  }

  const result = await tryEnterpriseCOSFirstAnswer(input)
  return learnFromTurn(input, await reflectOrdinaryAnswerFreshness(input, result))
}

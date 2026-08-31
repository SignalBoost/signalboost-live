// saas/lib/ai/cos/officialSourceAuthority.ts
//
// EVERY AUTHORITATIVE FACT HAS AN OWNER. FIND THE OWNER — IN ANY SITUATION.
//
// A careful human answering a factual question first asks "whose fact is this?" and goes there:
// a state's procedure belongs to that state's portal, a product's behavior belongs to the vendor's
// docs, a dosage belongs to a health institution, a company fact belongs to the company, a standard
// belongs to the standards body. Published national accounts and labor/price series belong to the
// statistical agency that produces them. Whatever blog ranks first is commentary, not authority.
//
// This module gives the live-search layer that judgement AS A GENERAL RULE, deliberately without
// per-country, per-vendor, or per-controversy lookup tables:
//
//   FIRST-PARTY   the result's domain names the entity the query asks about
//   INSTITUTIONAL the domain is a state/IGO/standards/health/academic institution by TLD
//                 convention — (?:gov|gob|gouv|mil|edu).* , europa.eu, who.int, oecd.org …
//   SECONDARY     everything else; dated pages outrank undated ones
//
// Secondary sources are demoted and labelled, never deleted. Deterministic code never writes the
// semantic answer. The reasoner must see owner evidence first, then commentary, with honest labels.
//
// Pure; deterministic; no model calls; no per-jurisdiction data; no imports.

const CLASSIFICATION_VOCABULARY: Array<[string, string]> = [
  ['co powinnam zrobić', 'what should i do'], ['co powinienem zrobić', 'what should i do'],
  ['qué debo hacer', 'what should i do'], ['que debo hacer', 'what should i do'],
  ['o que devo fazer', 'what should i do'], ['что мне делать', 'what should i do'],
  ['jakie', 'which'], ['jaki', 'which'], ['które', 'which'], ['cuáles', 'which'], ['cuales', 'which'],
  ['cuál', 'which'], ['cual', 'which'], ['qué', 'what'], ['quais', 'which'], ['qual', 'which'],
  ['какие', 'which'], ['какой', 'which'], ['что', 'what'],
  ['dokumenty', 'documents'], ['dokument', 'document'], ['documentos', 'documents'], ['documento', 'document'],
  ['документы', 'documents'], ['документ', 'document'],
  ['formularze', 'forms'], ['formularios', 'forms'], ['formulários', 'forms'], ['формы', 'forms'],
  ['instytucje', 'institutions'], ['instituciones', 'institutions'], ['instituições', 'institutions'], ['учреждения', 'institutions'],
  ['urzędy', 'offices'], ['urząd', 'office'], ['oficinas', 'offices'], ['ведомства', 'offices'],
  ['zmienić', 'change'], ['zmiana', 'change'], ['zmieniłam', 'i changed'], ['zmieniłem', 'i changed'],
  ['cambiar', 'change'], ['alterar', 'change'], ['mudar', 'change'], ['изменить', 'change'], ['поменять', 'change'],
  ['powiadomić', 'notify'], ['zgłosić', 'notify'], ['notificar', 'notify'], ['уведомить', 'notify'],
  ['odnowić', 'renew'], ['renovar', 'renew'], ['продлить', 'renew'],
  ['przepisy', 'regulations'], ['regulaciones', 'regulations'], ['regulamentos', 'regulations'], ['правила', 'rules'],
  ['prawo', 'law'], ['ustawa', 'law'], ['ley', 'law'], ['lei', 'law'], ['закон', 'law'],
  ['wymagania', 'requirements'], ['requisitos', 'requirements'], ['требования', 'requirements'],
  ['wiza', 'visa'], ['visado', 'visa'], ['visto', 'visa'], ['виза', 'visa'],
  ['paszport', 'passport'], ['pasaporte', 'passport'], ['passaporte', 'passport'], ['паспорт', 'passport'],
  ['nazwisko', 'name change'], ['apellido', 'name change'], ['sobrenome', 'name change'], ['фамилии', 'name change'], ['фамилию', 'name change'],
  ['podatek', 'tax'], ['impuesto', 'tax'], ['imposto', 'tax'], ['налог', 'tax'],
  ['desempleo', 'unemployment'], ['desemprego', 'unemployment'], ['bezrobocie', 'unemployment'], ['безработица', 'unemployment'],
  ['inflación', 'inflation'], ['inflação', 'inflation'], ['inflacja', 'inflation'], ['инфляция', 'inflation'],
  ['salarios', 'wages'], ['salários', 'wages'], ['płace', 'wages'], ['зарплаты', 'wages'],
  ['ganancias', 'earnings'], ['rendimentos', 'earnings'], ['zarobki', 'earnings'], ['заработок', 'earnings'],
]

const CLASSIFICATION_RULES: Array<{ pattern: RegExp; english: string }> = [...CLASSIFICATION_VOCABULARY]
  .sort((a, b) => b[0].length - a[0].length)
  .map(([foreign, english]) => ({
    pattern: new RegExp(`(?<![\\p{L}\\p{M}])${foreign.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{M}])`, 'giu'),
    english,
  }))

const NON_ENGLISH_SIGNAL = /[\u00c0-\u024f\u0400-\u04ff]/
const ASCII_FOREIGN_HINT = /(?:^|\s)(?:czy|jakie|jaki|cuales|cual|quais|qual|documentos|dokumenty)(?:\s|$|[?,.!])/i

function englishNormalizedForClassification(input: string): string {
  const text = String(input || '')
  if (!text) return text
  if (!NON_ENGLISH_SIGNAL.test(text) && !ASCII_FOREIGN_HINT.test(text)) return text
  let normalized = text.toLowerCase()
  for (const rule of CLASSIFICATION_RULES) normalized = normalized.replace(rule.pattern, rule.english)
  return normalized
}

export type AuthorityTier = 'first_party' | 'institutional' | 'secondary'

export type AuthoritativeSourceNeed = {
  /** True when the question's answer has a recognizable owner and authority-first ranking applies. */
  required: boolean
  /** Entity tokens extracted from the query, used for first-party domain matching. */
  entityTokens: string[]
  /** True when the owner is a statistical publisher of official series, not a product vendor. */
  officialStatistics?: boolean
}

const GOVERNMENT_RULE_TOPIC = /\b(?:law|laws|regulation|regulations|rule|rules|requirement|requirements|visa|passport|residence\s+permit|work\s+permit|citizenship|naturali[sz]ation|tax(?:es)?|tax\s+(?:rate|return|filing)|pension|social\s+security|benefits?|id\s+card|identity\s+card|driver'?s?\s+licen[cs]e|driving\s+licen[cs]e|voter\s+registration|name\s+change|marriage\s+(?:registration|certificate)|birth\s+certificate|death\s+certificate|civil\s+registry|customs|import\s+dut(?:y|ies)|minimum\s+wage)\b/i
const PROCEDURE_INTENT = /\b(?:which|what)\s+(?:documents?|forms?|institutions?|offices?|authorit(?:ies|y))\b|\b(?:documents?|forms?)\s+(?:do\s+i|should\s+i|to)\s+(?:change|update|renew|replace|submit|file)\b|\bhow\s+(?:do|can)\s+i\s+(?:register|apply|renew|replace|file|notify|report)\b|\bwhat\s+should\s+i\s+do\b.{0,80}\b(?:documents?|offices?|institutions?|authorit(?:ies|y)|register|notify)\b/i
const PRODUCT_BEHAVIOR_TOPIC = /\b(?:api|sdk|webhook|endpoint|documentation|docs|error\s+code|status\s+code|rate\s+limit|deprecat(?:ed|ion)|changelog|release\s+notes|version|pricing\s+plan|configuration|config|integration|authentication|oauth|token)\b/i
const MEDICAL_TOPIC = /\b(?:dose|dosage|dosing|maximum\s+daily|side\s+effects?|contraindication|drug\s+interaction|vaccine\s+schedule|treatment\s+guidelines?)\b/i
const STANDARD_TOPIC = /\b(?:rfc\s*\d+|iso\s*\d+|ieee\s*\d+|w3c|http\s+spec|specification)\b/i

// Official published series. Construct-agnostic: earnings, prices, output, labor force.
// Do not name a controversy, a preferred ratio, or a conclusion here.
const OFFICIAL_STATISTICS_TOPIC = /\b(?:unemployment|inflation|consumer\s+price|producer\s+price|\bcpi\b|\bppi\b|\bgdp\b|gross\s+domestic\s+product|labor\s+force|labour\s+force|labor\s+productivity|labour\s+productivity|employment\s+rate|participation\s+rate|payroll|earnings|wages?|\bpay\b|compensation|poverty\s+rate|median\s+(?:weekly|hourly|annual|monthly))\b/i

const INSTITUTIONAL_HOST = /(?:^|\.)(?:gov|gob|gouv|mil|edu)(?:\.[a-z]{2,3})?$|(?:^|\.)(?:europa\.eu|ec\.europa\.eu|un\.org|who\.int|oecd\.org|worldbank\.org|imf\.org|ietf\.org|w3\.org|iso\.org|ieee\.org|nist\.gov|ecb\.europa\.eu|stats\.oecd\.org|ilo\.org)$|(?:^|\.)(?:nhs\.uk|nih\.gov|cdc\.gov|ema\.europa\.eu|fda\.gov)$|(?:^|\.)ac\.[a-z]{2}$/i

const ENTITY_STOP = new Set([
  'what', 'which', 'when', 'where', 'who', 'how', 'does', 'this', 'that', 'with', 'from', 'into',
  'after', 'before', 'change', 'changed', 'update', 'renew', 'notify', 'documents', 'document',
  'forms', 'form', 'offices', 'office', 'institutions', 'institution', 'requirements', 'name',
  'should', 'need', 'current', 'currently', 'latest', 'official', 'error', 'issue', 'problem',
  'failing', 'fails', 'failed', 'broken', 'working', 'setup', 'install', 'configure', 'price',
  'pricing', 'webhook', 'webhooks', 'signature', 'token', 'docs', 'documentation', 'guide',
  'exist', 'exists', 'between', 'men', 'women', 'male', 'female',
])

function entityTokensOf(text: string): string[] {
  const tokens: string[] = []
  const seen = new Set<string>()
  for (const raw of String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ')) {
    const token = raw.trim()
    if (token.length < 3 || token.length > 30) continue
    if (ENTITY_STOP.has(token)) continue
    if (/^\d+$/.test(token)) continue
    if (seen.has(token)) continue
    seen.add(token)
    tokens.push(token)
  }
  return tokens.slice(0, 12)
}

function hostOf(url: string): string {
  try {
    return new URL(String(url || '')).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}

function hostLabels(host: string): string[] {
  const parts = host.split('.').filter(Boolean)
  return parts.slice(0, Math.max(0, parts.length - 1))
}

export function classifyAuthoritativeSourceNeed(query: string): AuthoritativeSourceNeed {
  const raw = String(query || '')
  const text = englishNormalizedForClassification(raw)
  const officialStatistics = OFFICIAL_STATISTICS_TOPIC.test(text)
  const required = officialStatistics
    || GOVERNMENT_RULE_TOPIC.test(text)
    || PROCEDURE_INTENT.test(text)
    || PRODUCT_BEHAVIOR_TOPIC.test(text)
    || MEDICAL_TOPIC.test(text)
    || STANDARD_TOPIC.test(text)
  if (!required) return { required: false, entityTokens: [], officialStatistics: false }
  return { required: true, entityTokens: entityTokensOf(`${raw} ${text}`), officialStatistics }
}

export function authorityTierOf(url: string, need: AuthoritativeSourceNeed): AuthorityTier {
  const host = hostOf(url)
  if (!host) return 'secondary'
  const labels = hostLabels(host)
  if (labels.some(label => need.entityTokens.includes(label))) return 'first_party'
  if (INSTITUTIONAL_HOST.test(host)) return 'institutional'
  return 'secondary'
}

const TIER_RANK: Record<AuthorityTier, number> = { first_party: 0, institutional: 1, secondary: 2 }

export function rankByAuthority<T extends { url: string; sourceDate?: string }>(
  results: T[],
  need: AuthoritativeSourceNeed,
): Array<T & { authorityTier: AuthorityTier }> {
  return (results || [])
    .map((result, index) => ({ result, index, tier: authorityTierOf(result.url, need) }))
    .sort((a, b) => {
      const tier = TIER_RANK[a.tier] - TIER_RANK[b.tier]
      if (tier !== 0) return tier
      if (a.tier === 'secondary') {
        const dated = Number(Boolean(b.result.sourceDate)) - Number(Boolean(a.result.sourceDate))
        if (dated !== 0) return dated
      }
      return a.index - b.index
    })
    .map(entry => ({ ...entry.result, authorityTier: entry.tier }))
}

export function augmentQueryForOfficialSources(query: string, need: AuthoritativeSourceNeed): string {
  const q = String(query || '').trim()
  if (!need.required) return q
  // Never embed a publisher domain or a canned series name. Recognize owners in results.
  if (need.officialStatistics) {
    return /\b(?:official|statistical|agency|series)\b/i.test(q)
      ? q
      : `${q} official statistical agency series`.slice(0, 400)
  }
  return /\bofficial\b/i.test(q) ? q : `${q} official`.slice(0, 400)
}

export function officialCoverageNote(
  ranked: Array<{ authorityTier: AuthorityTier }>,
  need: AuthoritativeSourceNeed,
): string | null {
  if (!need.required) return null
  if (ranked.some(result => result.authorityTier !== 'secondary')) return null
  return 'No first-party or institutional source was retrieved for this question; the evidence below is secondary commentary, and the specifics should be confirmed against the owning authority (the responsible government portal, statistical agency, vendor documentation, or institution) before acting.'
}

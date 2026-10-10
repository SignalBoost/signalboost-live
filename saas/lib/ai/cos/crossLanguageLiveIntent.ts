// saas/lib/ai/cos/crossLanguageLiveIntent.ts
//
// LIVE-FACT INTENT IN EVERY LANGUAGE (2026-10-09, owner-reported production defect).
// "who will be the next president of Brazil?" routed to live web verification, but the same question in
// Portuguese, "quem sera o proximo presidente do Brasil?", routed to model memory, which invented an election
// date, said the vote had not happened (the first round was 4 October 2026) and invented the candidate field.
// The freshness policy classifies an English rendering of the prompt, and the word-for-word table in
// crossLanguageFreshness.ts cannot produce one for these questions: it knows "quem é" but not "quem será",
// "próximo", "presidente", "eleição" or "ganhou", and it has no entries at all for German, French, Italian,
// Japanese, Korean or Arabic, where word order or the absence of spaces defeats word-for-word replacement.
//
// This module recognises the live-fact INTENT instead of translating words: who holds or will hold an office,
// who won or will win an election, election results, and the latest news. For each it returns the English
// phrasing the freshness policy already routes to live verification. Pure and deterministic.
// Historical questions ("who was the first president", any past year) are deliberately left alone.

const L = '\\p{L}\\p{M}'
const word = (source: string) => new RegExp(`(?<![${L}])(?:${source})(?![${L}])`, 'iu')
const anywhere = (source: string) => new RegExp(`(?:${source})`, 'iu')

// Spaced languages need word boundaries; Japanese and Korean do not have them, and Arabic attaches prefixes.
const WHO = [
  word('quem|qui[eé]n(?:es)?|qui|chi|wer|kto|кто'),
  anywhere('誰|だれ|누구|누가'),
  anywhere('(?:^|\\s)من\\s+(?:هو|هي|سيكون|ستكون|يكون|تكون|فاز|فازت|سيفوز|ستفوز)'),
]

type Role = Readonly<{ english: string; patterns: readonly RegExp[] }>

// Order matters: multi-word offices that contain the word for "president" come first.
const ROLES: readonly Role[] = [
  { english: 'prime minister', patterns: [
    word('primeir[oa][- ]ministr[oa]|primer[ao]? ministr[oa]|premi[eè]re? ministre|prim[oa] ministr[oa]|premierminister\\p{L}*|ministerpr[äa]sident\\p{L}*|premier\\p{L}*|премьер(?:[- ]министр\\p{L}*)?'),
    anywhere('首相|총리|رئيس(?:ة)? الوزراء'),
  ] },
  { english: 'ceo', patterns: [
    word('ceo|pdg|directeur g[ée]n[ée]ral|amministratore delegato|director ejecutivo|diretor executivo|vorstandsvorsitzend\\p{L}*|gesch[äa]ftsf[üu]hrer\\p{L}*|prezes\\p{L}*|гендиректор\\p{L}*|генеральн\\p{L}* директор\\p{L}*'),
    anywhere('最高経営責任者|社長|최고경영자|CEO|الرئيس التنفيذي'),
  ] },
  { english: 'chancellor', patterns: [word('bundeskanzler\\p{L}*|kanzler\\p{L}*|chanceler|canciller|chancelier|cancelliere|kanclerz\\p{L}*|канцлер\\p{L}*')] },
  { english: 'governor', patterns: [
    word('governador\\p{L}*|gobernador\\p{L}*|gouverneur\\p{L}*|governatore|governatrice|gubernator\\p{L}*|губернатор\\p{L}*'),
    anywhere('知事|주지사|حاكم'),
  ] },
  { english: 'mayor', patterns: [
    word('prefeit[oa]|alcalde(?:sa)?|maire|sindac[oa]|b[üu]rgermeister\\p{L}*|burmistrz\\p{L}*|мэр\\p{L}*'),
    anywhere('市長|시장|عمدة'),
  ] },
  { english: 'president', patterns: [
    word('president[ea]?|pr[ée]sident(?:e)?|pr[äa]sident\\p{L}*|prezydent\\p{L}*|президент\\p{L}*'),
    anywhere('大統領|대통령|رئيس'),
  ] },
]

const FUTURE_OR_NEXT = [
  word('ser[aá]|vai ser|pr[oó]xim[oa]|sera|prochaine?|sar[aà]|prossim[oa]|wird|n[äa]chste\\p{L}*|naechste\\p{L}*|b[ęe]dzie|nast[ęe]pn\\p{L}*|будет|следующ\\p{L}*'),
  anywhere('次の|次期|다음|차기|القادم|المقبل|سيكون|ستكون'),
]

// "Who was / who has been" an office holder is history, not a live lookup.
const PAST_OFFICE = [
  word('foi|era|fue|fut|[ée]tait|a [ée]t[ée]|[èe] stat[oa]|fu|war|wurde|by[łl]\\p{L}*|был\\p{L}*'),
  anywhere('でした|だった|였|이었|كان'),
]

const ELECTION = [
  word('elei[cç](?:[ãa]o|[õo]es)|pleito|elecci(?:[óo]n|ones)|[ée]lections?|elezion[ei]|wahl\\p{L}*|pr[äa]sidentschaftswahl\\p{L}*|wybor\\p{L}*|выбор\\p{L}*'),
  anywhere('選挙|선거|انتخابات'),
]

const WON = [
  word('ganhou|venceu|foi eleit[oa]|gan[óo]|venci[óo]|fue elegid[oa]|a gagn[ée]|a remport[ée]|a [ée]t[ée] [ée]lu\\p{L}*|ha vinto|[èe] stat[oa] elett[oa]|gewonnen|gewann|wygra[łl]\\p{L}*|победил\\p{L}*|выиграл\\p{L}*'),
  anywhere('勝ちました|勝った|勝利した|当選した|이겼|승리했|당선|فاز|فازت'),
]

const WILL_WIN = [
  word('vai ganhar|vai vencer|vencer[áa]|ganhar[áa]|ganar[áa]|va a ganar|va gagner|gagnera|vincer[àa]|gewinnen|gewinnt|wygra|победит|выиграет'),
  anywhere('勝ちますか|勝つ|이길|سيفوز|ستفوز'),
]

const RESULTS = [
  word('resultados?|r[ée]sultats?|risultat[oi]|ergebnis\\p{L}*|wynik\\p{L}*|результат\\p{L}*'),
  anywhere('結果|결과|نتائج|نتيجة'),
]

const LATEST = [
  word('[úu]ltim[oa]s|recentes|recientes|derni[èe]res?|r[ée]centes?|ultime|recenti|neueste\\p{L}*|aktuelle\\p{L}*|najnowsz\\p{L}*|ostatni\\p{L}*|последн\\p{L}*|свеж\\p{L}*'),
  anywhere('最新|최신|آخر|أحدث'),
]

const NEWS = [
  word('not[íi]cias|noticias|nouvelles|actualit[ée]s|infos|notizie|nachrichten|neuigkeiten|wiadomo[śs]ci|aktualno[śs]ci|новост\\p{L}*'),
  anywhere('ニュース|뉴스|أخبار|الأخبار'),
]

const any = (patterns: readonly RegExp[], text: string) => patterns.some(pattern => pattern.test(text))

function mentionsPastYear(text: string, currentYear: number): boolean {
  for (const match of text.matchAll(/(?<!\d)(1[5-9]\d{2}|20\d{2})(?!\d)/g)) {
    if (Number(match[1]) < currentYear) return true
  }
  return false
}

/**
 * English live-fact phrasings for a non-English prompt, or '' when none applies. The freshness policy
 * classifies these phrasings exactly as it classifies the same question asked in English.
 */
export function crossLanguageLiveIntent(input: string, now: Date = new Date()): string {
  const text = String(input || '').normalize('NFC')
  if (!text.trim() || mentionsPastYear(text, now.getUTCFullYear())) return ''
  const out: string[] = []
  const asksWho = any(WHO, text)
  const election = any(ELECTION, text)

  const role = ROLES.find(candidate => any(candidate.patterns, text))

  if (asksWho && role && !any(PAST_OFFICE, text)) {
    out.push(any(FUTURE_OR_NEXT, text) ? `who will be the next ${role.english}` : `who is the current ${role.english}`)
  }
  if (asksWho && (election || role)) {
    if (any(WON, text)) out.push('who won the election')
    else if (any(WILL_WIN, text)) out.push('who will win the election')
  }
  if (election && any(RESULTS, text)) out.push('show election results')
  if (any(LATEST, text) && any(NEWS, text)) out.push(election ? 'show latest news about the election' : 'show latest news')

  // Joined without sentence punctuation: the policy treats ". word" as a multi-sentence prompt.
  return out.join(' ; ')
}

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

// MUTABLE-STATE CATEGORIES (2026-10-09, measured: 85/210 non-English live questions routed live before
// this table; see tests/crossLanguageLiveParity.node.test.ts). Each category is a question about a value
// that changes over time. A category fires when every one of its marker groups matches. Markers avoid words
// spelled identically in English so English prompts keep their own routing.
type Category = Readonly<{ english: string; all: readonly (readonly RegExp[])[] }>

const NEW = [
  word('nov[oa]s?|nuev[oa]s?|nouvel(?:le)?s?|nouveaux|nuov[oie]|neue[nrs]?|now[eay]\\p{L}*|нов\\p{L}*'),
  anywhere('新しい|新た|새로운|جديدة|جديد'),
]

const CATEGORIES: readonly Category[] = [
  { english: 'what is the exchange rate today', all: [[
    word('cota[cç][ãa]o|c[âa]mbio|tipo de cambio|cotizaci[óo]n|taux de change|tasso di cambio|wechselkurs\\p{L}*|devisenkurs\\p{L}*|kurs\\p{L}* (?:dolara|euro|walut\\p{L}*|z[łl]otego)|курс\\p{L}* (?:доллар\\p{L}*|евро|рубл\\p{L}*|валют\\p{L}*)'),
    anywhere('為替|환율|سعر (?:ال)?صرف'),
  ]] },
  { english: 'what is the current price', all: [[
    word('pre[çc]o|quanto custa|precio|cu[áa]nto cuesta|prix|combien co[ûu]te|cours de (?:l[\'’]action|bourse)|prezzo|quanto costa|preis\\p{L}*|kurs|wie ?viel kostet|aktie\\p{L}*|cen[aęy]|ile kosztuje|цен[аы]|сколько стоит|стоимост\\p{L}*'),
    anywhere('価格|株価|値段|いくら|가격|주가|얼마|سعر|كم يكلف'),
  ]] },
  { english: 'what is the weather forecast', all: [[
    word('previs[ãa]o do tempo|o tempo em|tempo (?:vai|em)|chover|chuva|qu[ée] tiempo|pron[óo]stico|llover|lluvia|m[ée]t[ée]o|quel temps|pleuvoir|pluie|che tempo|meteo|piover[àa]|piovere|pioggia|wetter|regnet|regen|pogod\\p{L}*|pada[ćc]|deszcz\\p{L}*|погод\\p{L}*|дожд\\p{L}*'),
    anywhere('天気|雨|날씨|비가|الطقس|طقس|ستمطر|تمطر'),
  ]] },
  { english: 'what is the latest score', all: [[
    word('placar|resultado do jogo|resultado del partido|marcador|score du match|risultato della partita|spielstand|ergebnis des spiels|ausgegangen|wynik meczu|сч[её]т'),
    anywhere('スコア|試合結果|점수|경기 결과|نتيجة (?:ال)?مباراة'),
  ]] },
  { english: 'what are the current standings', all: [[
    word('classifica[çc][ãa]o|clasificaci[óo]n|classement|classifica|tabellenstand|tabelle|tabel\\p{L}*|турнирн\\p{L}* таблиц\\p{L}*'),
    anywhere('順位|순위|ترتيب'),
  ]] },
  { english: 'what are the current visa requirements', all: [[
    word('requisitos de visto|visto (?:para|de entrada)|precisa de visto|requisitos de visa|visado|conditions de visa|exigences de visa|requisiti di visto|visto per|visabestimmung\\p{L}*|visum|wiz\\p{L}*|виз\\p{L}*'),
    anywhere('ビザ|査証|비자|تأشيرة|التأشيرة'),
  ]] },
  { english: 'what is the current minimum wage', all: [[
    word('sal[áa]rio m[íi]nimo|salario m[íi]nimo|salaire minimum|smic|salario minimo|mindestlohn|p[łl]ac\\p{L}* minimaln\\p{L}*|минимальн\\p{L}* зарплат\\p{L}*|мрот'),
    anywhere('最低賃金|최저임금|الحد الأدنى للأجور'),
  ]] },
  { english: 'what is the flight status', all: [
    [word('voo|vuelo|vol|volo|flug|lot|рейс'), anywhere('便|항공편|الرحلة')],
    [word('atrasad[oa]|retrasad[oa]|en retard|in ritardo|versp[äa]tung|op[óo][źz]nion\\p{L}*|задерживается|задержан\\p{L}*'), anywhere('遅延|지연|متأخرة|متأخر')],
  ] },
  { english: 'what is the latest version', all: [[
    word('vers[ãa]o mais recente|[úu]ltima vers[ãa]o|[úu]ltima versi[óo]n|versi[óo]n m[áa]s reciente|derni[èe]re version|ultima versione|neueste version|aktuelle version|najnowsz\\p{L}* wersj\\p{L}*|последн\\p{L}* верси\\p{L}*'),
    anywhere('最新バージョン|最新版|최신 버전|أحدث إصدار'),
  ]] },
  { english: 'are there new security vulnerabilities', all: [
    [word('vulnerabilidad\\p{L}*|vuln[ée]rabilit\\p{L}*|failles? de s[ée]curit[ée]|vulnerabilit\\p{L}*|sicherheitsl[üu]cke\\p{L}*|luk\\p{L}* bezpiecze\\p{L}*|уязвимост\\p{L}*'), anywhere('脆弱性|취약점|ثغرات|ثغرة')],
    NEW,
  ] },
  { english: 'is he still alive', all: [[
    word('ainda est[áa] viv[oa]|est[áa] viv[oa]|sigue viv[oa]|toujours en vie|ancora viv[oa]|noch am leben|lebt .{0,40}noch|nadal [żz]yje|czy .{0,30}[żz]yje|жив[аы]?'),
    anywhere('存命|生きて|살아 계|살아있|على قيد الحياة'),
  ]] },
  { english: 'what is the population', all: [[
    word('popula[çc][ãa]o|poblaci[óo]n|nombre d[\'’]habitants|population d[eu]|popolazione|einwohnerzahl|einwohner|bev[öo]lkerung|liczb\\p{L}* ludno[śs]ci|ludno[śs][ćc]|населени\\p{L}*'),
    anywhere('人口|인구|عدد سكان'),
  ]] },
  { english: 'what are the opening hours today', all: [[
    word('que horas .{0,40}abre|hor[áa]rio de funcionamento|est[áa] abert[oa]|a qu[ée] hora abre|horario de apertura|est[áa] abiert[oa]|[àa] quelle heure ouvre|horaires d[\'’]ouverture|est ouvert|a che ora apre|orari di apertura|[èe] apert[oa]|wann [öo]ffnet|[öo]ffnungszeiten|ge[öo]ffnet|o kt[óo]rej .{0,40}otwiera|godziny otwarcia|во сколько .{0,40}открыва\\p{L}*|часы работы'),
    anywhere('何時に開|営業時間|開館|몇 시에 여|영업시간|متى يفتح|ساعات العمل'),
  ]] },
  { english: 'what is the current inflation rate', all: [[
    word('taxa de infla[çc][ãa]o|infla[çc][ãa]o atual|tasa de inflaci[óo]n|inflaci[óo]n actual|taux d[\'’]inflation|tasso di inflazione|inflationsrate|stop\\p{L}* inflacji|уров\\p{L}* инфляци\\p{L}*'),
    anywhere('インフレ率|인플레이션율|물가상승률|معدل التضخم'),
  ]] },
  { english: 'what is the current interest rate', all: [[
    word('taxa de juros|juros atuais|selic|tasa de inter[ée]s|tipos? de inter[ée]s|taux d[\'’]int[ée]r[êe]t|taux directeur|tasso di interesse|leitzins|zinssatz|stop\\p{L}* procentow\\p{L}*|процентн\\p{L}* ставк\\p{L}*|ключев\\p{L}* ставк\\p{L}*'),
    anywhere('金利|금리|سعر الفائدة|أسعار الفائدة'),
  ]] },
]

// Explanation, "why", creative and summarising requests are not live-state lookups in any language, so they are
// never categorised. Spaced languages are matched as an opening word; Japanese, Korean and Arabic by marker.
const CONCEPTUAL_OPENING = new RegExp(`^\\s*[¿¡]?\\s*(?:por ?qu[eé]|porque|explique|explica|expliquez|pourquoi|perch[ée]|spiega|warum|erkl[äa]r\\p{L}*|dlaczego|wyja[śs]nij|почему|объясни\\p{L}*|escreva|escribe|[ée]cri[st]|[ée]crivez|scrivi|schreib\\p{L}*|napisz|напиши|resuma|resume|r[ée]sume|riassumi|fasse|stre[śs][ćc]|кратко)(?![${L}])`, 'iu')
const CONCEPTUAL_MARKER = anywhere('^\\s*(?:なぜ|どうして|왜|لماذا|اشرح|اكتب|لخص)|説明して|書いて|要約して|설명해|써 줘|요약해')
const conceptual = (text: string) => CONCEPTUAL_OPENING.test(text) || CONCEPTUAL_MARKER.test(text)

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
  if (!conceptual(text)) {
    for (const category of CATEGORIES) {
      if (category.all.every(group => any(group, text)) && !out.includes(category.english)) out.push(category.english)
    }
  }
  if (election && any(RESULTS, text)) out.push('show election results')
  if (any(LATEST, text) && any(NEWS, text)) out.push(election ? 'show latest news about the election' : 'show latest news')

  // Joined without sentence punctuation: the policy treats ". word" as a multi-sentence prompt.
  return out.join(' ; ')
}

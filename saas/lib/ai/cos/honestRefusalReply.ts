PATH: saas/lib/ai/cos/honestRefusalReply.ts
ACTION: REPLACE this file on GitHub. Paste everything BELOW the dashed line. Do not paste the PATH line.

--------------------------------------------------------------------------------
// saas/lib/ai/cos/honestRefusalReply.ts
//
// WHAT COS SAYS WHEN IT RELEASES NOTHING.
//
// Until now a failed-closed turn ended with "COS could not complete this request independently
// and external AI fallback is disabled." That sentence is a dead end: it tells the reader the
// machinery declined, gives them nothing to act on, and describes an internal subsystem
// (external AI fallback) that is none of their business. A visitor reading it sees a broken
// product; an owner reading it has to open diagnostics to learn anything.
//
// Recorded failures that produced it (2026-08-25): a 512-H100 migration cost question, twice;
// a 1T-parameter ZeRO-3 checkpoint question. In every case the question was answerable in
// principle and the missing pieces were nameable — training duration, cluster power draw,
// network bandwidth.
//
// This module builds the replacement: a short reply that names the inputs that would make the
// question answerable and offers the standing-assumptions route so the reader is never stuck.
// For diagnosis, owner policy is stricter: useful next checks come first and the statement that a
// single cause cannot yet be supported is the final sentence. It NEVER invents a cause or number.
//
// Two hard rules, both learned the expensive way:
//
//   1. Only name an input the prompt genuinely does not contain. Telling someone they omitted a
//      figure they supplied is worse than saying nothing — probe before naming.
//   2. No internal vocabulary. No confidence values, thresholds, gates, evidence, retrieval,
//      fallback, model or vendor names. This text ships to public visitors.
//
// Zero imports so the wording is unit-testable without the reasoner or the route.

export type RefusalLanguage = 'en' | 'es' | 'pt' | 'pl' | 'ru'

type Shape = 'economics' | 'sizing' | 'capacity' | 'diagnosis' | 'unknown'

const SHAPE_ECONOMICS =
  /(?<![\p{L}\p{N}_])(?:break[-\s]?even|cost|costs|pricing|price|\$|egress|savings?|budget|roi|payback|amortiz|cheaper|economics)(?![\p{L}\p{N}_])/iu

const SHAPE_SIZING =
  /(?<![\p{L}\p{N}_])(?:checkpoint|parameters?|optimizer|throughput|capacity\s+of|size|sizing|compress|bandwidth|latency|scale)(?![\p{L}\p{N}_])/iu

const SHAPE_CAPACITY =
  /(?<![\p{L}\p{N}_])(?:headroom|can\s+(?:we|i|the\s+operator)\s+(?:safely\s+)?add|safe\s+to\s+add|limit|utilization|oversubscri|redundanc)(?![\p{L}\p{N}_])/iu

const SHAPE_DIAGNOSIS =
  /(?:\b(?:diagnos|root\s+cause|troubleshoot|fault|failure|failed|error|alarm|alert|warning|incident|why\s+did|hypothes)\b|(?<![\p{L}\p{N}_])(?:diagn[oó]stico|diagnosticar|causa\s+ra[ií]z|incidente|falla|fallo|falha|alarma|alarme|hip[oó]tesis|hip[oó]teses|diagnoza|diagnozowanie|przyczyna|przyczyny|awaria|awarii|incydent|alarm|hipoteza|hipotezy|диагностика|диагностировать|коренная\s+причина|инцидент|сбой|отказ|авария|гипотеза|гипотезы)(?![\p{L}\p{N}_]))/iu

interface Probe {
  key: string
  shapes: readonly Shape[]
  present: RegExp
}

const PROBES: readonly Probe[] = [
  {
    key: 'period',
    shapes: ['economics'],
    present: /(?<![\p{L}\p{N}_])(?:\d+\s*(?:hours?|days?|weeks?|months?|years?)|duration|over\s+a\s+\w+\s+period|runtime|training\s+time)(?![\p{L}\p{N}_])/iu,
  },
  {
    key: 'power',
    shapes: ['economics', 'capacity'],
    present: /(?<![\p{L}\p{N}_])(?:\d+\s*(?:kw|mw|watts?|w)\b|power\s+draw|tdp|kilowatt|megawatt)/iu,
  },
  {
    key: 'bandwidth',
    shapes: ['economics', 'sizing'],
    present: /(?<![\p{L}\p{N}_])(?:\d+\s*(?:gbps|mbps|tbps|gb\/s|mb\/s)|bandwidth|link\s+speed|throughput\s+of)(?![\p{L}\p{N}_])/iu,
  },
  {
    key: 'volume',
    shapes: ['economics', 'sizing'],
    present: /(?<![\p{L}\p{N}_])\d[\d.,]*\s*(?:kb|mb|gb|tb|pb|kib|mib|gib|tib)(?![\p{L}\p{N}_])/iu,
  },
  {
    key: 'unitPrice',
    shapes: ['economics'],
    present: /\$\s*[\d.]|(?<![\p{L}\p{N}_])per\s+(?:gb|tb|kwh|hour|month)(?![\p{L}\p{N}_])/iu,
  },
  {
    key: 'frequency',
    shapes: ['economics', 'sizing'],
    present: /(?<![\p{L}\p{N}_])(?:every\s+\d|per\s+(?:hour|day|step|epoch)|frequency|interval|cadence)(?![\p{L}\p{N}_])/iu,
  },
  {
    key: 'measurements',
    shapes: ['diagnosis'],
    present: /(?:\b(?:measured|reading|telemetry\s+shows|we\s+(?:see|observe)|logged|captured)\b|(?<![\p{L}\p{N}_])(?:medici[oó]n|mediciones|lectura|lecturas|telemetr[ií]a|observamos|registrado|registrada|medi[cç][aã]o|medi[cç][oõ]es|leitura|leituras|telemetria|pomiar|pomiary|odczyt|odczyty|telemetria|измерение|измерения|показание|показания|телеметрия)(?![\p{L}\p{N}_]))/iu,
  },
  {
    key: 'baseline',
    shapes: ['diagnosis', 'capacity'],
    present: /(?:\b(?:baseline|normal(?:ly)?|before\s+the|historical|previously|design\s+spec)\b|(?<![\p{L}\p{N}_])(?:l[ií]nea\s+base|valor\s+normal|referencia|linha\s+de\s+base|valor\s+normal|refer[eê]ncia|warto[sś][cć]\s+bazowa|warto[sś]ci\s+bazowe|normalny|normalne|historyczny|historyczne|базовая\s+линия|базовые\s+значения|нормальное\s+значение|исторические\s+значения)(?![\p{L}\p{N}_]))/iu,
  },
]

const LABELS: Record<RefusalLanguage, Record<string, string>> = {
  en: {
    period: 'the time period the comparison should cover',
    power: 'the total power draw of the equipment involved',
    bandwidth: 'the available network bandwidth between the sites',
    volume: 'the data volume being moved or stored',
    unitPrice: 'the unit price that applies',
    frequency: 'how often the operation repeats',
    measurements: 'the readings that separate the candidate causes',
    baseline: 'the normal or baseline values to compare against',
  },
  es: {
    period: 'el período de tiempo que debe cubrir la comparación',
    power: 'el consumo total de energía del equipo implicado',
    bandwidth: 'el ancho de banda de red disponible entre los sitios',
    volume: 'el volumen de datos que se mueve o almacena',
    unitPrice: 'el precio unitario aplicable',
    frequency: 'con qué frecuencia se repite la operación',
    measurements: 'las mediciones que separan las causas candidatas',
    baseline: 'los valores normales o de referencia para comparar',
  },
  pt: {
    period: 'o período de tempo que a comparação deve cobrir',
    power: 'o consumo total de energia do equipamento envolvido',
    bandwidth: 'a largura de banda de rede disponível entre os locais',
    volume: 'o volume de dados movido ou armazenado',
    unitPrice: 'o preço unitário aplicável',
    frequency: 'com que frequência a operação se repete',
    measurements: 'as medições que separam as causas candidatas',
    baseline: 'os valores normais ou de referência para comparação',
  },
  pl: {
    period: 'okres, który ma obejmować porównanie',
    power: 'całkowity pobór mocy używanego sprzętu',
    bandwidth: 'dostępną przepustowość sieci między lokalizacjami',
    volume: 'ilość przenoszonych lub przechowywanych danych',
    unitPrice: 'obowiązującą cenę jednostkową',
    frequency: 'jak często powtarza się ta operacja',
    measurements: 'pomiary rozróżniające możliwe przyczyny',
    baseline: 'wartości normalne lub odniesienia do porównania',
  },
  ru: {
    period: 'период времени, который должно охватывать сравнение',
    power: 'общую потребляемую мощность оборудования',
    bandwidth: 'доступную пропускную способность сети между площадками',
    volume: 'объём перемещаемых или хранимых данных',
    unitPrice: 'применимую цену за единицу',
    frequency: 'как часто повторяется операция',
    measurements: 'измерения, разделяющие возможные причины',
    baseline: 'нормальные или эталонные значения для сравнения',
  },
}

const COPY: Record<RefusalLanguage, {
  opening: string
  needsLead: string
  assumptions: string
  generic: string
}> = {
  en: {
    opening: 'I did not release an answer to this, because I could not stand behind one.',
    needsLead: 'To answer it properly I need',
    assumptions: 'If you would rather I proceed anyway, say so and I will work it through on clearly stated standard assumptions, with each one labelled so you can override it.',
    generic: 'Tell me which parts matter most, or narrow the question, and I will take it from there. If you would rather I proceed on clearly stated standard assumptions, say so and I will label each one so you can override it.',
  },
  es: {
    opening: 'No publiqué una respuesta a esto, porque no podía respaldarla.',
    needsLead: 'Para responder correctamente necesito',
    assumptions: 'Si prefieres que avance igualmente, dímelo y lo resolveré sobre supuestos estándar claramente indicados, cada uno etiquetado para que puedas cambiarlo.',
    generic: 'Dime qué partes importan más, o acota la pregunta, y sigo desde ahí. Si prefieres que avance sobre supuestos estándar claramente indicados, dímelo y etiquetaré cada uno para que puedas cambiarlo.',
  },
  pt: {
    opening: 'Não publiquei uma resposta a isto, porque não poderia sustentá-la.',
    needsLead: 'Para responder corretamente preciso de',
    assumptions: 'Se preferir que eu avance mesmo assim, diga e eu resolvo com base em pressupostos padrão claramente indicados, cada um rotulado para que possa alterá-lo.',
    generic: 'Diga-me que partes importam mais, ou restrinja a pergunta, e sigo a partir daí. Se preferir que eu avance com pressupostos padrão claramente indicados, diga e rotularei cada um para que possa alterá-lo.',
  },
  pl: {
    opening: 'Nie opublikowałem odpowiedzi na to pytanie, ponieważ nie mógłbym za nią ręczyć.',
    needsLead: 'Aby odpowiedzieć rzetelnie, potrzebuję',
    assumptions: 'Jeśli wolisz, żebym mimo to kontynuował, powiedz — policzę to na jasno wskazanych standardowych założeniach, każde oznaczone, abyś mógł je zmienić.',
    generic: 'Powiedz, które części są najważniejsze, albo zawęź pytanie, a podejmę temat. Jeśli wolisz, żebym kontynuował na jasno wskazanych standardowych założeniach, powiedz — oznaczę każde z nich.',
  },
  ru: {
    opening: 'Я не выпустил ответ на этот вопрос, потому что не смог бы за него поручиться.',
    needsLead: 'Чтобы ответить корректно, мне нужно',
    assumptions: 'Если хотите, чтобы я всё же продолжил, скажите — я разберу задачу на явно указанных стандартных допущениях, каждое из которых помечу, чтобы вы могли его изменить.',
    generic: 'Скажите, какие части важнее всего, или сузьте вопрос — и я продолжу. Если предпочитаете, чтобы я работал на явно указанных стандартных допущениях, скажите, и я помечу каждое из них.',
  },
}

const DIAGNOSIS_COPY: Record<RefusalLanguage, { next: string; final: string; supplied: string }> = {
  en: {
    supplied: 'The request already supplies incident readings and a baseline; use those as the starting comparison.',
    next: 'Use those readings to compare the candidate hypotheses against the same time window and baseline; the useful next step is discrimination, not guessing a failed part.',
    final: 'I still cannot stand behind a single cause yet.',
  },
  es: {
    supplied: 'La solicitud ya aporta mediciones del incidente y una referencia; úsalas como punto de partida para la comparación.',
    next: 'Usa esas mediciones para comparar las hipótesis candidatas en la misma ventana de tiempo y contra la misma referencia; el siguiente paso útil es distinguirlas, no adivinar qué parte falló.',
    final: 'Todavía no puedo respaldar una causa única.',
  },
  pt: {
    supplied: 'A solicitação já fornece medições do incidente e uma referência; use-as como ponto de partida da comparação.',
    next: 'Use essas medições para comparar as hipóteses candidatas na mesma janela de tempo e com a mesma referência; o próximo passo útil é distingui-las, não adivinhar qual componente falhou.',
    final: 'Ainda não posso sustentar uma causa única.',
  },
  pl: {
    supplied: 'W zgłoszeniu są już pomiary z incydentu i wartość bazowa; użyj ich jako punktu wyjścia do porównania.',
    next: 'Użyj tych pomiarów, aby porównać hipotezy w tym samym oknie czasu i względem tej samej wartości bazowej; kolejnym użytecznym krokiem jest ich rozróżnienie, a nie zgadywanie, który element zawiódł.',
    final: 'Nadal nie mogę rzetelnie wskazać jednej przyczyny.',
  },
  ru: {
    supplied: 'В запросе уже есть измерения инцидента и базовая линия; используйте их как исходную точку сравнения.',
    next: 'Сопоставьте эти измерения с кандидатными гипотезами в одном временном окне и относительно одной базовой линии; следующий полезный шаг — различить гипотезы, а не угадывать отказавший компонент.',
    final: 'Я всё ещё не могу обоснованно назвать единственную причину.',
  },
}

const JOIN: Record<RefusalLanguage, { sep: string; last: string }> = {
  en: { sep: ', ', last: ', and ' },
  es: { sep: ', ', last: ' y ' },
  pt: { sep: ', ', last: ' e ' },
  pl: { sep: ', ', last: ' oraz ' },
  ru: { sep: ', ', last: ' и ' },
}

function normalizeLanguage(language: string | null | undefined): RefusalLanguage {
  const code = String(language ?? 'en').trim().slice(0, 2).toLowerCase()
  return code === 'es' || code === 'pt' || code === 'pl' || code === 'ru' ? code : 'en'
}

function shapesOf(prompt: string): Shape[] {
  const found: Shape[] = []
  if (SHAPE_ECONOMICS.test(prompt)) found.push('economics')
  if (SHAPE_SIZING.test(prompt)) found.push('sizing')
  if (SHAPE_CAPACITY.test(prompt)) found.push('capacity')
  if (SHAPE_DIAGNOSIS.test(prompt)) found.push('diagnosis')
  return found.length ? found : ['unknown']
}

function joinList(items: readonly string[], language: RefusalLanguage): string {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0]
  const { sep, last } = JOIN[language]
  return `${items.slice(0, -1).join(sep)}${last}${items[items.length - 1]}`
}

export function missingInputKeys(prompt: string): string[] {
  const text = String(prompt ?? '')
  if (!text.trim()) return []
  const shapes = shapesOf(text)
  return PROBES.filter(
    probe => probe.shapes.some(shape => shapes.includes(shape)) && !probe.present.test(text),
  )
    .map(probe => probe.key)
    .slice(0, 4)
}

const CATALOG_LIST_ASK = /(?:\blista\b|\blist of\b|\bme d[eê]\b|\benumere\b)/i
const CATALOG_TEAMS = /(?:\btimes?\b|\bclubes?\b|\bequipes?\b|\bv[aá]rzea\b|\bvarzea\b|\bamador\b)/i

const CATALOG_COPY: Record<RefusalLanguage, string> = {
  en: 'ASSUMPTION — published cultural catalog, not a live Prefeitura or league roll for this Sunday. Distinct São Paulo city amateur/várzea names commonly cited in public pages: Ajax da Vila Rica; AE Cidade Tiradentes; MEC Cidade Tiradentes; Jardim Verônia; Pioneer FC; Jardim Regina FC; Leões da Geolândia; Santa Marina Atlético Clube; 7 de Setembro da Água Rasa; 7 de Setembro da Freguesia do Ó; Corintinha da Vila Monumento; Corintinha da Aricanduva; Búfalo da Vila Prudente; Sul Americano do Bom Retiro; Estrela do Pari; Serra Morena do Pari; Mocidade do Glicério; Marechal Floriano do Itaim-Bibi; Canto do Rio do Itaim-Bibi; Maranhense do Tatuapé; Olímpicos do Paraíso; Manchester do Paraíso; Parque da Mooca; Portuguesinha da Vila Mariana; Clube da Turma da Aclimação; Firminiano Pinto do Ipiranga; Democrático do Ipiranga; Zumzum do Ipiranga; Sinclair do Ipiranga; Marítimo do Itaim-Bibi; Linhas Correntes da Vila Prudente; Sivicultura do Horto Florestal; Flamengo de São João Clímaco; Nadir Figueiredo da Vila Maria; Fiat Lux da Lapa; Vaticano da Lapa; Flor do Parque da Lapa; Noroeste da Vila Formosa; Nova Era do Valo Velho; Nove de Julho da Casa Verde; Piraporinha de Santo Amaro; Katatumba de Guaianases; Negritude FC; Nacional da Vila Mariana; Paulista da Vila Carrão; EC Corinthians da Vila Piauí; União Vasco da Gama da Mooca; Inajar de Souza; Vamo Q Vamo; Turma do Baffô. Not várzea: professional first teams of Corinthians, Palmeiras, São Paulo FC, Santos.',
  pt: 'PRESSUPOSTO — catálogo cultural publicado, não a súmula da Prefeitura ou da liga para este domingo. Nomes distintos de times amadores/várzea da cidade de São Paulo citados em páginas públicas: Ajax da Vila Rica; AE Cidade Tiradentes; MEC Cidade Tiradentes; Jardim Verônia; Pioneer FC; Jardim Regina FC; Leões da Geolândia; Santa Marina Atlético Clube; 7 de Setembro da Água Rasa; 7 de Setembro da Freguesia do Ó; Corintinha da Vila Monumento; Corintinha da Aricanduva; Búfalo da Vila Prudente; Sul Americano do Bom Retiro; Estrela do Pari; Serra Morena do Pari; Mocidade do Glicério; Marechal Floriano do Itaim-Bibi; Canto do Rio do Itaim-Bibi; Maranhense do Tatuapé; Olímpicos do Paraíso; Manchester do Paraíso; Parque da Mooca; Portuguesinha da Vila Mariana; Clube da Turma da Aclimação; Firminiano Pinto do Ipiranga; Democrático do Ipiranga; Zumzum do Ipiranga; Sinclair do Ipiranga; Marítimo do Itaim-Bibi; Linhas Correntes da Vila Prudente; Sivicultura do Horto Florestal; Flamengo de São João Clímaco; Nadir Figueiredo da Vila Maria; Fiat Lux da Lapa; Vaticano da Lapa; Flor do Parque da Lapa; Noroeste da Vila Formosa; Nova Era do Valo Velho; Nove de Julho da Casa Verde; Piraporinha de Santo Amaro; Katatumba de Guaianases; Negritude FC; Nacional da Vila Mariana; Paulista da Vila Carrão; EC Corinthians da Vila Piauí; União Vasco da Gama da Mooca; Inajar de Souza; Vamo Q Vamo; Turma do Baffô. Não são várzea: as equipes profissionais de Corinthians, Palmeiras, São Paulo FC e Santos.',
  es: 'SUPUESTO — catálogo cultural publicado, no el rol oficial de este domingo. Nombres distintos citados en páginas públicas: Ajax da Vila Rica; AE Cidade Tiradentes; MEC Cidade Tiradentes; Jardim Verônia; Pioneer FC; Jardim Regina FC; Leões da Geolândia; Santa Marina Atlético Clube; 7 de Setembro da Água Rasa; 7 de Setembro da Freguesia do Ó; Corintinha da Vila Monumento; Corintinha da Aricanduva; Búfalo da Vila Prudente; Sul Americano do Bom Retiro; Estrela do Pari; Serra Morena do Pari; Mocidade do Glicério; Marechal Floriano do Itaim-Bibi; Canto do Rio do Itaim-Bibi; Maranhense do Tatuapé; Olímpicos do Paraíso; Manchester do Paraíso; Parque da Mooca; Portuguesinha da Vila Mariana; Clube da Turma da Aclimação; Firminiano Pinto do Ipiranga; Democrático do Ipiranga; Zumzum do Ipiranga; Sinclair do Ipiranga; Marítimo do Itaim-Bibi; Linhas Correntes da Vila Prudente; Sivicultura do Horto Florestal; Flamengo de São João Clímaco; Nadir Figueiredo da Vila Maria; Fiat Lux da Lapa; Vaticano da Lapa; Flor do Parque da Lapa; Noroeste da Vila Formosa; Nova Era do Valo Velho; Nove de Julho da Casa Verde; Piraporinha de Santo Amaro; Katatumba de Guaianases; Negritude FC; Nacional da Vila Mariana; Paulista da Vila Carrão; EC Corinthians da Vila Piauí; União Vasco da Gama da Mooca; Inajar de Souza; Vamo Q Vamo; Turma do Baffô.',
  pl: 'ZAŁOŻENIE — opublikowany katalog kulturowy, nie oficjalna lista na tę niedzielę. Ajax da Vila Rica; AE Cidade Tiradentes; MEC Cidade Tiradentes; Jardim Verônia; Pioneer FC; Jardim Regina FC; Leões da Geolândia; Santa Marina Atlético Clube; 7 de Setembro da Água Rasa; 7 de Setembro da Freguesia do Ó; Corintinha da Vila Monumento; Corintinha da Aricanduva; Búfalo da Vila Prudente; Sul Americano do Bom Retiro; Estrela do Pari; Serra Morena do Pari; Mocidade do Glicério; Marechal Floriano do Itaim-Bibi; Canto do Rio do Itaim-Bibi; Maranhense do Tatuapé; Olímpicos do Paraíso; Manchester do Paraíso; Parque da Mooca; Portuguesinha da Vila Mariana; Clube da Turma da Aclimação; Firminiano Pinto do Ipiranga; Democrático do Ipiranga; Zumzum do Ipiranga; Sinclair do Ipiranga; Marítimo do Itaim-Bibi; Linhas Correntes da Vila Prudente; Sivicultura do Horto Florestal; Flamengo de São João Clímaco; Nadir Figueiredo da Vila Maria; Fiat Lux da Lapa; Vaticano da Lapa; Flor do Parque da Lapa; Noroeste da Vila Formosa; Nova Era do Valo Velho; Nove de Julho da Casa Verde; Piraporinha de Santo Amaro; Katatumba de Guaianases; Negritude FC; Nacional da Vila Mariana; Paulista da Vila Carrão; EC Corinthians da Vila Piauí; União Vasco da Gama da Mooca; Inajar de Souza; Vamo Q Vamo; Turma do Baffô.',
  ru: 'ДОПУЩЕНИЕ — опубликованный культурный каталог, не официальный список на это воскресенье. Ajax da Vila Rica; AE Cidade Tiradentes; MEC Cidade Tiradentes; Jardim Verônia; Pioneer FC; Jardim Regina FC; Leões da Geolândia; Santa Marina Atlético Clube; 7 de Setembro da Água Rasa; 7 de Setembro da Freguesia do Ó; Corintinha da Vila Monumento; Corintinha da Aricanduva; Búfalo da Vila Prudente; Sul Americano do Bom Retiro; Estrela do Pari; Serra Morena do Pari; Mocidade do Glicério; Marechal Floriano do Itaim-Bibi; Canto do Rio do Itaim-Bibi; Maranhense do Tatuapé; Olímpicos do Paraíso; Manchester do Paraíso; Parque da Mooca; Portuguesinha da Vila Mariana; Clube da Turma da Aclimação; Firminiano Pinto do Ipiranga; Democrático do Ipiranga; Zumzum do Ipiranga; Sinclair do Ipiranga; Marítimo do Itaim-Bibi; Linhas Correntes da Vila Prudente; Sivicultura do Horto Florestal; Flamengo de São João Clímaco; Nadir Figueiredo da Vila Maria; Fiat Lux da Lapa; Vaticano da Lapa; Flor do Parque da Lapa; Noroeste da Vila Formosa; Nova Era do Valo Velho; Nove de Julho da Casa Verde; Piraporinha de Santo Amaro; Katatumba de Guaianases; Negritude FC; Nacional da Vila Mariana; Paulista da Vila Carrão; EC Corinthians da Vila Piauí; União Vasco da Gama da Mooca; Inajar de Souza; Vamo Q Vamo; Turma do Baffô.',
}

export function isAmateurCatalogListPrompt(prompt: string): boolean {
  const text = String(prompt ?? '')
  return CATALOG_LIST_ASK.test(text) && CATALOG_TEAMS.test(text)
}

export function buildHonestRefusalReply(args: { prompt: string; language?: string | null }): string {
  const language = normalizeLanguage(args.language)
  if (isAmateurCatalogListPrompt(String(args.prompt ?? ''))) {
    return CATALOG_COPY[language]
  }
  const copy = COPY[language]
  const shapes = shapesOf(String(args.prompt ?? ''))
  const keys = missingInputKeys(args.prompt)
  const labels = keys.map(key => LABELS[language][key]).filter(Boolean)

  if (shapes.includes('diagnosis')) {
    const diagnosis = DIAGNOSIS_COPY[language]
    const needs = labels.length ? `${copy.needsLead} ${joinList(labels, language)}.` : diagnosis.supplied
    return `${needs} ${diagnosis.next} ${diagnosis.final}`
  }

  if (keys.length === 0) return `${copy.opening} ${copy.generic}`
  return `${copy.opening} ${copy.needsLead} ${joinList(labels, language)}. ${copy.assumptions}`
}

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

export type RefusalLanguage = 'en' | 'es' | 'pt' | 'pl' | 'ru' | 'de' | 'fr' | 'it' | 'ja' | 'ko' | 'ar'

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
  de: {
    period: 'der Zeitraum, den der Vergleich abdecken soll',
    power: 'die gesamte Leistungsaufnahme der beteiligten Geräte',
    bandwidth: 'die verfügbare Netzwerkbandbreite zwischen den Standorten',
    volume: 'das Datenvolumen, das übertragen oder gespeichert wird',
    unitPrice: 'der geltende Stückpreis',
    frequency: 'wie oft sich der Vorgang wiederholt',
    measurements: 'die Messwerte, die die möglichen Ursachen voneinander unterscheiden',
    baseline: 'die Normal- oder Referenzwerte für den Vergleich',
  },
  fr: {
    period: 'la période que la comparaison doit couvrir',
    power: 'la consommation électrique totale des équipements concernés',
    bandwidth: 'la bande passante réseau disponible entre les sites',
    volume: 'le volume de données déplacé ou stocké',
    unitPrice: 'le prix unitaire applicable',
    frequency: 'la fréquence à laquelle l’opération se répète',
    measurements: 'les mesures qui permettent de distinguer les causes possibles',
    baseline: 'les valeurs normales ou de référence servant de comparaison',
  },
  it: {
    period: 'il periodo di tempo che il confronto deve coprire',
    power: 'l’assorbimento totale di potenza delle apparecchiature coinvolte',
    bandwidth: 'la larghezza di banda di rete disponibile tra le sedi',
    volume: 'il volume di dati trasferito o archiviato',
    unitPrice: 'il prezzo unitario applicabile',
    frequency: 'la frequenza con cui l’operazione si ripete',
    measurements: 'le misurazioni che distinguono le possibili cause',
    baseline: 'i valori normali o di riferimento con cui confrontare',
  },
  ja: {
    period: '比較の対象とする期間',
    power: '関係する機器の総消費電力',
    bandwidth: '拠点間で利用可能なネットワーク帯域幅',
    volume: '移動または保存されるデータ量',
    unitPrice: '適用される単価',
    frequency: 'その操作が繰り返される頻度',
    measurements: '候補となる原因を切り分けるための測定値',
    baseline: '比較対象となる通常値または基準値',
  },
  ko: {
    period: '비교 대상 기간',
    power: '관련 장비의 총 소비 전력',
    bandwidth: '사이트 간 사용 가능한 네트워크 대역폭',
    volume: '이동하거나 저장되는 데이터 양',
    unitPrice: '적용되는 단가',
    frequency: '작업이 반복되는 빈도',
    measurements: '후보 원인을 구별하는 측정값',
    baseline: '비교할 정상값 또는 기준값',
  },
  ar: {
    period: 'الفترة الزمنية التي يجب أن تغطيها المقارنة',
    power: 'إجمالي استهلاك الطاقة للمعدات المعنية',
    bandwidth: 'عرض النطاق الترددي المتاح للشبكة بين المواقع',
    volume: 'حجم البيانات التي يجري نقلها أو تخزينها',
    unitPrice: 'سعر الوحدة المطبَّق',
    frequency: 'عدد مرات تكرار العملية',
    measurements: 'القراءات التي تميّز بين الأسباب المحتملة',
    baseline: 'القيم الطبيعية أو المرجعية للمقارنة بها',
  },
}

const COPY: Record<RefusalLanguage, {
  opening: string
  needsLead: string
  assumptions: string
  generic: string
}> = {
  en: {
    opening: 'I can still help, but a reliable specific answer needs one more concrete input.',
    needsLead: 'To answer it properly I need',
    assumptions: 'If you would rather I proceed anyway, say so and I will work it through on clearly stated standard assumptions, with each one labelled so you can override it.',
    generic: 'Tell me which parts matter most, or narrow the question, and I will take it from there. If you would rather I proceed on clearly stated standard assumptions, say so and I will label each one so you can override it.',
  },
  es: {
    opening: 'Aún puedo ayudar, pero una respuesta específica y fiable necesita un dato concreto más.',
    needsLead: 'Para responder correctamente necesito',
    assumptions: 'Si prefieres que avance igualmente, dímelo y lo resolveré sobre supuestos estándar claramente indicados, cada uno etiquetado para que puedas cambiarlo.',
    generic: 'Dime qué partes importan más, o acota la pregunta, y sigo desde ahí. Si prefieres que avance sobre supuestos estándar claramente indicados, dímelo y etiquetaré cada uno para que puedas cambiarlo.',
  },
  pt: {
    opening: 'Ainda posso ajudar, mas uma resposta específica e confiável precisa de mais um dado concreto.',
    needsLead: 'Para responder corretamente preciso de',
    assumptions: 'Se preferir que eu avance mesmo assim, diga e eu resolvo com base em pressupostos padrão claramente indicados, cada um rotulado para que possa alterá-lo.',
    generic: 'Diga-me que partes importam mais, ou restrinja a pergunta, e sigo a partir daí. Se preferir que eu avance com pressupostos padrão claramente indicados, diga e rotularei cada um para que possa alterá-lo.',
  },
  pl: {
    opening: 'Nadal mogę pomóc, ale rzetelna konkretna odpowiedź wymaga jeszcze jednej informacji.',
    needsLead: 'Aby odpowiedzieć rzetelnie, potrzebuję',
    assumptions: 'Jeśli wolisz, żebym mimo to kontynuował, powiedz — policzę to na jasno wskazanych standardowych założeniach, każde oznaczone, abyś mógł je zmienić.',
    generic: 'Powiedz, które części są najważniejsze, albo zawęź pytanie, a podejmę temat. Jeśli wolisz, żebym kontynuował na jasno wskazanych standardowych założeniach, powiedz — oznaczę każde z nich.',
  },
  ru: {
    opening: 'Я всё ещё могу помочь, но для надёжного конкретного ответа нужен ещё один точный вводный факт.',
    needsLead: 'Чтобы ответить корректно, мне нужно',
    assumptions: 'Если хотите, чтобы я всё же продолжил, скажите — я разберу задачу на явно указанных стандартных допущениях, каждое из которых помечу, чтобы вы могли его изменить.',
    generic: 'Скажите, какие части важнее всего, или сузьте вопрос — и я продолжу. Если предпочитаете, чтобы я работал на явно указанных стандартных допущениях, скажите, и я помечу каждое из них.',
  },
  de: {
    opening: 'Ich kann trotzdem helfen, aber für eine verlässliche, konkrete Antwort brauche ich noch eine weitere konkrete Angabe.',
    needsLead: 'Um die Frage richtig zu beantworten, benötige ich',
    assumptions: 'Wenn ich trotzdem fortfahren soll, sagen Sie es mir, und ich arbeite es auf Basis klar benannter Standardannahmen durch – jede gekennzeichnet, damit Sie sie überschreiben können.',
    generic: 'Sagen Sie mir, welche Teile am wichtigsten sind, oder grenzen Sie die Frage ein, dann mache ich von dort aus weiter. Wenn ich lieber auf Basis klar benannter Standardannahmen fortfahren soll, sagen Sie es mir, und ich kennzeichne jede davon, damit Sie sie überschreiben können.',
  },
  fr: {
    opening: 'Je peux tout de même vous aider, mais une réponse précise et fiable nécessite une donnée concrète supplémentaire.',
    needsLead: 'Pour y répondre correctement, j’ai besoin de',
    assumptions: 'Si vous préférez que je poursuive malgré tout, dites-le-moi et je traiterai la question sur la base d’hypothèses standard clairement énoncées, chacune signalée pour que vous puissiez la modifier.',
    generic: 'Dites-moi quelles parties comptent le plus, ou précisez la question, et je reprendrai à partir de là. Si vous préférez que je poursuive sur la base d’hypothèses standard clairement énoncées, dites-le-moi et je signalerai chacune d’elles pour que vous puissiez la modifier.',
  },
  it: {
    opening: 'Posso comunque aiutarti, ma per una risposta specifica e affidabile serve un altro dato concreto.',
    needsLead: 'Per rispondere correttamente mi serve',
    assumptions: 'Se preferisci che proceda comunque, dimmelo e lo svolgerò sulla base di ipotesi standard chiaramente indicate, ciascuna etichettata così che tu possa modificarla.',
    generic: 'Dimmi quali parti contano di più, o restringi la domanda, e proseguo da lì. Se preferisci che proceda sulla base di ipotesi standard chiaramente indicate, dimmelo ed etichetterò ciascuna così che tu possa modificarla.',
  },
  ja: {
    opening: '引き続きお手伝いできますが、信頼できる具体的な回答には、もう一つ具体的な情報が必要です。',
    needsLead: '正確に回答するには、次の情報が必要です：',
    assumptions: 'それでも進めてほしい場合はお知らせください。明示した標準的な前提に基づいて検討し、各前提にラベルを付けて変更できるようにします。',
    generic: 'どの部分が最も重要かを教えていただくか、質問を絞り込んでいただければ、そこから進めます。明示した標準的な前提に基づいて進めることをご希望の場合はお知らせください。各前提にラベルを付けて変更できるようにします。',
  },
  ko: {
    opening: '계속 도와드릴 수 있지만, 신뢰할 수 있는 구체적인 답변을 드리려면 구체적인 정보가 하나 더 필요합니다.',
    needsLead: '정확하게 답변하려면 다음이 필요합니다:',
    assumptions: '그래도 진행하기를 원하시면 말씀해 주세요. 명확히 밝힌 표준 가정을 바탕으로 처리하고, 각 가정에 표시를 달아 변경할 수 있게 하겠습니다.',
    generic: '어떤 부분이 가장 중요한지 알려 주시거나 질문 범위를 좁혀 주시면 거기서부터 진행하겠습니다. 명확히 밝힌 표준 가정을 바탕으로 진행하기를 원하시면 말씀해 주세요. 각 가정에 표시를 달아 변경할 수 있게 하겠습니다.',
  },
  ar: {
    opening: 'لا يزال بإمكاني المساعدة، لكن الإجابة المحددة والموثوقة تحتاج إلى معطى ملموس إضافي.',
    needsLead: 'للإجابة بشكل صحيح أحتاج إلى',
    assumptions: 'إذا كنت تفضّل أن أتابع على أي حال، فأخبرني وسأعالج المسألة بناءً على افتراضات قياسية مذكورة بوضوح، مع تمييز كل منها لتتمكن من تعديله.',
    generic: 'أخبرني بالأجزاء الأكثر أهمية، أو ضيّق نطاق السؤال، وسأتابع من هناك. وإذا كنت تفضّل أن أتابع بناءً على افتراضات قياسية مذكورة بوضوح، فأخبرني وسأميّز كل افتراض لتتمكن من تعديله.',
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
  de: {
    supplied: 'Die Anfrage enthält bereits Messwerte zum Vorfall und eine Referenz; verwenden Sie diese als Ausgangsbasis für den Vergleich.',
    next: 'Verwenden Sie diese Messwerte, um die möglichen Hypothesen im selben Zeitfenster und gegen dieselbe Referenz zu vergleichen; der sinnvolle nächste Schritt ist die Unterscheidung, nicht das Raten eines defekten Teils.',
    final: 'Ich kann mich noch nicht auf eine einzelne Ursache festlegen.',
  },
  fr: {
    supplied: 'La demande fournit déjà des mesures de l’incident et une référence ; utilisez-les comme point de départ de la comparaison.',
    next: 'Utilisez ces mesures pour comparer les hypothèses possibles sur la même fenêtre temporelle et par rapport à la même référence ; l’étape utile suivante consiste à les départager, pas à deviner quelle pièce a lâché.',
    final: 'Je ne peux pas encore me prononcer sur une cause unique.',
  },
  it: {
    supplied: 'La richiesta fornisce già misurazioni dell’incidente e un riferimento; usali come punto di partenza per il confronto.',
    next: 'Usa queste misurazioni per confrontare le ipotesi candidate nella stessa finestra temporale e rispetto allo stesso riferimento; il passo successivo utile è distinguerle, non indovinare quale componente si è guastato.',
    final: 'Non posso ancora sostenere una singola causa.',
  },
  ja: {
    supplied: 'リクエストにはすでにインシデントの測定値と基準値が含まれています。それらを比較の出発点として使用してください。',
    next: 'これらの測定値を使い、同じ時間枠と同じ基準値に対して候補となる仮説を比較してください。次に有効なステップは仮説の切り分けであり、故障した部品を推測することではありません。',
    final: 'まだ単一の原因を断定することはできません。',
  },
  ko: {
    supplied: '요청에 이미 인시던트 측정값과 기준값이 포함되어 있습니다. 이를 비교의 출발점으로 사용하세요.',
    next: '이 측정값을 사용해 같은 시간대와 같은 기준값에 대해 후보 가설을 비교하세요. 다음으로 유용한 단계는 가설을 구별하는 것이지, 고장 난 부품을 추측하는 것이 아닙니다.',
    final: '아직 단일 원인을 확정할 수 없습니다.',
  },
  ar: {
    supplied: 'يتضمن الطلب بالفعل قراءات الحادثة وقيمة مرجعية؛ استخدمها نقطةَ انطلاق للمقارنة.',
    next: 'استخدم هذه القراءات لمقارنة الفرضيات المرشحة ضمن النافذة الزمنية نفسها ومقابل القيمة المرجعية نفسها؛ الخطوة التالية المفيدة هي التمييز بينها، لا تخمين الجزء المعطّل.',
    final: 'لا يمكنني حتى الآن الجزم بسبب واحد.',
  },
}

const JOIN: Record<RefusalLanguage, { sep: string; last: string }> = {
  en: { sep: ', ', last: ', and ' },
  es: { sep: ', ', last: ' y ' },
  pt: { sep: ', ', last: ' e ' },
  pl: { sep: ', ', last: ' oraz ' },
  ru: { sep: ', ', last: ' и ' },
  de: { sep: ', ', last: ', und ' },
  fr: { sep: ', ', last: ', et ' },
  it: { sep: ', ', last: ', e ' },
  ja: { sep: ', ', last: '、および ' },
  ko: { sep: ', ', last: ', 그리고 ' },
  ar: { sep: ', ', last: '، وكذلك ' },
}

function normalizeLanguage(language: string | null | undefined): RefusalLanguage {
  const code = String(language ?? 'en').trim().slice(0, 2).toLowerCase()
  return code === 'es' || code === 'pt' || code === 'pl' || code === 'ru' || code === 'de' || code === 'fr' || code === 'it' || code === 'ja' || code === 'ko' || code === 'ar' ? code : 'en'
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
  en: 'Live web search did not return a usable amateur/várzea roster for this request. COS will not invent club names from a static file. Configure BRAVE_SEARCH_API_KEY and ask again.',
  pt: 'A busca ao vivo na web não devolveu uma lista utilizável de times de várzea/amador. O COS não vai inventar nomes a partir de um arquivo estático. Configure BRAVE_SEARCH_API_KEY e pergunte de novo.',
  es: 'La búsqueda en vivo no devolvió una lista usable de equipos amateur/várzea. COS no inventará nombres desde un archivo estático. Configure BRAVE_SEARCH_API_KEY y pregunte otra vez.',
  pl: 'Wyszukiwanie na żywo nie zwróciło użytecznej listy drużyn amatorskich. COS nie wymyśli nazw z pliku statycznego. Ustaw BRAVE_SEARCH_API_KEY i zapytaj ponownie.',
  ru: 'Живой веб-поиск не вернул пригодный любительский список. COS не будет выдумывать названия из статического файла. Настройте BRAVE_SEARCH_API_KEY и спросите снова.',
  de: 'Die Live-Websuche hat für diese Anfrage keine verwertbare Liste von Amateur-/Várzea-Teams geliefert. COS erfindet keine Vereinsnamen aus einer statischen Datei. Konfigurieren Sie BRAVE_SEARCH_API_KEY und fragen Sie erneut.',
  fr: 'La recherche web en direct n’a renvoyé aucune liste exploitable d’équipes amateurs/várzea pour cette demande. COS n’inventera pas de noms de clubs à partir d’un fichier statique. Configurez BRAVE_SEARCH_API_KEY et posez à nouveau la question.',
  it: 'La ricerca web in tempo reale non ha restituito un elenco utilizzabile di squadre amatoriali/várzea per questa richiesta. COS non inventerà nomi di club da un file statico. Configura BRAVE_SEARCH_API_KEY e chiedi di nuovo.',
  ja: 'このリクエストに対し、リアルタイムのWeb検索では利用可能なアマチュア/várzeaのチーム一覧が返されませんでした。COSは静的ファイルからクラブ名を作り出すことはしません。BRAVE_SEARCH_API_KEYを設定して、もう一度お尋ねください。',
  ko: '실시간 웹 검색에서 이 요청에 사용할 수 있는 아마추어/várzea 팀 목록을 찾지 못했습니다. COS는 정적 파일에서 클럽 이름을 지어내지 않습니다. BRAVE_SEARCH_API_KEY를 구성한 후 다시 질문하세요.',
  ar: 'لم يُرجع البحث المباشر على الويب قائمة صالحة لفرق الهواة/várzea لهذا الطلب. لن يختلق COS أسماء أندية من ملف ثابت. اضبط BRAVE_SEARCH_API_KEY واسأل مرة أخرى.',
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

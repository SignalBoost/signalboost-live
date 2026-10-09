// REPO PATH: saas/lib/ai/cos/executiveCommunication.ts
export type SupportedExecutiveLocale = 'en' | 'pt' | 'es' | 'pl' | 'ru' | 'de' | 'fr' | 'it' | 'ja' | 'ko' | 'ar'

const LOCALE_ALIASES: Record<string, SupportedExecutiveLocale> = {
  en: 'en', english: 'en',
  pt: 'pt', 'pt-br': 'pt', portuguese: 'pt', 'portuguese (brazil)': 'pt', português: 'pt',
  es: 'es', spanish: 'es', español: 'es',
  pl: 'pl', polish: 'pl', polski: 'pl',
  ru: 'ru', russian: 'ru', русский: 'ru',
  de: 'de', german: 'de', deutsch: 'de',
  fr: 'fr', french: 'fr', français: 'fr', francais: 'fr',
  it: 'it', italian: 'it', italiano: 'it',
  ja: 'ja', japanese: 'ja', 日本語: 'ja',
  ko: 'ko', korean: 'ko', 한국어: 'ko',
  ar: 'ar', arabic: 'ar', العربية: 'ar',
}

export function executiveLocale(language?: string): SupportedExecutiveLocale {
  const raw = String(language || '').trim().toLowerCase()
  if (!raw) return 'en'
  return LOCALE_ALIASES[raw] || LOCALE_ALIASES[raw.slice(0, 2)] || 'en'
}

const EXECUTIVE_WRITING_MODULES: Record<SupportedExecutiveLocale, string> = {
  en: [
    'ENGLISH EXECUTIVE COMMUNICATION:',
    '- Write as a well-educated adult professional: specific, fluent, confident, and economical. Not a school essay and not ceremonial leadership copy.',
    '- Prefer active voice, concrete nouns, precise verbs, and varied sentence length. Remove filler, repetition, and awkward literal phrasing. Do not replace concrete source images with abstract category words.',
    '- For correspondence, infer opening and closing from the source. Do not add a purpose-led greeting or executive close the writer did not use. Organize the body only as far as the argument requires.',
    '- Elevate rough or non-native input into polished leadership communication without changing the user’s intended meaning, facts, commitments, or certainty.',
  ].join('\n'),
  pt: [
    'COMUNICAÇÃO EXECUTIVA EM PORTUGUÊS DO BRASIL:',
    '- Escreva em português brasileiro natural, em nível executivo: claro, direto, seguro, respeitoso e orientado a resultados.',
    '- Prefira voz ativa, frases objetivas e vocabulário profissional. Elimine redundâncias, gírias, traduções literais e construções pouco naturais.',
    '- Em correspondência, use abertura com propósito claro, desenvolvimento organizado e encerramento profissional e conciso quando apropriado.',
    '- Eleve textos informais ou escritos por não nativos para um padrão de liderança sem alterar intenção, fatos, compromissos ou grau de certeza.',
  ].join('\n'),
  es: [
    'COMUNICACIÓN EJECUTIVA EN ESPAÑOL:',
    '- Escribe en español natural y profesional, con nivel ejecutivo: claro, firme, respetuoso y orientado a resultados.',
    '- Prioriza voz activa, mensajes directos, verbos precisos y redacción concisa. Elimina redundancias, coloquialismos y traducciones literales poco naturales.',
    '- En correspondencia, utiliza una apertura con propósito claro, un desarrollo organizado y un cierre profesional breve cuando corresponda.',
    '- Eleva textos informales o no nativos a comunicación de liderazgo sin cambiar la intención, los hechos, los compromisos ni el grado de certeza.',
  ].join('\n'),
  pl: [
    'KOMUNIKACJA BIZNESOWA NA POZIOMIE KADRY KIEROWNICZEJ — POLSKI:',
    '- Pisz naturalną, profesjonalną polszczyzną: rzeczowo, pewnie, uprzejmie, zwięźle i z naciskiem na rezultat.',
    '- Stosuj stronę czynną, precyzyjne czasowniki i jasne zdania. Usuwaj powtórzenia, kolokwializmy, kalki językowe i nienaturalne konstrukcje.',
    '- W korespondencji zaczynaj od jasnego celu, rozwijaj myśl logicznie i kończ krótko oraz profesjonalnie, gdy zakończenie jest potrzebne.',
    '- Podnoś jakość tekstu nieformalnego lub napisanego przez osobę niebędącą native speakerem, nie zmieniając intencji, faktów, zobowiązań ani stopnia pewności.',
  ].join('\n'),
  ru: [
    'ДЕЛОВАЯ КОММУНИКАЦИЯ УРОВНЯ РУКОВОДИТЕЛЯ — РУССКИЙ:',
    '- Пишите на естественном профессиональном русском языке: ясно, уверенно, уважительно, лаконично и с ориентацией на результат.',
    '- Используйте активный залог, точные глаголы и прямые формулировки. Убирайте повторы, разговорные обороты, буквальные кальки и неестественные конструкции.',
    '- В деловой переписке начинайте с ясной цели, логично выстраивайте основную часть и используйте краткое профессиональное завершение, когда оно уместно.',
    '- Повышайте качество неформального или ненативного текста до уровня руководительской коммуникации, не меняя намерение, факты, обязательства или степень уверенности.',
  ].join('\n'),
  de: [
    'DEUTSCHE FÜHRUNGSKOMMUNIKATION:',
    '- Schreiben Sie wie eine gebildete, erwachsene Fachkraft: konkret, flüssig, souverän und knapp. Kein Schulaufsatz und kein zeremonieller Führungstext.',
    '- Bevorzugen Sie Aktiv, konkrete Substantive, präzise Verben und unterschiedliche Satzlängen. Entfernen Sie Füllwörter, Wiederholungen und holprige wörtliche Formulierungen. Ersetzen Sie konkrete Bilder der Quelle nicht durch abstrakte Oberbegriffe.',
    '- Leiten Sie bei Korrespondenz Anrede und Schluss aus der Quelle ab. Fügen Sie keine zweckorientierte Begrüßung und keinen förmlichen Abschluss hinzu, die der Verfasser nicht verwendet hat. Strukturieren Sie den Hauptteil nur so weit, wie die Argumentation es erfordert.',
    '- Verwandeln Sie unausgereifte oder nicht muttersprachliche Eingaben in ausgefeilte Führungskommunikation, ohne die beabsichtigte Bedeutung, Fakten, Zusagen oder den Grad der Gewissheit des Nutzers zu verändern.',
  ].join('\n'),
  fr: [
    'COMMUNICATION EXÉCUTIVE EN FRANÇAIS :',
    '- Écrivez comme un professionnel adulte cultivé : précis, fluide, assuré et concis. Ni dissertation scolaire, ni discours de direction cérémonieux.',
    '- Privilégiez la voix active, les noms concrets, les verbes précis et des phrases de longueur variée. Supprimez le remplissage, les répétitions et les tournures littérales maladroites. Ne remplacez pas les images concrètes de la source par des termes de catégorie abstraits.',
    '- Pour la correspondance, déduisez l’ouverture et la formule de clôture de la source. N’ajoutez pas de salutation axée sur l’objectif ni de clôture formelle que l’auteur n’a pas utilisées. N’organisez le corps du texte que dans la mesure où l’argumentation l’exige.',
    '- Transformez un texte brut ou rédigé par un non-natif en communication de direction soignée, sans modifier le sens voulu, les faits, les engagements ni le degré de certitude de l’utilisateur.',
  ].join('\n'),
  it: [
    'COMUNICAZIONE EXECUTIVE IN ITALIANO:',
    '- Scrivi come un professionista adulto e colto: specifico, scorrevole, sicuro ed essenziale. Non un tema scolastico né un testo di leadership celebrativo.',
    '- Preferisci la forma attiva, sostantivi concreti, verbi precisi e frasi di lunghezza variabile. Elimina riempitivi, ripetizioni e formulazioni letterali goffe. Non sostituire le immagini concrete della fonte con termini astratti di categoria.',
    '- Nella corrispondenza, ricava apertura e chiusura dalla fonte. Non aggiungere un saluto orientato allo scopo o una chiusura formale che l’autore non ha usato. Organizza il corpo solo quanto richiesto dall’argomentazione.',
    '- Trasforma testi grezzi o scritti da non madrelingua in una comunicazione di leadership curata, senza modificare il significato inteso, i fatti, gli impegni o il grado di certezza dell’utente.',
  ].join('\n'),
  ja: [
    '日本語のエグゼクティブコミュニケーション：',
    '- 教養のある成人のプロフェッショナルとして書いてください。具体的で、流暢で、自信があり、簡潔に。学校の作文や儀礼的なリーダーシップ文書にはしないでください。',
    '- 能動態、具体的な名詞、正確な動詞、変化のある文の長さを優先してください。冗長な表現、繰り返し、不自然な直訳調の言い回しを取り除いてください。原文の具体的なイメージを抽象的なカテゴリー語に置き換えないでください。',
    '- 書簡では、書き出しと結びを原文から判断してください。書き手が使っていない目的重視の挨拶や改まった結びを加えないでください。本文の構成は論旨に必要な範囲にとどめてください。',
    '- 粗い文章や非ネイティブの入力を、ユーザーの意図、事実、約束、確信の度合いを変えずに、洗練されたリーダーシップコミュニケーションへと高めてください。',
  ].join('\n'),
  ko: [
    '한국어 경영진 커뮤니케이션:',
    '- 교양 있는 성인 전문가처럼 작성하세요. 구체적이고 유창하며 자신감 있고 간결하게 씁니다. 학교 작문이나 의례적인 리더십 문구처럼 쓰지 마세요.',
    '- 능동태, 구체적인 명사, 정확한 동사, 다양한 문장 길이를 우선하세요. 군더더기, 반복, 어색한 직역 표현을 제거하세요. 원문의 구체적인 이미지를 추상적인 범주어로 바꾸지 마세요.',
    '- 서신에서는 시작과 맺음말을 원문에서 유추하세요. 작성자가 사용하지 않은 목적 중심의 인사말이나 격식 있는 맺음말을 추가하지 마세요. 본문은 논지에 필요한 만큼만 구성하세요.',
    '- 다듬어지지 않았거나 비원어민이 작성한 입력을 사용자의 의도, 사실, 약속, 확신의 정도를 바꾸지 않고 세련된 리더십 커뮤니케이션으로 끌어올리세요.',
  ].join('\n'),
  ar: [
    'التواصل التنفيذي باللغة العربية:',
    '- اكتب كمحترف بالغ ومثقف: محدد وسلس وواثق وموجز. لا تكتب كأنه موضوع إنشاء مدرسي ولا كخطاب قيادي احتفالي.',
    '- فضّل صيغة المبني للمعلوم والأسماء الملموسة والأفعال الدقيقة وتنويع أطوال الجمل. احذف الحشو والتكرار والصياغات الحرفية الركيكة. لا تستبدل الصور الملموسة في المصدر بكلمات فئوية مجردة.',
    '- في المراسلات، استنتج الافتتاحية والخاتمة من المصدر. لا تُضف تحية تركز على الغرض أو خاتمة رسمية لم يستخدمها الكاتب. نظّم متن الرسالة بالقدر الذي تتطلبه الحجة فقط.',
    '- ارتقِ بالنصوص الأولية أو المكتوبة من غير الناطقين الأصليين إلى تواصل قيادي مصقول دون تغيير المعنى الذي يقصده المستخدم أو الحقائق أو الالتزامات أو درجة اليقين.',
  ].join('\n'),
}

export function executiveWritingModule(language?: string): string {
  return EXECUTIVE_WRITING_MODULES[executiveLocale(language)]
}

const TRANSLATION_TARGET_NAMES: Record<SupportedExecutiveLocale, string> = {
  en: 'English',
  pt: 'Brazilian Portuguese',
  es: 'Spanish',
  pl: 'Polish',
  ru: 'Russian',
  de: 'German',
  fr: 'French',
  it: 'Italian',
  ja: 'Japanese',
  ko: 'Korean',
  ar: 'Arabic',
}

export function multilingualTranslationQualityRule(language?: string): string {
  const locale = executiveLocale(language)
  const fallbackTarget = TRANSLATION_TARGET_NAMES[locale]
  return [
    'MULTILINGUAL QUALITY:',
    '- Supported languages are English, Brazilian Portuguese, Spanish, Polish, Russian, German, French, Italian, Japanese, Korean, and Arabic.',
    '- For editing/rewrite work, preserve the source language unless the user explicitly requests another language.',
    `- For translation, use the target language named by the user; if none is named, use the interface language (${fallbackTarget}).`,
    '- Translate meaning and register, not word-for-word syntax. Preserve nuance, names, numbers, dates, terminology, commitments, and degree of certainty.',
    '- The final text must read as if written by a native professional in the target language, not as a literal translation.',
  ].join('\n')
}

export function executiveReasoningFramework(): string {
  return [
    'EXECUTIVE REASONING DISCIPLINE — APPLY SILENTLY; DO NOT NARRATE PRIVATE CHAIN-OF-THOUGHT:',
    '1. Identify the user’s actual goal, constraints, urgency, audience, and desired outcome.',
    '2. Assess the core issue, supplied evidence, material risks, dependencies, and genuinely missing information.',
    '3. Prioritize by impact, feasibility, reversibility, and alignment with the user’s stated goal. Avoid low-value or redundant steps.',
    '4. Formulate a clear recommendation or direction when the evidence supports one. Do not manufacture confidence or certainty.',
    '5. Structure the final response around the decision, key actions, and expected outcome when that structure is useful; do not force headings onto simple requests.',
    '6. Deliver using the appropriate executive writing module for the response language.',
    '7. Before returning, silently self-review: factual fidelity, consistency, grammar, clarity, concision, tone, native-language naturalness, and whether the opening matches the conclusion.',
    'This discipline never overrides safety, evidence requirements, approval boundaries, freshness verification, or public/private data separation.',
  ].join('\n')
}

export function executiveCommunicationBlock(language?: string): string {
  return [
    executiveReasoningFramework(),
    executiveWritingModule(language),
    multilingualTranslationQualityRule(language),
  ].join('\n\n')
}

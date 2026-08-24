export type SupportedExecutiveLocale = 'en' | 'pt' | 'es' | 'pl' | 'ru'

const LOCALE_ALIASES: Record<string, SupportedExecutiveLocale> = {
  en: 'en', english: 'en',
  pt: 'pt', 'pt-br': 'pt', portuguese: 'pt', 'portuguese (brazil)': 'pt', português: 'pt',
  es: 'es', spanish: 'es', español: 'es',
  pl: 'pl', polish: 'pl', polski: 'pl',
  ru: 'ru', russian: 'ru', русский: 'ru',
}

export function executiveLocale(language?: string): SupportedExecutiveLocale {
  const raw = String(language || '').trim().toLowerCase()
  if (!raw) return 'en'
  return LOCALE_ALIASES[raw] || LOCALE_ALIASES[raw.slice(0, 2)] || 'en'
}

const EXECUTIVE_WRITING_MODULES: Record<SupportedExecutiveLocale, string> = {
  en: [
    'ENGLISH EXECUTIVE COMMUNICATION:',
    '- Write in natural professional English with leadership presence: concise, confident, respectful, and outcome-oriented.',
    '- Prefer active voice, direct statements, precise verbs, and economical wording. Remove filler, repetition, slang, and awkward literal phrasing.',
    '- For correspondence, use a clear purpose-led opening, a logically organized body, and a concise professional closing when appropriate.',
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
}

export function executiveWritingModule(language?: string): string {
  return EXECUTIVE_WRITING_MODULES[executiveLocale(language)]
}

export function multilingualTranslationQualityRule(language?: string): string {
  const locale = executiveLocale(language)
  const fallbackTarget = locale === 'pt' ? 'Brazilian Portuguese' : locale === 'es' ? 'Spanish' : locale === 'pl' ? 'Polish' : locale === 'ru' ? 'Russian' : 'English'
  return [
    'MULTILINGUAL QUALITY:',
    '- Supported languages are English, Brazilian Portuguese, Spanish, Polish, and Russian.',
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

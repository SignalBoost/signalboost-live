import { criticalLanguageTokens, preservesCriticalLanguageTokens, type ConciergeLanguage } from './conciergeLanguageQuality.ts'

export type ConciergeLanguageAcceptanceCategory = 'conversation' | 'operational' | 'transformation' | 'reasoning' | 'fallback'
export type ConciergeLanguageAcceptanceMode = 'cos' | 'deterministic_fallback'

export type ConciergeLanguageAcceptanceCase = Readonly<{
  key: string
  title: string
  language: ConciergeLanguage
  category: ConciergeLanguageAcceptanceCategory
  mode: ConciergeLanguageAcceptanceMode
  prompt: string
  preserveCriticalTokens?: boolean
}>

export type ConciergeLanguageAcceptanceVerdicts = Readonly<{
  handled: boolean
  selectedLanguage: boolean
  noEnglishLeakage: boolean
  criticalTokensPreserved: boolean
  routingHealthy: boolean
  latencyHealthy: boolean
}>

export type ConciergeLanguageAcceptanceExecution = Readonly<{
  test: ConciergeLanguageAcceptanceCase
  reply: string
  responseSource: string
  localModelInvoked: boolean
  externalAiInvoked: boolean
  latencyMs: number
  nativeReviewConfidence: number | null
  nativeReviewerUsed: boolean
  verdicts: ConciergeLanguageAcceptanceVerdicts
  passed: boolean
}>

export const ACCEPTANCE_LANGUAGES: readonly ConciergeLanguage[] = ['en', 'es', 'pt', 'pl', 'ru']
const COS_MAX_LATENCY_MS = 150_000
const FALLBACK_MAX_LATENCY_MS = 2_000

const casesByLanguage: Record<ConciergeLanguage, readonly Omit<ConciergeLanguageAcceptanceCase, 'language' | 'key'>[]> = {
  en: [
    { title: 'English ordinary conversation', category: 'conversation', mode: 'cos', prompt: 'Our internal pilot is called ALPHA-42. In two or three natural sentences, explain why a short pilot can reduce implementation risk without claiming that ALPHA-42 has already succeeded. Keep ALPHA-42 unchanged.' },
    { title: 'English operational guidance', category: 'operational', mode: 'cos', prompt: 'I want to use SignalBoost Concierge to improve a customer email for project ALPHA-42. Give me three concise steps. Keep ALPHA-42 unchanged and do not claim the email has already been sent.' },
    { title: 'English writing transformation', category: 'transformation', mode: 'cos', prompt: 'Rewrite this as a natural professional message while preserving ALPHA-42 and https://example.com/plan exactly: “hi team alpha-42 is ready for review please look at https://example.com/plan and send comments tomorrow thanks”.' },
    { title: 'English reasoning', category: 'reasoning', mode: 'cos', prompt: 'Project ALPHA-42 has two options. Option A uses the existing team for a 14-day pilot. Option B requires a new vendor and a 45-day pilot. Recommend one option, explain the trade-off, and keep ALPHA-42 unchanged. Do not invent costs.' },
    { title: 'English deterministic fallback', category: 'fallback', mode: 'deterministic_fallback', preserveCriticalTokens: false, prompt: 'How do I export my finished video to MP4?' },
  ],
  es: [
    { title: 'Spanish ordinary conversation', category: 'conversation', mode: 'cos', prompt: 'Nuestro piloto interno se llama ALPHA-42. Explica en dos o tres frases naturales por qué un piloto corto puede reducir el riesgo de implantación, sin afirmar que ALPHA-42 ya haya tenido éxito. Mantén ALPHA-42 sin cambios.' },
    { title: 'Spanish operational guidance', category: 'operational', mode: 'cos', prompt: 'Quiero usar SignalBoost Concierge para mejorar un correo a un cliente sobre el proyecto ALPHA-42. Dame tres pasos breves. Mantén ALPHA-42 sin cambios y no digas que el correo ya fue enviado.' },
    { title: 'Spanish writing transformation', category: 'transformation', mode: 'cos', prompt: 'Reescribe este mensaje con un tono profesional y natural, conservando ALPHA-42 y https://example.com/plan exactamente: “hola equipo alpha-42 está listo para revisión miren https://example.com/plan y manden comentarios mañana gracias”.' },
    { title: 'Spanish reasoning', category: 'reasoning', mode: 'cos', prompt: 'El proyecto ALPHA-42 tiene dos opciones. La opción A usa el equipo actual para un piloto de 14 días. La opción B requiere un proveedor nuevo y un piloto de 45 días. Recomienda una opción, explica la compensación y mantén ALPHA-42 sin cambios. No inventes costes.' },
    { title: 'Spanish deterministic fallback', category: 'fallback', mode: 'deterministic_fallback', preserveCriticalTokens: false, prompt: '¿Cómo exporto mi vídeo terminado a MP4?' },
  ],
  pt: [
    { title: 'Portuguese ordinary conversation', category: 'conversation', mode: 'cos', prompt: 'Nosso piloto interno se chama ALPHA-42. Explique em duas ou três frases naturais por que um piloto curto pode reduzir o risco de implementação, sem afirmar que o ALPHA-42 já deu certo. Mantenha ALPHA-42 sem alterações.' },
    { title: 'Portuguese operational guidance', category: 'operational', mode: 'cos', prompt: 'Quero usar o SignalBoost Concierge para melhorar um e-mail para um cliente sobre o projeto ALPHA-42. Dê três passos curtos. Mantenha ALPHA-42 sem alterações e não diga que o e-mail já foi enviado.' },
    { title: 'Portuguese writing transformation', category: 'transformation', mode: 'cos', prompt: 'Reescreva esta mensagem em português brasileiro natural e profissional, preservando ALPHA-42 e https://example.com/plan exatamente: “oi equipe alpha-42 está pronto para revisão vejam https://example.com/plan e mandem comentários amanhã obrigado”.' },
    { title: 'Portuguese reasoning', category: 'reasoning', mode: 'cos', prompt: 'O projeto ALPHA-42 tem duas opções. A opção A usa a equipe atual em um piloto de 14 dias. A opção B exige um novo fornecedor e um piloto de 45 dias. Recomende uma opção, explique o equilíbrio entre elas e mantenha ALPHA-42 sem alterações. Não invente custos.' },
    { title: 'Portuguese deterministic fallback', category: 'fallback', mode: 'deterministic_fallback', preserveCriticalTokens: false, prompt: 'Como exporto meu vídeo final para MP4?' },
  ],
  pl: [
    { title: 'Polish ordinary conversation', category: 'conversation', mode: 'cos', prompt: 'Nasz wewnętrzny pilotaż nazywa się ALPHA-42. W dwóch lub trzech naturalnych zdaniach wyjaśnij, dlaczego krótki pilotaż może ograniczyć ryzyko wdrożenia, ale nie twierdź, że ALPHA-42 już zakończył się sukcesem. Zachowaj ALPHA-42 bez zmian.' },
    { title: 'Polish operational guidance', category: 'operational', mode: 'cos', prompt: 'Chcę użyć SignalBoost Concierge do poprawienia wiadomości e-mail do klienta dotyczącej projektu ALPHA-42. Podaj trzy krótkie kroki. Zachowaj ALPHA-42 bez zmian i nie pisz, że wiadomość została już wysłana.' },
    { title: 'Polish writing transformation', category: 'transformation', mode: 'cos', prompt: 'Przeredaguj tę wiadomość na naturalny, profesjonalny polski, zachowując dokładnie ALPHA-42 i https://example.com/plan: „cześć zespół alpha-42 jest gotowy do przeglądu zobaczcie https://example.com/plan i wyślijcie uwagi jutro dzięki”.' },
    { title: 'Polish reasoning', category: 'reasoning', mode: 'cos', prompt: 'Projekt ALPHA-42 ma dwie opcje. Opcja A wykorzystuje obecny zespół w 14-dniowym pilotażu. Opcja B wymaga nowego dostawcy i 45-dniowego pilotażu. Zarekomenduj jedną opcję, wyjaśnij kompromis i zachowaj ALPHA-42 bez zmian. Nie wymyślaj kosztów.' },
    { title: 'Polish deterministic fallback', category: 'fallback', mode: 'deterministic_fallback', preserveCriticalTokens: false, prompt: 'Jak wyeksportować gotowy film do MP4?' },
  ],
  ru: [
    { title: 'Russian ordinary conversation', category: 'conversation', mode: 'cos', prompt: 'Наш внутренний пилот называется ALPHA-42. В двух-трёх естественных предложениях объясни, почему короткий пилот может снизить риск внедрения, но не утверждай, что ALPHA-42 уже завершился успешно. Сохрани ALPHA-42 без изменений.' },
    { title: 'Russian operational guidance', category: 'operational', mode: 'cos', prompt: 'Я хочу использовать SignalBoost Concierge, чтобы улучшить письмо клиенту о проекте ALPHA-42. Дай три коротких шага. Сохрани ALPHA-42 без изменений и не утверждай, что письмо уже отправлено.' },
    { title: 'Russian writing transformation', category: 'transformation', mode: 'cos', prompt: 'Перепиши это сообщение на естественном профессиональном русском языке, сохранив ALPHA-42 и https://example.com/plan без изменений: «привет команда alpha-42 готов к проверке посмотрите https://example.com/plan и пришлите комментарии завтра спасибо».' },
    { title: 'Russian reasoning', category: 'reasoning', mode: 'cos', prompt: 'У проекта ALPHA-42 есть два варианта. Вариант A использует текущую команду для 14-дневного пилота. Вариант B требует нового поставщика и 45-дневного пилота. Рекомендуй один вариант, объясни компромисс и сохрани ALPHA-42 без изменений. Не придумывай стоимость.' },
    { title: 'Russian deterministic fallback', category: 'fallback', mode: 'deterministic_fallback', preserveCriticalTokens: false, prompt: 'Как экспортировать готовое видео в MP4?' },
  ],
}

export const CONCIERGE_LANGUAGE_ACCEPTANCE_CASES: readonly ConciergeLanguageAcceptanceCase[] = Object.freeze(
  ACCEPTANCE_LANGUAGES.flatMap(language => casesByLanguage[language].map((test, index) => ({ ...test, language, key: `${language}-${index + 1}-${test.category}` }))),
)

const STOPWORDS: Record<ConciergeLanguage, readonly string[]> = {
  en: ['the', 'and', 'to', 'of', 'is', 'are', 'you', 'your', 'for', 'with', 'that', 'this', 'can', 'should'],
  es: ['de', 'la', 'el', 'que', 'y', 'para', 'en', 'con', 'una', 'un', 'por', 'puede', 'puedes', 'debe'],
  pt: ['de', 'o', 'a', 'que', 'e', 'para', 'em', 'com', 'uma', 'um', 'por', 'você', 'pode', 'deve'],
  pl: ['i', 'w', 'na', 'do', 'z', 'że', 'jest', 'nie', 'dla', 'można', 'aby', 'się', 'oraz', 'powinien'],
  ru: ['и', 'в', 'на', 'что', 'это', 'не', 'для', 'с', 'как', 'можно', 'чтобы', 'по', 'из', 'нужно'],
}

const ENGLISH_LEAKAGE_PHRASE = /\b(?:i can|you can|your goal|your role|open the|go to|click the|start by|next step|then choose|tell me|to get started)\b/i
const NON_RELEASE_SOURCES = new Set(['external_fallback_required', 'semantic_cache', 'semantic_similarity'])

function words(text: string): string[] { return String(text || '').toLocaleLowerCase().match(/\p{L}+/gu) ?? [] }
function stopwordHits(text: string, language: ConciergeLanguage): number {
  const set = new Set(STOPWORDS[language])
  return words(text).reduce((count, token) => count + (set.has(token) ? 1 : 0), 0)
}

export function selectedLanguageSignal(text: string, language: ConciergeLanguage): boolean {
  const value = String(text || '').trim()
  if (!value) return false
  const targetHits = stopwordHits(value, language)
  if (language === 'ru') return (value.match(/[А-Яа-яЁё]/g) ?? []).length >= 12 && targetHits >= 2
  if (language === 'en') return targetHits >= 3
  const otherHits = ACCEPTANCE_LANGUAGES.filter(code => code !== language && code !== 'en').map(code => stopwordHits(value, code))
  return targetHits >= 2 && targetHits >= Math.max(0, ...otherHits)
}

export function hasEnglishLeakage(text: string, language: ConciergeLanguage): boolean {
  if (language === 'en') return false
  const targetHits = stopwordHits(text, language)
  const englishHits = stopwordHits(text, 'en')
  return ENGLISH_LEAKAGE_PHRASE.test(text) || englishHits >= Math.max(7, targetHits + 4)
}

export function evaluateLanguageAcceptanceText(input: {
  test: ConciergeLanguageAcceptanceCase
  reply: string
  handled: boolean
  responseSource: string
  localModelInvoked: boolean
  externalAiInvoked: boolean
  latencyMs: number
}): ConciergeLanguageAcceptanceVerdicts {
  const criticalOk = input.test.preserveCriticalTokens === false ? true : preservesCriticalLanguageTokens(input.test.prompt, input.reply)
  const source = String(input.responseSource || '').trim().toLowerCase()
  const routingHealthy = input.handled && Boolean(source) && !NON_RELEASE_SOURCES.has(source) && input.externalAiInvoked === false
    && (input.test.mode === 'deterministic_fallback' || input.localModelInvoked === true || source.startsWith('deterministic_') || source.startsWith('cos_'))
  return {
    handled: input.handled,
    selectedLanguage: selectedLanguageSignal(input.reply, input.test.language),
    noEnglishLeakage: !hasEnglishLeakage(input.reply, input.test.language),
    criticalTokensPreserved: criticalOk,
    routingHealthy,
    latencyHealthy: input.latencyMs <= (input.test.mode === 'cos' ? COS_MAX_LATENCY_MS : FALLBACK_MAX_LATENCY_MS),
  }
}

export function summarizeLanguageAcceptance(rows: Array<{ language: string; passed: boolean }>) {
  return Object.fromEntries(ACCEPTANCE_LANGUAGES.map(language => {
    const items = rows.filter(row => row.language === language)
    return [language, { attempted: items.length, passed: items.filter(row => row.passed).length, automatedPassed: items.length === 5 && items.every(row => row.passed) }]
  }))
}

export function requiredNativeReviewTemplate(): Record<ConciergeLanguage, 'pending'> {
  return { en: 'pending', es: 'pending', pt: 'pending', pl: 'pending', ru: 'pending' }
}

export function acceptanceCriticalTokens(test: ConciergeLanguageAcceptanceCase): string[] {
  return test.preserveCriticalTokens === false ? [] : criticalLanguageTokens(test.prompt)
}

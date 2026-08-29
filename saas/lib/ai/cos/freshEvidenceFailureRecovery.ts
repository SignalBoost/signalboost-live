// Public failure taxonomy for fresh/current fact turns.
// Evidence may survive a failed renderer; public wording must report the stage that failed.

export type FreshEvidencePublicFailureCode =
  | 'insufficient_live_authority'
  | 'local_synthesis_failed'
  | 'ungrounded_synthesis'

export type FreshEvidenceInternalFailureCode =
  | 'insufficient_live_authority'
  | 'local_synthesis_failed'
  | 'local_synthesis_unparseable'
  | 'citation_grounding_rejected'
  | 'local_synthesis_below_threshold'

export function publicFreshFailureCode(code: FreshEvidenceInternalFailureCode): FreshEvidencePublicFailureCode {
  if (code === 'insufficient_live_authority') return code
  if (code === 'local_synthesis_failed') return code
  return 'ungrounded_synthesis'
}

type Language = 'en' | 'es' | 'pt' | 'pl' | 'ru'

function languageOf(value: string | null | undefined): Language {
  const code = String(value || 'en').slice(0, 2).toLowerCase()
  return code === 'es' || code === 'pt' || code === 'pl' || code === 'ru' ? code : 'en'
}

const RECOVERY_COPY: Record<Exclude<Language, 'en'> | 'en', string> = {
  en: 'I found current sources for this request, but a temporary processing error prevented me from turning them into a verified answer. The sources were saved with this turn; please try again shortly.',
  es: 'Encontré fuentes actuales para esta solicitud, pero un error temporal de procesamiento impidió convertirlas en una respuesta verificada. Las fuentes se guardaron con este turno; inténtalo de nuevo en breve.',
  pt: 'Encontrei fontes atuais para este pedido, mas um erro temporário de processamento impediu que eu as transformasse em uma resposta verificada. As fontes foram guardadas neste turno; tente novamente em breve.',
  pl: 'Znalazłem aktualne źródła dla tego pytania, ale tymczasowy błąd przetwarzania uniemożliwił przygotowanie zweryfikowanej odpowiedzi. Źródła zapisano w tym turnie; spróbuj ponownie za chwilę.',
  ru: 'Я нашёл актуальные источники по этому запросу, но временная ошибка обработки не позволила подготовить проверенный ответ. Источники сохранены в этом ходе; попробуйте немного позже.',
}

const UNGROUNDED_COPY: Record<Exclude<Language, 'en'> | 'en', string> = {
  en: 'I found current sources, but the drafted answer did not meet the verification requirement, so I am not making the claim. The recorded sources remain available for this turn.',
  es: 'Encontré fuentes actuales, pero el borrador de respuesta no cumplió el requisito de verificación, por lo que no haré la afirmación. Las fuentes registradas siguen disponibles para este turno.',
  pt: 'Encontrei fontes atuais, mas o rascunho da resposta não cumpriu o requisito de verificação, então não farei a afirmação. As fontes registradas continuam disponíveis neste turno.',
  pl: 'Znalazłem aktualne źródła, ale projekt odpowiedzi nie spełnił wymogu weryfikacji, więc nie podaję tego twierdzenia. Zapisane źródła pozostają dostępne dla tego turnu.',
  ru: 'Я нашёл актуальные источники, но черновой ответ не выполнил требование проверки, поэтому я не делаю это утверждение. Записанные источники остаются доступными для этого хода.',
}

export function freshFailureReply(code: FreshEvidenceInternalFailureCode, language?: string | null): string | null {
  const publicCode = publicFreshFailureCode(code)
  if (publicCode === 'insufficient_live_authority') return null
  return publicCode === 'local_synthesis_failed'
    ? RECOVERY_COPY[languageOf(language)]
    : UNGROUNDED_COPY[languageOf(language)]
}

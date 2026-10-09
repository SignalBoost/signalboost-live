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

type Language = 'en' | 'es' | 'pt' | 'pl' | 'ru' | 'de' | 'fr' | 'it' | 'ja' | 'ko' | 'ar'

function languageOf(value: string | null | undefined): Language {
  const code = String(value || 'en').slice(0, 2).toLowerCase()
  return code === 'es' || code === 'pt' || code === 'pl' || code === 'ru' || code === 'de' || code === 'fr' || code === 'it' || code === 'ja' || code === 'ko' || code === 'ar' ? code : 'en'
}

const RECOVERY_COPY: Record<Exclude<Language, 'en'> | 'en', string> = {
  en: 'I found current sources for this request, but a temporary processing error prevented me from turning them into a verified answer. The sources were saved with this turn; please try again shortly.',
  es: 'Encontré fuentes actuales para esta solicitud, pero un error temporal de procesamiento impidió convertirlas en una respuesta verificada. Las fuentes se guardaron con este turno; inténtalo de nuevo en breve.',
  pt: 'Encontrei fontes atuais para este pedido, mas um erro temporário de processamento impediu que eu as transformasse em uma resposta verificada. As fontes foram guardadas neste turno; tente novamente em breve.',
  pl: 'Znalazłem aktualne źródła dla tego pytania, ale tymczasowy błąd przetwarzania uniemożliwił przygotowanie zweryfikowanej odpowiedzi. Źródła zapisano w tym turnie; spróbuj ponownie za chwilę.',
  ru: 'Я нашёл актуальные источники по этому запросу, но временная ошибка обработки не позволила подготовить проверенный ответ. Источники сохранены в этом ходе; попробуйте немного позже.',
  de: 'Ich habe aktuelle Quellen für diese Anfrage gefunden, aber ein vorübergehender Verarbeitungsfehler hat verhindert, dass ich daraus eine verifizierte Antwort erstelle. Die Quellen wurden mit diesem Durchgang gespeichert; bitte versuchen Sie es in Kürze erneut.',
  fr: 'J’ai trouvé des sources récentes pour cette demande, mais une erreur de traitement temporaire m’a empêché d’en tirer une réponse vérifiée. Les sources ont été enregistrées avec ce tour ; veuillez réessayer dans un instant.',
  it: 'Ho trovato fonti aggiornate per questa richiesta, ma un errore temporaneo di elaborazione mi ha impedito di trasformarle in una risposta verificata. Le fonti sono state salvate con questo turno; riprova tra poco.',
  ja: 'このリクエストに関する最新の情報源は見つかりましたが、一時的な処理エラーにより検証済みの回答を作成できませんでした。情報源はこのターンに保存されています。しばらくしてからもう一度お試しください。',
  ko: '이 요청에 대한 최신 출처를 찾았지만, 일시적인 처리 오류로 인해 검증된 답변으로 만들지 못했습니다. 출처는 이번 턴에 저장되었습니다. 잠시 후 다시 시도하세요.',
  ar: 'عثرتُ على مصادر حديثة لهذا الطلب، لكن خطأ مؤقتًا في المعالجة حال دون تحويلها إلى إجابة موثقة. حُفظت المصادر مع هذه الجولة؛ يُرجى المحاولة مرة أخرى بعد قليل.',
}

const UNGROUNDED_COPY: Record<Exclude<Language, 'en'> | 'en', string> = {
  en: 'I found current sources, but the drafted answer did not meet the verification requirement, so I am not making the claim. The recorded sources remain available for this turn.',
  es: 'Encontré fuentes actuales, pero el borrador de respuesta no cumplió el requisito de verificación, por lo que no haré la afirmación. Las fuentes registradas siguen disponibles para este turno.',
  pt: 'Encontrei fontes atuais, mas o rascunho da resposta não cumpriu o requisito de verificação, então não farei a afirmação. As fontes registradas continuam disponíveis neste turno.',
  pl: 'Znalazłem aktualne źródła, ale projekt odpowiedzi nie spełnił wymogu weryfikacji, więc nie podaję tego twierdzenia. Zapisane źródła pozostają dostępne dla tego turnu.',
  ru: 'Я нашёл актуальные источники, но черновой ответ не выполнил требование проверки, поэтому я не делаю это утверждение. Записанные источники остаются доступными для этого хода.',
  de: 'Ich habe aktuelle Quellen gefunden, aber die entworfene Antwort hat die Verifizierungsanforderung nicht erfüllt, daher stelle ich die Behauptung nicht auf. Die erfassten Quellen bleiben für diesen Durchgang verfügbar.',
  fr: 'J’ai trouvé des sources récentes, mais la réponse rédigée ne satisfaisait pas l’exigence de vérification ; je ne formule donc pas cette affirmation. Les sources enregistrées restent disponibles pour ce tour.',
  it: 'Ho trovato fonti aggiornate, ma la bozza di risposta non soddisfaceva il requisito di verifica, quindi non faccio questa affermazione. Le fonti registrate restano disponibili per questo turno.',
  ja: '最新の情報源は見つかりましたが、作成した回答が検証要件を満たさなかったため、その主張は行いません。記録された情報源はこのターンで引き続き利用できます。',
  ko: '최신 출처를 찾았지만 작성된 답변이 검증 요건을 충족하지 못해 해당 주장을 하지 않습니다. 기록된 출처는 이번 턴에서 계속 사용할 수 있습니다.',
  ar: 'عثرتُ على مصادر حديثة، لكن مسودة الإجابة لم تستوفِ متطلب التحقق، لذا لن أطرح هذا الادعاء. تظل المصادر المسجلة متاحة لهذه الجولة.',
}

export function freshFailureReply(code: FreshEvidenceInternalFailureCode, language?: string | null): string | null {
  const publicCode = publicFreshFailureCode(code)
  if (publicCode === 'insufficient_live_authority') return null
  return publicCode === 'local_synthesis_failed'
    ? RECOVERY_COPY[languageOf(language)]
    : UNGROUNDED_COPY[languageOf(language)]
}
